import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

// The e2e suite never touches the real database: it clones it into "<name>-e2e" before the run and drops it after.

function sourceUrl() {
  if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.E2E_SOURCE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (.env.local)");
  return new URL(url);
}

function withDatabase(url: URL, name: string) {
  const copy = new URL(url);
  copy.pathname = `/${name}`;
  return copy;
}

const sourceName = () => decodeURIComponent(sourceUrl().pathname.slice(1));
export const e2eDatabaseName = () => `${sourceName()}-e2e`;
export const e2eDatabaseUrl = () => withDatabase(sourceUrl(), e2eDatabaseName()).toString();

function psql(url: string, args: string[], input?: Buffer) {
  return execFileSync("psql", ["--quiet", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--dbname", url, ...args], { input, stdio: ["pipe", "pipe", "pipe"] }).toString();
}

/** Fresh copy of the real database (schema and data) under the e2e name. */
export function cloneDatabase() {
  const source = sourceUrl();
  const admin = withDatabase(source, "postgres").toString();
  const name = e2eDatabaseName().replace(/"/g, '""');
  psql(admin, ["-c", `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`, "-c", `CREATE DATABASE "${name}"`]);
  const dump = execFileSync("pg_dump", ["--no-owner", "--dbname", source.toString()], { maxBuffer: 512 * 1024 * 1024 });
  psql(e2eDatabaseUrl(), [], dump);
}

/** Drops the copy, closing the e2e server's open connections. */
export function dropDatabase() {
  const admin = withDatabase(sourceUrl(), "postgres").toString();
  psql(admin, ["-c", `DROP DATABASE IF EXISTS "${e2eDatabaseName().replace(/"/g, '""')}" WITH (FORCE)`]);
}

/** One value (or rows joined by newlines) from the e2e database. */
export function sql(query: string) {
  return psql(e2eDatabaseUrl(), ["--tuples-only", "--no-align", "-c", query]).trim();
}
