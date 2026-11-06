// Host dashboard data: settings, event types, availability, overrides and upcoming bookings.
import { getPool, withTransaction } from "./db";
import { ApiError } from "./http";
import type { z } from "zod";
import type { availabilityBody, eventTypeBody, overrideBody } from "./schemas";

export type EventType = {
  id: string;
  slug: string;
  name: string;
  durationMin: number;
  capacity: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  horizonDays: number;
};

const EVENT_TYPE_COLUMNS = `id, slug, name, duration_min AS "durationMin", capacity,
  buffer_before_min AS "bufferBeforeMin", buffer_after_min AS "bufferAfterMin",
  min_notice_min AS "minNoticeMin", horizon_days AS "horizonDays"`;

/** Update the host's home IANA time zone. */
export async function setTimezone(hostId: string, timezone: string) {
  await getPool().query("UPDATE hosts SET timezone = $2 WHERE id = $1", [hostId, timezone]);
}

/** List all event types for a host (dashboard). */
export async function listEventTypes(hostId: string): Promise<EventType[]> {
  const { rows } = await getPool().query<EventType>(
    `SELECT ${EVENT_TYPE_COLUMNS} FROM event_types WHERE host_id = $1 ORDER BY created_at, name`,
    [hostId],
  );
  return rows;
}

type EventTypeInput = z.infer<typeof eventTypeBody>;
const values = (e: EventTypeInput) => [
  e.slug, e.name, e.durationMin, e.capacity, e.bufferBeforeMin, e.bufferAfterMin, e.minNoticeMin, e.horizonDays,
];

/** Map a unique-slug DB conflict to a friendly 409 ApiError. */
function slugTaken(err: unknown): never {
  if ((err as { code?: string }).code === "23505") throw new ApiError(409, "slug_taken", "You already have an event type with that slug");
  throw err;
}

/** Create a new event type for the host. */
export async function createEventType(hostId: string, e: EventTypeInput): Promise<EventType> {
  const { rows } = await getPool()
    .query<EventType>(
      `INSERT INTO event_types (host_id, slug, name, duration_min, capacity, buffer_before_min, buffer_after_min, min_notice_min, horizon_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${EVENT_TYPE_COLUMNS}`,
      [hostId, ...values(e)],
    )
    .catch(slugTaken);
  return rows[0];
}

/** Update an existing event type owned by the host. */
export async function updateEventType(hostId: string, id: string, e: EventTypeInput): Promise<EventType> {
  const { rows } = await getPool()
    .query<EventType>(
      `UPDATE event_types SET slug = $3, name = $4, duration_min = $5, capacity = $6, buffer_before_min = $7,
              buffer_after_min = $8, min_notice_min = $9, horizon_days = $10
        WHERE host_id = $1 AND id = $2 RETURNING ${EVENT_TYPE_COLUMNS}`,
      [hostId, id, ...values(e)],
    )
    .catch(slugTaken);
  if (!rows[0]) throw new ApiError(404, "not_found", "Event type not found");
  return rows[0];
}

/**
 * Delete an event type.
 * Refused with 409 only while it still has active bookings (live holds or upcoming confirmed).
 * Past / cancelled / expired rows are cleaned up so the FK does not block delete.
 */
export async function deleteEventType(hostId: string, id: string): Promise<void> {
  await withTransaction(async (db) => {
    // Same host lock as holds, so a booking cannot land between the check and delete.
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [hostId]);
    const active = await db.query(
      `SELECT 1 FROM bookings
        WHERE event_type_id = $1
          AND (
            (status = 'held' AND hold_expires_at > now())
            OR (status = 'confirmed' AND ends_at > now())
          )
        LIMIT 1`,
      [id],
    );
    if (active.rows[0]) {
      throw new ApiError(409, "has_bookings", "This event type has upcoming bookings, so it can't be deleted");
    }
    await db.query(
      `DELETE FROM notifications
        WHERE booking_id IN (SELECT id FROM bookings WHERE event_type_id = $1)`,
      [id],
    );
    await db.query("DELETE FROM bookings WHERE event_type_id = $1", [id]);
    const res = await db.query("DELETE FROM event_types WHERE host_id = $1 AND id = $2", [hostId, id]);
    if (!res.rowCount) throw new ApiError(404, "not_found", "Event type not found");
  });
}

export type AvailabilityRule = { weekday: number; start: string; end: string };

/** Read the host's weekly availability windows. */
export async function getAvailability(hostId: string): Promise<AvailabilityRule[]> {
  const { rows } = await getPool().query<AvailabilityRule>(
    `SELECT weekday, to_char(start_time, 'HH24:MI') AS start, to_char(end_time, 'HH24:MI') AS end
       FROM availability_rules WHERE host_id = $1 ORDER BY weekday, start_time`,
    [hostId],
  );
  return rows;
}

/** Replaces the host's weekly rules in one transaction. */
export async function setAvailability(hostId: string, rules: z.infer<typeof availabilityBody>["rules"]) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM availability_rules WHERE host_id = $1", [hostId]);
    for (const r of rules) {
      await client.query("INSERT INTO availability_rules (host_id, weekday, start_time, end_time) VALUES ($1, $2, $3, $4)", [
        hostId, r.weekday, r.start, r.end,
      ]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export type DateOverride = { date: string; windows: { start: string; end: string }[] };

/** List date overrides grouped by date (empty windows = day off). */
export async function listOverrides(hostId: string): Promise<DateOverride[]> {
  const { rows } = await getPool().query<{ date: string; start: string | null; end: string | null }>(
    `SELECT to_char(date, 'YYYY-MM-DD') AS date, to_char(start_time, 'HH24:MI') AS start, to_char(end_time, 'HH24:MI') AS end
       FROM date_overrides WHERE host_id = $1 ORDER BY date, start_time`,
    [hostId],
  );
  const byDate = new Map<string, DateOverride>();
  for (const r of rows) {
    const o = byDate.get(r.date) ?? { date: r.date, windows: [] };
    if (r.start && r.end) o.windows.push({ start: r.start, end: r.end });
    byDate.set(r.date, o);
  }
  return [...byDate.values()];
}

/** Sets the override for one date. No windows = day off. */
export async function setOverride(hostId: string, o: z.infer<typeof overrideBody>) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM date_overrides WHERE host_id = $1 AND date = $2", [hostId, o.date]);
    if (o.windows.length === 0) {
      await client.query("INSERT INTO date_overrides (host_id, date) VALUES ($1, $2)", [hostId, o.date]);
    }
    for (const w of o.windows) {
      await client.query("INSERT INTO date_overrides (host_id, date, start_time, end_time) VALUES ($1, $2, $3, $4)", [
        hostId, o.date, w.start, w.end,
      ]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Remove a date override so weekly rules apply again. */
export async function deleteOverride(hostId: string, date: string) {
  await getPool().query("DELETE FROM date_overrides WHERE host_id = $1 AND date = $2", [hostId, date]);
}

export type UpcomingBooking = {
  id: string;
  start: string;
  end: string;
  guestName: string;
  guestEmail: string;
  eventType: string;
};

/** Confirmed bookings that have not ended yet, ordered by start time. */
export async function upcomingBookings(hostId: string): Promise<UpcomingBooking[]> {
  const { rows } = await getPool().query(
    `SELECT b.id, b.starts_at, b.ends_at, b.guest_name, b.guest_email, et.name AS et_name
       FROM bookings b JOIN event_types et ON et.id = b.event_type_id
      WHERE b.host_id = $1 AND b.status = 'confirmed' AND b.ends_at > now()
      ORDER BY b.starts_at`,
    [hostId],
  );
  return rows.map((r) => ({
    id: r.id,
    start: r.starts_at.toISOString(),
    end: r.ends_at.toISOString(),
    guestName: r.guest_name,
    guestEmail: r.guest_email,
    eventType: r.et_name,
  }));
}
