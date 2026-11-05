import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests run against a real Postgres: a separate slotbook_test database on the compose Postgres.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://slotbook:slotbook@localhost:5432/slotbook_test";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    globalSetup: ["./tests/global-setup.ts"],
    env: { DATABASE_URL: TEST_DATABASE_URL },
    fileParallelism: false, // test files share one database
    testTimeout: 20_000,
  },
});
