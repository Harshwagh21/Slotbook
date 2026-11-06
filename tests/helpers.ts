import { getPool } from "@/lib/db";
import { hashPassword } from "@/lib/password";

/** Shared test DB pool (points at slotbook_test via vitest env). */
export const db = () => getPool();

/** Wipe all tables between tests so each case starts clean. */
export async function resetDb() {
  await db().query(
    "TRUNCATE notifications, idempotency_keys, bookings, date_overrides, availability_rules, event_types, sessions, hosts CASCADE",
  );
}

/**
 * A host in UTC available every day 00:00–23:59, so tests are independent of the run date.
 * Event types have no minimum notice by default.
 */
export async function createHost(handle = "alice", timezone = "UTC") {
  const { rows } = await db().query<{ id: string }>(
    "INSERT INTO hosts (handle, name, email, password_hash, timezone) VALUES ($1, $1, $1 || '@test.dev', $2, $3) RETURNING id",
    [handle, hashPassword("pw"), timezone],
  );
  const hostId = rows[0].id;
  for (let weekday = 1; weekday <= 7; weekday++) {
    await db().query("INSERT INTO availability_rules (host_id, weekday, start_time, end_time) VALUES ($1, $2, '00:00', '23:59')", [
      hostId,
      weekday,
    ]);
  }
  return hostId;
}

/** Insert an event type with sensible defaults for booking tests. */
export async function createEventType(
  hostId: string,
  slug: string,
  opts: Partial<{ duration: number; capacity: number; bufferBefore: number; bufferAfter: number; minNotice: number }> = {},
) {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO event_types (host_id, slug, name, duration_min, capacity, buffer_before_min, buffer_after_min, min_notice_min, horizon_days)
     VALUES ($1, $2, $2, $3, $4, $5, $6, $7, 30) RETURNING id`,
    [hostId, slug, opts.duration ?? 30, opts.capacity ?? 1, opts.bufferBefore ?? 0, opts.bufferAfter ?? 0, opts.minNotice ?? 0],
  );
  return rows[0].id;
}

/** A slot start on a 30-minute boundary, `days` days from now (UTC, aligned to the 00:00 window). */
export function futureSlot(days = 2, hourUtc = 10, minute = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, minute, 0, 0);
  return d.toISOString();
}

export function plusMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}
