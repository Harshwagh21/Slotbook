// The booking engine. Every write that can take or free a slot runs in one transaction that
// first takes a per-host advisory lock, so "is it still free?" and the write cannot interleave
// with another request for the same host. Postgres now() is the only clock.
import { createHash, randomBytes } from "node:crypto";
import { DateTime } from "luxon";
import type { PoolClient } from "pg";
import { GUEST_WINDOW_DAYS, HOLD_MINUTES } from "./config";
import { getPool, withTransaction } from "./db";
import { ApiError } from "./http";
import { blockedRange, filterAvailable, generateSlots, type BusyBooking, type Override, type Rule } from "./slots";

type Db = Pick<PoolClient, "query">;

export type EventTypeRow = {
  id: string;
  host_id: string;
  host_handle: string;
  host_timezone: string;
  slug: string;
  name: string;
  duration_min: number;
  capacity: number;
  buffer_before_min: number;
  buffer_after_min: number;
  min_notice_min: number;
  horizon_days: number;
};

type BookingRow = {
  id: string;
  host_id: string;
  event_type_id: string;
  status: "held" | "confirmed" | "cancelled" | "expired";
  starts_at: Date;
  ends_at: Date;
  hold_expires_at: Date | null;
  guest_name: string | null;
  guest_email: string | null;
  manage_token: string | null;
  cancel_reason: string | null;
};

export type BookingView = {
  id: string;
  status: BookingRow["status"];
  start: string;
  end: string;
  guestName: string | null;
  guestEmail: string | null;
  cancelReason: string | null;
  eventType: { slug: string; name: string; durationMin: number };
  host: { handle: string; name: string; timezone: string };
};

// ---------- reads ----------

export async function getEventType(db: Db, host: string, slug: string): Promise<EventTypeRow> {
  const { rows } = await db.query<EventTypeRow>(
    `SELECT et.*, h.handle AS host_handle, h.timezone AS host_timezone
       FROM event_types et JOIN hosts h ON h.id = et.host_id
      WHERE h.handle = $1 AND et.slug = $2`,
    [host, slug],
  );
  if (!rows[0]) throw new ApiError(404, "not_found", "Unknown host or event type");
  return rows[0];
}

async function getEventTypeById(db: Db, id: string): Promise<EventTypeRow> {
  const { rows } = await db.query<EventTypeRow>(
    `SELECT et.*, h.handle AS host_handle, h.timezone AS host_timezone
       FROM event_types et JOIN hosts h ON h.id = et.host_id WHERE et.id = $1`,
    [id],
  );
  return rows[0];
}

async function dbNow(db: Db): Promise<Date> {
  const { rows } = await db.query<{ now: Date }>("SELECT now() AS now");
  return rows[0].now;
}

async function loadAvailability(db: Db, hostId: string): Promise<{ rules: Rule[]; overrides: Override[] }> {
  const rules = await db.query<Rule>(
    "SELECT weekday, to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time FROM availability_rules WHERE host_id = $1",
    [hostId],
  );
  const overrides = await db.query<Override>(
    `SELECT to_char(date, 'YYYY-MM-DD') AS date,
            to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time
       FROM date_overrides WHERE host_id = $1`,
    [hostId],
  );
  return { rules: rules.rows, overrides: overrides.rows };
}

/** Bookable window for an event type: [now + minimum notice, now + horizon]. */
function bookableRange(et: EventTypeRow, now: Date) {
  return {
    earliest: new Date(now.getTime() + et.min_notice_min * 60_000),
    latest: new Date(now.getTime() + et.horizon_days * 86_400_000),
  };
}

/** Available slots in [from, to), clipped to the event type's notice and horizon. */
export async function listSlots(
  db: Db,
  et: EventTypeRow,
  range: { from?: Date; to?: Date } = {},
): Promise<{ start: Date; end: Date; remaining: number }[]> {
  const now = await dbNow(db);
  const { earliest, latest } = bookableRange(et, now);
  const from = new Date(Math.max((range.from ?? now).getTime(), earliest.getTime()));
  const defaultTo = new Date(now.getTime() + GUEST_WINDOW_DAYS * 86_400_000);
  const requestedTo = range.to ?? defaultTo;
  // `to` is exclusive, except that a slot starting exactly at the horizon is still bookable.
  const to = requestedTo > latest ? new Date(latest.getTime() + 1) : requestedTo;
  if (to <= from) return [];

  const { rules, overrides } = await loadAvailability(db, et.host_id);
  const candidates = generateSlots({
    timezone: et.host_timezone,
    rules,
    overrides,
    durationMin: et.duration_min,
    from,
    to,
  });
  // Active = confirmed, or held and not yet past its expiry (by the DB clock).
  const busy = await db.query<BusyBooking>(
    `SELECT event_type_id, starts_at, blocked_start, blocked_end FROM bookings
      WHERE host_id = $1 AND blocked_start < $3 AND blocked_end > $2
        AND (status = 'confirmed' OR (status = 'held' AND hold_expires_at > now()))`,
    [et.host_id, new Date(from.getTime() - 86_400_000), new Date(to.getTime() + 86_400_000)],
  );
  return filterAvailable(et, candidates, busy.rows);
}

// ---------- shared write steps (call only while holding the host lock) ----------

async function lockHost(db: Db, hostId: string): Promise<void> {
  // Released automatically at COMMIT / ROLLBACK (or if the connection dies).
  await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [hostId]);
}

async function expireStaleHolds(db: Db, hostId: string): Promise<void> {
  await db.query(
    "UPDATE bookings SET status = 'expired' WHERE host_id = $1 AND status = 'held' AND hold_expires_at <= now()",
    [hostId],
  );
}

/** The start must be a real slot of the event type (availability, notice, horizon). */
async function assertRealSlot(db: Db, et: EventTypeRow, start: Date): Promise<void> {
  const now = await dbNow(db);
  const { earliest, latest } = bookableRange(et, now);
  if (start < earliest || start > latest) {
    throw new ApiError(422, "not_bookable", "That time is outside the minimum notice or booking horizon");
  }
  const { rules, overrides } = await loadAvailability(db, et.host_id);
  const match = generateSlots({
    timezone: et.host_timezone,
    rules,
    overrides,
    durationMin: et.duration_min,
    from: start,
    to: new Date(start.getTime() + 1),
  });
  if (match.length === 0) throw new ApiError(422, "not_a_slot", "That time is not an available slot");
}

/** 409 unless the slot is free: no overlapping booking (buffers, host-wide) and a seat left. */
async function assertFree(db: Db, et: EventTypeRow, start: Date, excludeBookingId: string | null): Promise<void> {
  const { blockedStart, blockedEnd } = blockedRange(et, start);
  const overlap = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM bookings
      WHERE host_id = $1 AND status IN ('held', 'confirmed')
        AND blocked_start < $3 AND blocked_end > $2
        AND NOT (event_type_id = $4 AND starts_at = $5)
        AND ($6::uuid IS NULL OR id <> $6)`,
    [et.host_id, blockedStart, blockedEnd, et.id, start, excludeBookingId],
  );
  if (overlap.rows[0].n > 0) throw new ApiError(409, "slot_taken", "That slot is no longer available");

  const seats = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM bookings
      WHERE event_type_id = $1 AND starts_at = $2 AND status IN ('held', 'confirmed')
        AND ($3::uuid IS NULL OR id <> $3)`,
    [et.id, start, excludeBookingId],
  );
  if (seats.rows[0].n >= et.capacity) throw new ApiError(409, "slot_full", "That slot is full");
}

async function notify(db: Db, bookingId: string, type: "confirmed" | "rescheduled" | "cancelled", payload: object) {
  await db.query("INSERT INTO notifications (booking_id, type, payload) VALUES ($1, $2, $3)", [
    bookingId,
    type,
    JSON.stringify(payload),
  ]);
}

async function bookingView(db: Db, id: string): Promise<BookingView> {
  const { rows } = await db.query(
    `SELECT b.*, et.slug, et.name AS et_name, et.duration_min, h.handle, h.name AS host_name, h.timezone
       FROM bookings b JOIN event_types et ON et.id = b.event_type_id JOIN hosts h ON h.id = b.host_id
      WHERE b.id = $1`,
    [id],
  );
  const r = rows[0];
  return {
    id: r.id,
    status: r.status,
    start: r.starts_at.toISOString(),
    end: r.ends_at.toISOString(),
    guestName: r.guest_name,
    guestEmail: r.guest_email,
    cancelReason: r.cancel_reason,
    eventType: { slug: r.slug, name: r.et_name, durationMin: r.duration_min },
    host: { handle: r.handle, name: r.host_name, timezone: r.timezone },
  };
}

// ---------- the four writes ----------

export type HoldResult = { status: number; body: { holdId: string; start: string; end: string; expiresAt: string } };

/**
 * Hold a slot for HOLD_MINUTES. The Idempotency-Key is inserted in the same transaction: a retry
 * with the same key and body returns the stored response; a concurrent retry waits on the key's
 * primary key and then reads it. A failed hold rolls back, so the key can be retried.
 */
export async function createHold(
  input: { host: string; slug: string; start: string },
  idempotencyKey: string,
): Promise<HoldResult> {
  const start = new Date(input.start);
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ host: input.host, slug: input.slug, start: start.toISOString() }))
    .digest("hex");

  return withTransaction(async (db) => {
    const inserted = await db.query(
      "INSERT INTO idempotency_keys (key, request_hash) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
      [idempotencyKey, requestHash],
    );
    if (inserted.rowCount === 0) {
      const { rows } = await db.query("SELECT request_hash, response_status, response_body FROM idempotency_keys WHERE key = $1", [
        idempotencyKey,
      ]);
      if (rows[0].request_hash !== requestHash) {
        throw new ApiError(422, "idempotency_key_reused", "This Idempotency-Key was used with a different request");
      }
      return { status: rows[0].response_status, body: rows[0].response_body };
    }

    const et = await getEventType(db, input.host, input.slug);
    await lockHost(db, et.host_id);
    await expireStaleHolds(db, et.host_id);
    await assertRealSlot(db, et, start);
    await assertFree(db, et, start, null);

    const { end, blockedStart, blockedEnd } = blockedRange(et, start);
    const { rows } = await db.query<{ id: string; hold_expires_at: Date }>(
      `INSERT INTO bookings (host_id, event_type_id, status, starts_at, ends_at, blocked_start, blocked_end, hold_expires_at)
       VALUES ($1, $2, 'held', $3, $4, $5, $6, now() + make_interval(mins => $7))
       RETURNING id, hold_expires_at`,
      [et.host_id, et.id, start, end, blockedStart, blockedEnd, HOLD_MINUTES],
    );
    const body = {
      holdId: rows[0].id,
      start: start.toISOString(),
      end: end.toISOString(),
      expiresAt: rows[0].hold_expires_at.toISOString(),
    };
    await db.query("UPDATE idempotency_keys SET response_status = 201, response_body = $2 WHERE key = $1", [
      idempotencyKey,
      JSON.stringify(body),
    ]);
    return { status: 201, body };
  });
}

/** Lock the booking's host, then re-read the booking row. */
async function lockBooking(db: Db, where: { id?: string; token?: string }): Promise<BookingRow> {
  const sql = where.id ? "SELECT host_id FROM bookings WHERE id = $1" : "SELECT host_id FROM bookings WHERE manage_token = $1";
  const found = await db.query<{ host_id: string }>(sql, [where.id ?? where.token]);
  if (!found.rows[0]) throw new ApiError(404, "not_found", "Booking not found");
  await lockHost(db, found.rows[0].host_id);
  const { rows } = await db.query<BookingRow>(
    where.id ? "SELECT * FROM bookings WHERE id = $1 FOR UPDATE" : "SELECT * FROM bookings WHERE manage_token = $1 FOR UPDATE",
    [where.id ?? where.token],
  );
  return rows[0];
}

/** Confirm a live hold. Confirming an already-confirmed booking returns it unchanged. */
export async function confirmHold(
  holdId: string,
  guest: { name: string; email: string },
): Promise<{ booking: BookingView; manageToken: string }> {
  return withTransaction(async (db) => {
    const b = await lockBooking(db, { id: holdId });
    if (b.status === "confirmed") return { booking: await bookingView(db, b.id), manageToken: b.manage_token! };
    if (b.status === "cancelled") throw new ApiError(409, "booking_cancelled", "This booking was cancelled");

    const live = await db.query<{ live: boolean }>("SELECT hold_expires_at > now() AS live FROM bookings WHERE id = $1", [b.id]);
    if (b.status === "expired" || !live.rows[0].live) {
      throw new ApiError(410, "hold_expired", "This hold has expired; please pick a slot again");
    }

    const token = randomBytes(32).toString("base64url");
    await db.query(
      "UPDATE bookings SET status = 'confirmed', guest_name = $2, guest_email = $3, manage_token = $4 WHERE id = $1",
      [b.id, guest.name, guest.email, token],
    );
    const booking = await bookingView(db, b.id);
    await notify(db, b.id, "confirmed", { booking });
    return { booking, manageToken: token };
  });
}

/** Move a confirmed, not-yet-started booking to a new slot (same id and manage link). */
export async function rescheduleBooking(token: string, newStartIso: string): Promise<BookingView> {
  const newStart = new Date(newStartIso);
  return withTransaction(async (db) => {
    const b = await lockBooking(db, { token });
    if (b.status !== "confirmed") throw new ApiError(409, "booking_not_active", "Only confirmed bookings can be rescheduled");
    const started = await db.query<{ started: boolean }>("SELECT $1::timestamptz <= now() AS started", [b.starts_at]);
    if (started.rows[0].started) throw new ApiError(409, "booking_started", "This booking has already started");
    if (b.starts_at.getTime() === newStart.getTime()) return bookingView(db, b.id);

    const et = await getEventTypeById(db, b.event_type_id);
    await expireStaleHolds(db, et.host_id);
    await assertRealSlot(db, et, newStart);
    await assertFree(db, et, newStart, b.id);

    const { end, blockedStart, blockedEnd } = blockedRange(et, newStart);
    await db.query("UPDATE bookings SET starts_at = $2, ends_at = $3, blocked_start = $4, blocked_end = $5 WHERE id = $1", [
      b.id,
      newStart,
      end,
      blockedStart,
      blockedEnd,
    ]);
    const booking = await bookingView(db, b.id);
    await notify(db, b.id, "rescheduled", { booking, previousStart: b.starts_at.toISOString() });
    return booking;
  });
}

async function cancel(db: Db, b: BookingRow, reason: string | undefined, by: "guest" | "host"): Promise<BookingView> {
  if (b.status === "cancelled") return bookingView(db, b.id);
  if (b.status !== "confirmed") throw new ApiError(409, "booking_not_active", "Only confirmed bookings can be cancelled");
  await db.query("UPDATE bookings SET status = 'cancelled', cancel_reason = $2 WHERE id = $1", [b.id, reason || null]);
  const booking = await bookingView(db, b.id);
  await notify(db, b.id, "cancelled", { booking, cancelledBy: by });
  return booking;
}

/** Guest cancel via the manage token. Cancelling twice returns the cancelled booking. */
export function cancelByToken(token: string, reason?: string): Promise<BookingView> {
  return withTransaction(async (db) => cancel(db, await lockBooking(db, { token }), reason, "guest"));
}

/** Host cancel from the dashboard, with a reason. */
export function cancelByHost(hostId: string, bookingId: string, reason?: string): Promise<BookingView> {
  return withTransaction(async (db) => {
    const b = await lockBooking(db, { id: bookingId });
    if (b.host_id !== hostId) throw new ApiError(404, "not_found", "Booking not found");
    return cancel(db, b, reason, "host");
  });
}

export async function getBookingByToken(token: string): Promise<BookingView | null> {
  const { rows } = await getPool().query<{ id: string }>("SELECT id FROM bookings WHERE manage_token = $1", [token]);
  return rows[0] ? bookingView(getPool(), rows[0].id) : null;
}

/** Parse a slots-query bound: an ISO instant, or a YYYY-MM-DD date read in `tz`. */
export function parseBound(value: string | undefined, tz: string, endOfDay: boolean): Date | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = DateTime.fromISO(value, { zone: tz });
    return (endOfDay ? d.plus({ days: 1 }) : d).toJSDate();
  }
  return new Date(value);
}
