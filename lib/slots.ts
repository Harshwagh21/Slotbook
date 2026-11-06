import { DateTime } from "luxon";

export type Rule = { weekday: number; start_time: string; end_time: string };
export type Override = { date: string; start_time: string | null; end_time: string | null };
export type Slot = { start: Date; end: Date };

export type BusyBooking = {
  event_type_id: string;
  starts_at: Date;
  blocked_start: Date;
  blocked_end: Date;
};

export type SlotEventType = {
  id: string;
  duration_min: number;
  capacity: number;
  buffer_before_min: number;
  buffer_after_min: number;
};

const MINUTE = 60_000;

/** Parse `"HH:MM"` into hour and minute numbers. */
function parseTime(t: string): { hour: number; minute: number } {
  const [h, m] = t.split(":").map(Number);
  return { hour: h, minute: m };
}

/** Availability windows for one local date: the date's overrides if any, otherwise the weekly rules. */
function windowsForDate(date: DateTime, rules: Rule[], overrides: Override[]): { start: string; end: string }[] {
  const key = date.toISODate();
  const forDate = overrides.filter((o) => o.date === key);
  if (forDate.length > 0) {
    // A row with null times is a day off; other rows are custom hours.
    return forDate
      .filter((o) => o.start_time && o.end_time)
      .map((o) => ({ start: o.start_time!, end: o.end_time! }));
  }
  return rules.filter((r) => r.weekday === date.weekday).map((r) => ({ start: r.start_time, end: r.end_time }));
}

/**
 * Candidate slots whose start lies in [from, to). Each local date is converted to UTC with
 * that date's own offset (Luxon), so daylight-saving changes are handled per day.
 * Slots start every `durationMin` from each window's start and must end by the window's end.
 */
export function generateSlots(opts: {
  timezone: string;
  rules: Rule[];
  overrides: Override[];
  durationMin: number;
  from: Date;
  to: Date;
}): Slot[] {
  const { timezone, rules, overrides, durationMin } = opts;
  const fromMs = opts.from.getTime();
  const toMs = opts.to.getTime();
  const slots: Slot[] = [];
  if (toMs <= fromMs) return slots;

  const lastDay = DateTime.fromMillis(toMs, { zone: timezone }).startOf("day");
  for (
    let day = DateTime.fromMillis(fromMs, { zone: timezone }).startOf("day");
    day <= lastDay;
    day = day.plus({ days: 1 })
  ) {
    for (const w of windowsForDate(day, rules, overrides)) {
      const date = { year: day.year, month: day.month, day: day.day };
      const windowStart = DateTime.fromObject({ ...date, ...parseTime(w.start) }, { zone: timezone }).toMillis();
      const windowEnd = DateTime.fromObject({ ...date, ...parseTime(w.end) }, { zone: timezone }).toMillis();
      for (let s = windowStart; s + durationMin * MINUTE <= windowEnd; s += durationMin * MINUTE) {
        if (s >= fromMs && s < toMs) slots.push({ start: new Date(s), end: new Date(s + durationMin * MINUTE) });
      }
    }
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** The range a booking at `start` blocks on the host's calendar, buffers included. */
export function blockedRange(et: SlotEventType, start: Date): { blockedStart: Date; blockedEnd: Date; end: Date } {
  const end = new Date(start.getTime() + et.duration_min * MINUTE);
  return {
    end,
    blockedStart: new Date(start.getTime() - et.buffer_before_min * MINUTE),
    blockedEnd: new Date(end.getTime() + et.buffer_after_min * MINUTE),
  };
}

/**
 * Removes slots that overlap another active booking of the host (buffers included, across all
 * event types) or whose seats are full. Bookings of the same event type at the same start share
 * the slot's capacity instead of conflicting.
 */
export function filterAvailable(
  et: SlotEventType,
  candidates: Slot[],
  busy: BusyBooking[],
): (Slot & { remaining: number })[] {
  const result: (Slot & { remaining: number })[] = [];
  for (const slot of candidates) {
    const { blockedStart, blockedEnd } = blockedRange(et, slot.start);
    let used = 0;
    let conflict = false;
    for (const b of busy) {
      const sameSlot = b.event_type_id === et.id && b.starts_at.getTime() === slot.start.getTime();
      if (sameSlot) used++;
      else if (b.blocked_start < blockedEnd && b.blocked_end > blockedStart) conflict = true;
    }
    const remaining = et.capacity - used;
    if (!conflict && remaining > 0) result.push({ ...slot, remaining });
  }
  return result;
}
