import { randomUUID } from "node:crypto";
import tls from "node:tls";

import { gmailAppPassword, gmailUser, taskNotificationFromEmail } from "./config.js";

export type TaskAssignmentEmailInput = {
  to: string;
  employeeName: string;
  taskCode: string;
  taskTitle: string;
  taskDescription: string;
  clientCode: string;
  clientName: string;
  dueDate: string;
  priority: string;
  assignedBy: string;
};

export type EmailNotificationStatus =
  | {
      enabled: false;
      sent: false;
      provider: "gmail-smtp";
      to: string;
      reason: string;
    }
  | {
      enabled: true;
      sent: true;
      provider: "gmail-smtp";
      to: string;
    }
  | {
      enabled: true;
      sent: false;
      provider: "gmail-smtp";
      to: string;
      reason: string;
    };

type SmtpResponse = {
  code: number;
  lines: string[];
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stripHeaderBreaks(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value: string): string {
  const safeValue = stripHeaderBreaks(value);
  return /^[\x20-\x7e]*$/.test(safeValue) ? safeValue : `=?UTF-8?B?${Buffer.from(safeValue).toString("base64")}?=`;
}

function parseEmailAddress(value: string): string {
  const angleMatch = /<([^>]+)>/.exec(value);
  return stripHeaderBreaks(angleMatch?.[1] || value);
}

function dotStuff(value: string): string {
  return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

function taskAssignmentText(input: TaskAssignmentEmailInput): string {
  return [
    `Hi ${input.employeeName},`,
    "",
    `A new CRM task has been assigned to you by ${input.assignedBy}.`,
    "",
    `Task: ${input.taskTitle}`,
    `Task code: ${input.taskCode}`,
    `Client: ${input.clientName} (${input.clientCode})`,
    `Priority: ${input.priority}`,
    `Due date: ${input.dueDate}`,
    "",
    input.taskDescription,
    "",
    "Please review it in the CRM."
  ].join("\n");
}

function taskAssignmentHtml(input: TaskAssignmentEmailInput): string {
  return `
    <div style="font-family: Inter, Arial, sans-serif; color: #11100f; line-height: 1.5;">
      <p>Hi ${escapeHtml(input.employeeName)},</p>
      <p>A new CRM task has been assigned to you by <strong>${escapeHtml(input.assignedBy)}</strong>.</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 4px 12px 4px 0; color: #615d59;">Task</td><td><strong>${escapeHtml(input.taskTitle)}</strong></td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #615d59;">Task code</td><td>${escapeHtml(input.taskCode)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #615d59;">Client</td><td>${escapeHtml(input.clientName)} (${escapeHtml(input.clientCode)})</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #615d59;">Priority</td><td>${escapeHtml(input.priority)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #615d59;">Due date</td><td>${escapeHtml(input.dueDate)}</td></tr>
      </table>
      <p>${escapeHtml(input.taskDescription)}</p>
      <p>Please review it in the CRM.</p>
    </div>
  `;
}

function buildMessage(input: TaskAssignmentEmailInput): string {
  const boundary = `crm-${randomUUID()}`;
  const subject = `New CRM task assigned: ${input.taskTitle}`;
  const from = taskNotificationFromEmail || gmailUser;
  const text = taskAssignmentText(input);
  const html = taskAssignmentHtml(input);

  return [
    `From: ${encodeHeader(from)}`,
    `To: ${encodeHeader(input.to)}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`,
    ""
  ].join("\r\n");
}

async function readSmtpResponse(socket: tls.TLSSocket): Promise<SmtpResponse> {
  let buffer = "";

  return new Promise((resolve, reject) => {
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const lastLine = lines.at(-1);
      const match = /^(\d{3}) /.exec(lastLine || "");
      if (!match) {
        return;
      }

      cleanup();
      resolve({
        code: Number(match[1]),
        lines
      });
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };

    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function smtpCommand(socket: tls.TLSSocket, command: string, expectedCodes: number[]): Promise<SmtpResponse> {
  socket.write(`${command}\r\n`);
  const response = await readSmtpResponse(socket);
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP command failed (${command.split(" ")[0]}): ${response.lines.join(" ")}`);
  }
  return response;
}

async function sendViaGmailSmtp(input: TaskAssignmentEmailInput): Promise<void> {
  const host = "smtp.gmail.com";
  const socket = tls.connect({
    host,
    port: 465,
    servername: host
  });

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", resolve);
      socket.once("error", reject);
    });

    await readSmtpResponse(socket);
    await smtpCommand(socket, "EHLO crm-mcp.local", [250]);
    await smtpCommand(socket, "AUTH LOGIN", [334]);
    await smtpCommand(socket, Buffer.from(gmailUser).toString("base64"), [334]);
    await smtpCommand(socket, Buffer.from(gmailAppPassword).toString("base64"), [235]);
    await smtpCommand(socket, `MAIL FROM:<${parseEmailAddress(taskNotificationFromEmail || gmailUser)}>`, [250]);
    await smtpCommand(socket, `RCPT TO:<${parseEmailAddress(input.to)}>`, [250, 251]);
    await smtpCommand(socket, "DATA", [354]);
    socket.write(`${dotStuff(buildMessage(input))}\r\n.\r\n`);
    const dataResponse = await readSmtpResponse(socket);
    if (dataResponse.code !== 250) {
      throw new Error(`SMTP DATA failed: ${dataResponse.lines.join(" ")}`);
    }
    await smtpCommand(socket, "QUIT", [221]);
  } finally {
    socket.destroy();
  }
}

export async function sendTaskAssignmentEmail(input: TaskAssignmentEmailInput): Promise<EmailNotificationStatus> {
  if (!gmailUser || !gmailAppPassword) {
    return {
      enabled: false,
      sent: false,
      provider: "gmail-smtp",
      to: input.to,
      reason: "Set GMAIL_USER and GMAIL_APP_PASSWORD to enable task assignment emails."
    };
  }

  try {
    await sendViaGmailSmtp(input);
    return {
      enabled: true,
      sent: true,
      provider: "gmail-smtp",
      to: input.to
    };
  } catch (error) {
    return {
      enabled: true,
      sent: false,
      provider: "gmail-smtp",
      to: input.to,
      reason: error instanceof Error ? error.message : "Email delivery failed."
    };
  }
}
