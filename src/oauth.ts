import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

import { assertManagerLoginAllowed } from "./access-control.js";
import { getActorById, type Actor } from "./auth.js";
import { accessTokenTtlSeconds, jwtSecret, oauthIssuer, publicBaseUrl } from "./config.js";

export const allScopes = [
  "crm:read",
  "tasks:write",
  "attendance:read",
  "salary:calculate",
  "payroll:read",
  "access:admin"
] as const;

export type OAuthCodeRecord = {
  code: string;
  actorId: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  scope: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  expiresAt: number;
};

type TokenClaims = {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  scope: string;
  client_id: string;
  actorId: string;
  role: Actor["role"];
  company?: string;
  teamCode?: string;
  token_use: "access" | "web_session";
};

const authorizationCodes = new Map<string, OAuthCodeRecord>();

const demoUsers = [
  {
    actorId: "deep_ceo",
    label: "CEO Deep",
    email: process.env.DEEP_CEO_EMAIL || "deep.ceo@crm.example",
    password: process.env.DEEP_CEO_PASSWORD || "deep-ceo-pass"
  },
  {
    actorId: "poojan_ceo",
    label: "CEO Poojan",
    email: process.env.POOJAN_CEO_EMAIL || "poojan.ceo@crm.example",
    password: process.env.POOJAN_CEO_PASSWORD || "poojan-ceo-pass"
  },
  {
    actorId: "deep_sales_manager",
    label: "Deep Sales Manager",
    email: process.env.DEEP_SALES_MANAGER_EMAIL || "deep.sales.manager@crm.example",
    password: process.env.DEEP_SALES_MANAGER_PASSWORD || "manager-pass"
  },
  {
    actorId: "deep_support_manager",
    label: "Deep Support Manager",
    email: process.env.DEEP_SUPPORT_MANAGER_EMAIL || "deep.support.manager@crm.example",
    password: process.env.DEEP_SUPPORT_MANAGER_PASSWORD || "manager-pass"
  },
  {
    actorId: "poojan_growth_manager",
    label: "Poojan Growth Manager",
    email: process.env.POOJAN_GROWTH_MANAGER_EMAIL || "poojan.growth.manager@crm.example",
    password: process.env.POOJAN_GROWTH_MANAGER_PASSWORD || "manager-pass"
  },
  {
    actorId: "poojan_delivery_manager",
    label: "Poojan Delivery Manager",
    email: process.env.POOJAN_DELIVERY_MANAGER_EMAIL || "poojan.delivery.manager@crm.example",
    password: process.env.POOJAN_DELIVERY_MANAGER_PASSWORD || "manager-pass"
  }
];

export function listDemoLoginEmails(): Array<{ email: string; label: string }> {
  return demoUsers.map(({ email, label }) => ({ email, label }));
}

export function defaultScopeForActor(actor: Actor): string {
  if (actor.role === "ceo") {
    return allScopes.join(" ");
  }
  return ["crm:read", "tasks:write", "attendance:read", "salary:calculate"].join(" ");
}

export async function verifyDemoCredentials(email: string, password: string): Promise<Actor> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = demoUsers.find((candidate) => candidate.email.toLowerCase() === normalizedEmail);
  if (!user || user.password !== password) {
    throw new Error("Invalid login credentials.");
  }

  const actor = getActorById(user.actorId);
  await assertManagerLoginAllowed(actor);
  return actor;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): string {
  return createHmac("sha256", jwtSecret).update(data).digest("base64url");
}

function signJwt(claims: TokenClaims): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify(claims));
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

function parseAndVerifyJwt(token: string): TokenClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format.");
  }

  const [header, payload, signature] = parts;
  const expected = sign(`${header}.${payload}`);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error("Invalid token signature.");
  }

  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenClaims;
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now) {
    throw new Error("Token has expired.");
  }
  if (claims.iss !== oauthIssuer) {
    throw new Error("Token issuer mismatch.");
  }
  return claims;
}

function claimsFor(actor: Actor, clientId: string, audience: string, scope: string, tokenUse: TokenClaims["token_use"]): TokenClaims {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: oauthIssuer,
    aud: audience,
    sub: actor.id,
    iat: now,
    exp: now + accessTokenTtlSeconds,
    scope,
    client_id: clientId,
    actorId: actor.id,
    role: actor.role,
    company: actor.company,
    teamCode: actor.teamCode,
    token_use: tokenUse
  };
}

export function issueAccessToken(actor: Actor, clientId: string, resource: string, scope: string): string {
  return signJwt(claimsFor(actor, clientId, resource, scope, "access"));
}

export function issueWebSession(actor: Actor): string {
  return signJwt(claimsFor(actor, "crm-web", `${publicBaseUrl}/web`, defaultScopeForActor(actor), "web_session"));
}

export function verifyWebSession(token: string): Actor {
  const claims = parseAndVerifyJwt(token);
  if (claims.token_use !== "web_session" || claims.aud !== `${publicBaseUrl}/web`) {
    throw new Error("Invalid web session.");
  }
  return getActorById(claims.actorId);
}

export function verifyMcpAccessToken(token: string, expectedResource: string): AuthInfo {
  const claims = parseAndVerifyJwt(token);
  if (claims.token_use !== "access") {
    throw new Error("Invalid access token use.");
  }
  if (claims.aud !== expectedResource) {
    throw new Error("Access token audience mismatch.");
  }

  return {
    token,
    clientId: claims.client_id,
    scopes: claims.scope.split(" ").filter(Boolean),
    expiresAt: claims.exp,
    resource: new URL(claims.aud),
    extra: {
      actorId: claims.actorId,
      role: claims.role,
      company: claims.company,
      teamCode: claims.teamCode
    }
  };
}

export function createAuthorizationCode(record: Omit<OAuthCodeRecord, "code" | "expiresAt">): string {
  const code = randomBytes(32).toString("base64url");
  authorizationCodes.set(code, {
    ...record,
    code,
    expiresAt: Date.now() + 5 * 60 * 1000
  });
  return code;
}

export function consumeAuthorizationCode(code: string): OAuthCodeRecord {
  const record = authorizationCodes.get(code);
  authorizationCodes.delete(code);
  if (!record) {
    throw new Error("Invalid or already-used authorization code.");
  }
  if (record.expiresAt < Date.now()) {
    throw new Error("Authorization code has expired.");
  }
  return record;
}

export function assertPkce(record: OAuthCodeRecord, codeVerifier?: string): void {
  if (!record.codeChallenge) {
    return;
  }
  if (!codeVerifier) {
    throw new Error("Missing PKCE code_verifier.");
  }

  if (record.codeChallengeMethod && record.codeChallengeMethod !== "S256") {
    throw new Error("Only S256 PKCE is supported.");
  }

  const expected = createHash("sha256").update(codeVerifier).digest("base64url");
  if (expected !== record.codeChallenge) {
    throw new Error("Invalid PKCE verifier.");
  }
}
