import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATABASES = [
  { name: "deep_crm", seedFile: "seed-deep.sql" },
  { name: "poojan_crm", seedFile: "seed-poojan.sql" }
] as const;

function requireAdminUrl(): string {
  const url = process.env.NEON_ADMIN_DATABASE_URL;
  if (!url) {
    throw new Error("Set NEON_ADMIN_DATABASE_URL in .env before running npm run db:setup.");
  }
  return url;
}

function databaseUrl(adminUrl: string, databaseName: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function sslFor(connectionString: string): pg.ClientConfig["ssl"] {
  return connectionString.includes("sslmode=require") || connectionString.includes(".neon.tech")
    ? { rejectUnauthorized: false }
    : undefined;
}

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe database identifier: ${identifier}`);
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function withClient<T>(connectionString: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new Client({
    connectionString,
    ssl: sslFor(connectionString)
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function createDatabaseIfMissing(adminUrl: string, databaseName: string): Promise<void> {
  await withClient(adminUrl, async (client) => {
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
    if ((result.rowCount ?? 0) > 0) {
      console.log(`Database already exists: ${databaseName}`);
      return;
    }

    await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    console.log(`Created database: ${databaseName}`);
  });
}

async function runSqlFile(connectionString: string, fileName: string): Promise<void> {
  const sql = await readFile(path.join(ROOT, "sql", fileName), "utf8");
  await withClient(connectionString, async (client) => {
    await client.query(sql);
  });
  console.log(`Applied ${fileName}`);
}

async function main(): Promise<void> {
  const adminUrl = requireAdminUrl();

  for (const database of DATABASES) {
    await createDatabaseIfMissing(adminUrl, database.name);
    const targetUrl = process.env[database.name === "deep_crm" ? "DEEP_DATABASE_URL" : "POOJAN_DATABASE_URL"]
      || databaseUrl(adminUrl, database.name);

    await runSqlFile(targetUrl, "schema.sql");
    if (process.env.SKIP_SEED !== "true") {
      await runSqlFile(targetUrl, database.seedFile);
    }
  }

  console.log("Neon CRM setup complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
