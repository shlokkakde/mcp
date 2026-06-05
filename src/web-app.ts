import "./config.js";

import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import {
  assertManagerLoginAllowed,
  listManagerPolicies,
  loadManagerPolicy,
  updateManagerPolicy,
  type ManagerAccessPatch
} from "./access-control.js";
import { assertCeo, companies, getActorById, type Actor, type Company } from "./auth.js";
import { accessTokenTtlSeconds, oauthIssuer, publicBaseUrl } from "./config.js";
import { createCrmMcpServer } from "./mcp-server.js";
import {
  allScopes,
  assertPkce,
  consumeAuthorizationCode,
  createAuthorizationCode,
  defaultScopeForActor,
  issueAccessToken,
  issueWebSession,
  listDemoLoginEmails,
  verifyDemoCredentials,
  verifyMcpAccessToken,
  verifyWebSession
} from "./oauth.js";

const mcpResource = `${publicBaseUrl}/mcp`;
const protectedResourceMetadataUrl = `${publicBaseUrl}/.well-known/oauth-protected-resource`;
export const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "1mb" }));

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header?.split(";") || []) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) {
      continue;
    }
    cookies[rawKey] = decodeURIComponent(rawValue.join("="));
  }
  return cookies;
}

function redirectWithError(res: Response, path: string, message: string): void {
  res.redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

function currentWebActor(req: Request): Actor | null {
  const token = parseCookies(req.headers.cookie).crm_session;
  if (!token) {
    return null;
  }
  try {
    return verifyWebSession(token);
  } catch {
    return null;
  }
}

function requireWebActor(req: Request, res: Response, next: NextFunction): void {
  const actor = currentWebActor(req);
  if (!actor) {
    res.redirect(`/login?return_to=${encodeURIComponent(req.originalUrl)}`);
    return;
  }
  res.locals.actor = actor;
  next();
}

function requireMcpBearer(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    sendAuthChallenge(res, "invalid_token", "Login required to use the CRM MCP server.");
    return;
  }

  try {
    const authInfo = verifyMcpAccessToken(token, mcpResource);
    (req as Request & { auth?: AuthInfo }).auth = authInfo;
    next();
  } catch (error) {
    sendAuthChallenge(res, "invalid_token", error instanceof Error ? error.message : "Invalid access token.");
  }
}

function sendAuthChallenge(res: Response, error: string, description: string): void {
  res
    .status(401)
    .set(
      "WWW-Authenticate",
      `Bearer resource_metadata="${protectedResourceMetadataUrl}", error="${error}", error_description="${description}"`
    )
    .json({
      error,
      error_description: description
    });
}

function authHiddenFields(req: Request): string {
  const fields = {
    response_type: req.query.response_type,
    client_id: req.query.client_id,
    redirect_uri: req.query.redirect_uri,
    state: req.query.state,
    scope: req.query.scope,
    resource: req.query.resource,
    code_challenge: req.query.code_challenge,
    code_challenge_method: req.query.code_challenge_method
  };

  return Object.entries(fields)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => `<input type="hidden" name="${key}" value="${escapeHtml(value)}">`)
    .join("\n");
}

function renderLoginPage(options: {
  title: string;
  action: string;
  hiddenFields?: string;
  error?: string;
  returnTo?: string;
}): string {
  const returnTo = options.returnTo ? `<input type="hidden" name="return_to" value="${escapeHtml(options.returnTo)}">` : "";
  const demoEmails = listDemoLoginEmails()
    .map((user) => `<span>${escapeHtml(user.label)} <code>${escapeHtml(user.email)}</code></span>`)
    .join("");

  return page(
    options.title,
    `
      <section class="panel auth-panel">
        <p class="eyebrow">Secure CRM access</p>
        <h1>${escapeHtml(options.title)}</h1>
        <p class="muted">Sign in as a CEO or manager. Your session controls which CRM records and tools are available.</p>
        ${options.error ? `<div class="notice error">${escapeHtml(options.error)}</div>` : ""}
        <form class="auth-form" method="post" action="${escapeHtml(options.action)}">
          ${options.hiddenFields || ""}
          ${returnTo}
          <label class="field">
            Email
            <input name="email" type="email" required autocomplete="username" placeholder="name@company.com">
          </label>
          <label class="field">
            Password
            <input name="password" type="password" required autocomplete="current-password">
          </label>
          <button type="submit">Sign in</button>
        </form>
        <div class="demo-box">
          <p class="hint-title">Demo emails</p>
          <div class="demo-list">${demoEmails}</div>
          <p class="hint">CEO passwords use <code>deep-ceo-pass</code> or <code>poojan-ceo-pass</code>. Managers use <code>manager-pass</code>.</p>
        </div>
      </section>
    `
  );
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --canvas: #f6f5f4;
      --surface: #ffffff;
      --surface-soft: #fbfaf9;
      --ink: #11100f;
      --ink-secondary: #31302e;
      --muted: #615d59;
      --faint: #a39e98;
      --hairline: #e6e6e6;
      --primary: #0075de;
      --primary-active: #005bab;
      --danger: #a12626;
      --danger-surface: #fff5f5;
      --danger-line: #efc3c3;
      --focus: rgba(0, 117, 222, 0.16);
      --shadow-soft:
        rgba(0, 0, 0, 0.01) 0 1px 2px,
        rgba(0, 0, 0, 0.02) 0 4px 12px,
        rgba(0, 0, 0, 0.04) 0 12px 30px;
      --shadow-elevated:
        rgba(0, 0, 0, 0.03) 0 8px 24px,
        rgba(0, 0, 0, 0.05) 0 24px 56px;
    }
    * { box-sizing: border-box; }
    html { background: var(--canvas); }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0) 360px),
        var(--canvas);
      color: var(--ink);
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
    }
    main {
      width: min(1180px, calc(100% - 48px));
      margin: 0 auto;
      padding: 34px 0 56px;
    }
    .panel {
      background: var(--surface);
      border: 1px solid var(--hairline);
      border-radius: 12px;
      padding: 24px;
      box-shadow: var(--shadow-soft);
    }
    .auth-panel {
      max-width: 448px;
      margin: 8vh auto 0;
      padding: 32px;
    }
    .home-panel {
      max-width: 680px;
      margin-top: 8vh;
    }
    h1, h2 {
      margin: 0 0 10px;
      letter-spacing: 0;
      line-height: 1.12;
    }
    h1 {
      font-size: 34px;
      font-weight: 750;
    }
    h2 {
      font-size: 20px;
      font-weight: 700;
    }
    h3 {
      margin: 0 0 6px;
      font-size: 17px;
      line-height: 1.25;
      letter-spacing: 0;
    }
    p { margin: 0 0 14px; }
    .muted, .hint {
      color: var(--muted);
      line-height: 1.5;
    }
    .hint { font-size: 13px; }
    .eyebrow,
    .hint-title {
      margin: 0 0 10px;
      color: var(--primary);
      font-size: 12px;
      font-weight: 700;
      line-height: 1.33;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .hint-title {
      color: var(--ink-secondary);
      text-transform: none;
    }
    form { margin: 0; }
    .auth-form {
      display: grid;
      gap: 14px;
      margin-top: 22px;
    }
    .field {
      display: grid;
      gap: 7px;
      color: var(--ink-secondary);
      font-size: 14px;
      font-weight: 650;
    }
    input, select {
      min-height: 40px;
      border: 1px solid #dddddd;
      border-radius: 4px;
      padding: 6px 10px;
      font: inherit;
      background: var(--surface);
      color: var(--ink);
      outline: none;
    }
    input:focus, select:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 4px var(--focus), var(--shadow-soft);
    }
    button, .button {
      min-height: 40px;
      border: 0;
      border-radius: 9999px;
      padding: 9px 18px;
      font: inherit;
      font-weight: 600;
      color: #fff;
      background: var(--primary);
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1.35;
      transition: background 120ms ease, transform 120ms ease, box-shadow 120ms ease;
    }
    button:active, .button:active {
      background: var(--primary-active);
      transform: scale(0.98);
    }
    button:focus-visible, .button:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 2px;
    }
    .button.secondary, button.secondary {
      background: var(--surface);
      border: 1px solid var(--hairline);
      color: var(--ink);
      box-shadow: var(--shadow-soft);
    }
    .notice {
      border-radius: 8px;
      padding: 10px 12px;
      margin: 14px 0;
      border: 1px solid var(--hairline);
      background: var(--surface-soft);
    }
    .error {
      color: var(--danger);
      border-color: var(--danger-line);
      background: var(--danger-surface);
    }
    .demo-box {
      margin-top: 20px;
      padding-top: 18px;
      border-top: 1px solid var(--hairline);
    }
    .demo-list {
      display: grid;
      gap: 8px;
      margin-bottom: 12px;
    }
    .demo-list span {
      display: flex;
      min-height: 34px;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border: 1px solid var(--hairline);
      border-radius: 8px;
      padding: 7px 9px;
      background: var(--surface-soft);
      color: var(--ink-secondary);
      font-size: 13px;
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: flex-start;
      margin-bottom: 24px;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--hairline);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
      align-items: start;
    }
    .company-panel {
      display: grid;
      gap: 16px;
      box-shadow: none;
    }
    .company-panel .grid {
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }
    .manager-card {
      display: grid;
      gap: 16px;
      border: 1px solid var(--hairline);
      border-radius: 12px;
      padding: 18px;
      background: var(--surface);
    }
    .manager-card__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .status-pill {
      flex: 0 0 auto;
      border: 1px solid var(--hairline);
      border-radius: 9999px;
      padding: 4px 8px;
      background: var(--surface-soft);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      line-height: 1.25;
    }
    .status-pill.is-active {
      border-color: #d6eedc;
      background: #eef8f1;
      color: #14783d;
    }
    .status-pill.is-revoked {
      border-color: var(--danger-line);
      background: var(--danger-surface);
      color: var(--danger);
    }
    .check-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 8px;
    }
    .check-grid label {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 38px;
      border: 1px solid var(--hairline);
      border-radius: 8px;
      padding: 8px 10px;
      background: var(--surface-soft);
      color: var(--ink-secondary);
      font-size: 13px;
      font-weight: 600;
    }
    .check-grid input {
      min-height: auto;
      width: 16px;
      height: 16px;
      margin: 0;
      accent-color: var(--primary);
    }
    .manager-card button {
      justify-self: start;
      min-height: 38px;
      padding-inline: 16px;
    }
    code {
      background: #f1f0ef;
      border-radius: 4px;
      padding: 2px 5px;
      color: var(--ink-secondary);
      font-size: 0.95em;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      color: var(--ink-secondary);
      font: 13px/1.5 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
    }
    @media (max-width: 680px) {
      main {
        width: min(100% - 24px, 1180px);
        padding: 18px 0 34px;
      }
      .panel,
      .auth-panel {
        padding: 20px;
      }
      .auth-panel,
      .home-panel {
        margin-top: 24px;
      }
      h1 { font-size: 28px; }
      .topbar {
        flex-direction: column;
        align-items: stretch;
      }
      .topbar button,
      .button,
      .manager-card button {
        width: 100%;
      }
      .manager-card__header {
        display: grid;
      }
      .status-pill {
        justify-self: start;
      }
      .demo-list span {
        align-items: flex-start;
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
}

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: mcpResource,
    authorization_servers: [oauthIssuer],
    scopes_supported: allScopes,
    resource_documentation: `${publicBaseUrl}/`
  });
});

app.get(["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"], (_req, res) => {
  res.json({
    issuer: oauthIssuer,
    authorization_endpoint: `${publicBaseUrl}/authorize`,
    token_endpoint: `${publicBaseUrl}/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: allScopes,
    client_id_metadata_document_supported: true
  });
});

app.get("/", (_req, res) => {
  res.send(
    page(
      "CRM MCP Auth",
      `
        <section class="panel home-panel">
          <p class="eyebrow">CRM MCP server</p>
          <h1>CRM MCP Auth</h1>
          <p class="muted">HTTP MCP endpoint: <code>${escapeHtml(mcpResource)}</code></p>
          <p><a class="button" href="/login">Open Login</a></p>
        </section>
      `
    )
  );
});

app.get("/login", (req, res) => {
  res.send(
    renderLoginPage({
      title: "CRM Sign In",
      action: "/login",
      error: typeof req.query.error === "string" ? req.query.error : undefined,
      returnTo: typeof req.query.return_to === "string" ? req.query.return_to : undefined
    })
  );
});

app.post("/login", async (req, res) => {
  try {
    const actor = await verifyDemoCredentials(String(req.body.email || ""), String(req.body.password || ""));
    const token = issueWebSession(actor);
    res.cookie("crm_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: publicBaseUrl.startsWith("https://"),
      path: "/"
    });
    res.redirect(typeof req.body.return_to === "string" && req.body.return_to ? req.body.return_to : "/admin");
  } catch (error) {
    redirectWithError(res, "/login", error instanceof Error ? error.message : "Login failed.");
  }
});

app.post("/logout", (_req, res) => {
  res.clearCookie("crm_session", { path: "/" });
  res.redirect("/login");
});

app.get("/authorize", (req, res) => {
  res.send(
    renderLoginPage({
      title: "Authorize CRM MCP",
      action: "/authorize",
      hiddenFields: authHiddenFields(req),
      error: typeof req.query.error === "string" ? req.query.error : undefined
    })
  );
});

app.post("/authorize", async (req, res) => {
  try {
    if (req.body.response_type !== "code") {
      throw new Error("Only authorization-code flow is supported.");
    }
    const actor = await verifyDemoCredentials(String(req.body.email || ""), String(req.body.password || ""));
    const redirectUri = String(req.body.redirect_uri || "");
    const clientId = String(req.body.client_id || "");
    if (!redirectUri || !clientId) {
      throw new Error("Missing redirect_uri or client_id.");
    }

    const resource = String(req.body.resource || mcpResource);
    const scope = String(req.body.scope || defaultScopeForActor(actor));
    const code = createAuthorizationCode({
      actorId: actor.id,
      clientId,
      redirectUri,
      resource,
      scope,
      codeChallenge: req.body.code_challenge || undefined,
      codeChallengeMethod: req.body.code_challenge_method || undefined
    });

    const redirectTarget = new URL(redirectUri);
    redirectTarget.searchParams.set("code", code);
    if (req.body.state) {
      redirectTarget.searchParams.set("state", String(req.body.state));
    }
    res.redirect(redirectTarget.toString());
  } catch (error) {
    const params = new URLSearchParams();
    for (const key of [
      "response_type",
      "client_id",
      "redirect_uri",
      "state",
      "scope",
      "resource",
      "code_challenge",
      "code_challenge_method"
    ]) {
      if (req.body[key]) {
        params.set(key, String(req.body[key]));
      }
    }
    params.set("error", error instanceof Error ? error.message : "Authorization failed.");
    res.redirect(`/authorize?${params.toString()}`);
  }
});

app.post("/token", async (req, res) => {
  try {
    if (req.body.grant_type !== "authorization_code") {
      throw new Error("Only authorization_code grant is supported.");
    }

    const record = consumeAuthorizationCode(String(req.body.code || ""));
    if (record.redirectUri !== req.body.redirect_uri) {
      throw new Error("redirect_uri mismatch.");
    }
    if (record.clientId !== req.body.client_id) {
      throw new Error("client_id mismatch.");
    }
    assertPkce(record, req.body.code_verifier);

    const actualActor = getActorById(record.actorId);
    await assertManagerLoginAllowed(actualActor);
    const accessToken = issueAccessToken(actualActor, record.clientId, record.resource, record.scope);

    res.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: accessTokenTtlSeconds,
      scope: record.scope
    });
  } catch (error) {
    res.status(400).json({
      error: "invalid_grant",
      error_description: error instanceof Error ? error.message : "Token exchange failed."
    });
  }
});

app.get("/admin", requireWebActor, async (req, res) => {
  const actor = res.locals.actor as Actor;

  if (actor.role !== "ceo") {
    const policy = actor.company ? await loadManagerPolicy(actor.company, actor.id) : null;
    res.send(
      page(
        "My CRM Access",
        `
          <div class="topbar">
            <div>
              <h1>My CRM Access</h1>
              <p class="muted">${escapeHtml(actor.name)} ${policy?.active ? "has active access." : "is currently revoked."}</p>
            </div>
            <form method="post" action="/logout"><button class="secondary" type="submit">Sign out</button></form>
          </div>
          <section class="panel"><pre>${escapeHtml(JSON.stringify(policy, null, 2))}</pre></section>
        `
      )
    );
    return;
  }

  const sections = [];
  for (const company of companies) {
    const policies = await listManagerPolicies(company);
    const cards = policies.map((policy) => renderManagerPolicyForm(company, policy)).join("");
    sections.push(`
      <section class="panel company-panel">
        <h2>${escapeHtml(company)} manager access</h2>
        <div class="grid">${cards}</div>
      </section>
    `);
  }

  res.send(
    page(
      "CEO Manager Access",
      `
        <div class="topbar">
          <div>
            <h1>CEO Manager Access</h1>
            <p class="muted">Signed in as ${escapeHtml(actor.name)}. Changes take effect on the next MCP tool call.</p>
          </div>
          <form method="post" action="/logout"><button class="secondary" type="submit">Sign out</button></form>
        </div>
        <div class="grid company-grid">${sections.join("")}</div>
      `
    )
  );
});

function checkbox(name: keyof ManagerAccessPatch, checked: boolean, label: string): string {
  return `<label><input type="checkbox" name="${name}" ${checked ? "checked" : ""}> <span>${escapeHtml(label)}</span></label>`;
}

function renderManagerPolicyForm(company: Company, policy: Awaited<ReturnType<typeof listManagerPolicies>>[number]): string {
  return `
    <form class="manager-card" method="post" action="/admin/access">
      <input type="hidden" name="company" value="${escapeHtml(company)}">
      <input type="hidden" name="manager_actor_id" value="${escapeHtml(policy.actor_id)}">
      <div class="manager-card__header">
        <div>
          <h3>${escapeHtml(policy.actor_name)}</h3>
          <p class="muted">${escapeHtml(policy.actor_id)} - ${escapeHtml(policy.team_code)}</p>
        </div>
        <span class="status-pill ${policy.active ? "is-active" : "is-revoked"}">${policy.active ? "Active" : "Revoked"}</span>
      </div>
      <div class="check-grid">
        ${checkbox("active", policy.active, "Active")}
        ${checkbox("can_view_clients", policy.can_view_clients, "View clients")}
        ${checkbox("can_view_contract_values", policy.can_view_contract_values, "View contract values")}
        ${checkbox("can_view_tasks", policy.can_view_tasks, "View tasks")}
        ${checkbox("can_write_tasks", policy.can_write_tasks, "Write tasks")}
        ${checkbox("can_view_attendance", policy.can_view_attendance, "View attendance")}
        ${checkbox("can_calculate_salary", policy.can_calculate_salary, "Calculate salary")}
      </div>
      <button type="submit">Save Access</button>
    </form>
  `;
}

app.post("/admin/access", requireWebActor, async (req, res) => {
  try {
    const actor = res.locals.actor as Actor;
    assertCeo(actor);
    const company = companies.find((candidate) => candidate === req.body.company);
    if (!company) {
      throw new Error("Invalid company.");
    }

    const patch: ManagerAccessPatch = {
      active: req.body.active === "on",
      can_view_clients: req.body.can_view_clients === "on",
      can_view_contract_values: req.body.can_view_contract_values === "on",
      can_view_tasks: req.body.can_view_tasks === "on",
      can_write_tasks: req.body.can_write_tasks === "on",
      can_view_attendance: req.body.can_view_attendance === "on",
      can_calculate_salary: req.body.can_calculate_salary === "on"
    };

    await updateManagerPolicy(company, actor, String(req.body.manager_actor_id), patch);
    res.redirect("/admin");
  } catch (error) {
    res
      .status(400)
      .send(page("Access Update Failed", `<section class="panel"><h1>Access Update Failed</h1><p>${escapeHtml(error instanceof Error ? error.message : "Unknown error")}</p><p><a class="button" href="/admin">Back</a></p></section>`));
  }
});

app.all("/mcp", requireMcpBearer, async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });
  const mcpServer = createCrmMcpServer();
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

export default app;
