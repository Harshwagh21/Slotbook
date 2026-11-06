import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Load `.env` into `process.env` for tsx scripts (Next.js loads it on its own). */
function loadDotEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    if (!key || process.env[key] !== undefined) continue;
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadDotEnv();

// Default matches the Postgres from docker-compose.yml, so `pnpm dev` works without extra setup.
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://slotbook:slotbook@localhost:5432/slotbook";

export const HOLD_MINUTES = 5;
export const GUEST_WINDOW_DAYS = 30;
