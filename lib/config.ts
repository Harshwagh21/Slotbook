// Default matches the Postgres from docker-compose.yml, so `pnpm dev` works without extra setup.
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://slotbook:slotbook@localhost:5432/slotbook";

export const HOLD_MINUTES = 5;
export const GUEST_WINDOW_DAYS = 30;
