import "./config.js";

import pg from "pg";

import type { Company } from "./auth.js";

const { Pool } = pg;

const pools = new Map<Company, pg.Pool>();

function sslFor(connectionString: string): pg.PoolConfig["ssl"] {
  return connectionString.includes("sslmode=require") || connectionString.includes(".neon.tech")
    ? { rejectUnauthorized: false }
    : undefined;
}

function deriveDatabaseUrl(company: Company): string {
  const explicit = company === "deep" ? process.env.DEEP_DATABASE_URL : process.env.POOJAN_DATABASE_URL;
  if (explicit) {
    return explicit;
  }

  const adminUrl = process.env.NEON_ADMIN_DATABASE_URL;
  if (!adminUrl) {
    throw new Error(
      `Missing ${company === "deep" ? "DEEP_DATABASE_URL" : "POOJAN_DATABASE_URL"} or NEON_ADMIN_DATABASE_URL.`
    );
  }

  const url = new URL(adminUrl);
  url.pathname = `/${company === "deep" ? "deep_crm" : "poojan_crm"}`;
  return url.toString();
}

export function poolFor(company: Company): pg.Pool {
  const existing = pools.get(company);
  if (existing) {
    return existing;
  }

  const connectionString = deriveDatabaseUrl(company);
  const pool = new Pool({
    connectionString,
    ssl: sslFor(connectionString),
    max: 5
  });
  pools.set(company, pool);
  return pool;
}

export async function queryRows<T extends Record<string, unknown>>(
  company: Company,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await poolFor(company).query<T>(sql, params);
  return result.rows;
}

export async function closePools(): Promise<void> {
  await Promise.all([...pools.values()].map((pool) => pool.end()));
}
