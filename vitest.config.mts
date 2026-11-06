import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Read DATABASE_URL from `.env` so tests use the same host/port as `pnpm dev`. */
function databaseUrlFromDotEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return undefined;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("DATABASE_URL=")) continue;
    let val = line.slice("DATABASE_URL=".length).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    return val;
  }
}

// Same Postgres as .env / docker compose, but a separate slotbook_test database.
function defaultTestDatabaseUrl() {
  const base =
    process.env.DATABASE_URL ??
    databaseUrlFromDotEnv() ??
    "postgres://slotbook:slotbook@localhost:5432/slotbook";
  const url = new URL(base);
  url.pathname = "/slotbook_test";
  return url.toString();
}

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl();

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    globalSetup: ["./tests/global-setup.ts"],
    env: { DATABASE_URL: TEST_DATABASE_URL },
    fileParallelism: false, // test files share one database
    testTimeout: 20_000,
  },
});
