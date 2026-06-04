import "dotenv/config";

export const defaultReportingMonth = process.env.DEFAULT_REPORTING_MONTH || "2026-05";
export const httpPort = Number(process.env.PORT || process.env.MCP_HTTP_PORT || 8787);

function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function defaultPublicBaseUrl(): string {
  if (process.env.PUBLIC_BASE_URL) {
    return cleanBaseUrl(process.env.PUBLIC_BASE_URL);
  }
  if (process.env.VERCEL_URL) {
    return cleanBaseUrl(`https://${process.env.VERCEL_URL}`);
  }
  return `http://localhost:${httpPort}`;
}

export const publicBaseUrl = defaultPublicBaseUrl();
export const oauthIssuer = cleanBaseUrl(process.env.OAUTH_ISSUER || publicBaseUrl);
export const jwtSecret = process.env.AUTH_JWT_SECRET || "dev-only-change-this-secret";
export const accessTokenTtlSeconds = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 60 * 60);
export const embeddingModel = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
export const embeddingDimensions = Number(process.env.EMBEDDING_DIMENSIONS || 1536);

export function demoActorSwitchEnabled(): boolean {
  return process.env.MCP_ALLOW_DEMO_ACTOR_SWITCH === "true";
}
