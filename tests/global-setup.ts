import { Client } from "pg";
import { migrate } from "../scripts/migrate";

// Creates the test database if needed and applies migrations once before all tests.
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "postgres://slotbook:slotbook@localhost:5432/slotbook_test");
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
