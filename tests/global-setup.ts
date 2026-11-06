import { Client } from "pg";
import { DATABASE_URL } from "../lib/config";
import { migrate } from "../scripts/migrate";

/** Derive `…/slotbook_test` from the main DATABASE_URL host/port. */
function defaultTestDatabaseUrl() {
  const url = new URL(DATABASE_URL);
  url.pathname = "/slotbook_test";
  return url.toString();
}

/** Create the test database if needed and apply migrations once before all tests. */
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl());
  const dbName = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (!rowCount) await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();
  await migrate(url.toString(), () => {});
}
