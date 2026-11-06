import { IANAZone } from "luxon";
import { z } from "zod";

export const timeZone = z.string().refine((tz) => IANAZone.isValidZone(tz), "must be an IANA time zone");
const isoInstant = z.iso.datetime({ offset: true });
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM (00:00–23:59)");
const slug = z.string().regex(/^[a-z0-9-]+$/, "lowercase letters, digits and dashes only").min(1).max(60);

// Guest API
export const holdBody = z.object({ host: z.string().min(1), slug: z.string().min(1), start: isoInstant });
export const confirmBody = z.object({ name: z.string().trim().min(1).max(200), email: z.email().max(320) });
export const rescheduleBody = z.object({ start: isoInstant });
export const cancelBody = z.object({ reason: z.string().trim().max(500).optional() });
export const uuid = z.uuid();

// from / to accept an ISO instant or a YYYY-MM-DD date (read in `tz`).
export const slotsQuery = z.object({
  from: z.union([isoInstant, z.iso.date()]).optional(),
  to: z.union([isoInstant, z.iso.date()]).optional(),
  tz: timeZone.optional(),
});

// Host API
export const loginBody = z.object({ email: z.string().min(1), password: z.string().min(1) });
export const settingsBody = z.object({ timezone: timeZone });

export const eventTypeBody = z.object({
  name: z.string().trim().min(1).max(100),
  slug,
  durationMin: z.number().int().min(15).max(120),
  capacity: z.number().int().min(1).max(1000),
  bufferBeforeMin: z.number().int().min(0).max(30),
  bufferAfterMin: z.number().int().min(0).max(30),
  minNoticeMin: z.number().int().min(0).max(60 * 24 * 365),
  horizonDays: z.number().int().min(1).max(365),
});

const window = z
  .object({ start: hhmm, end: hhmm })
  .refine((w) => w.start < w.end, "start must be before end");

/** True if any two HH:MM windows on the same day overlap. */
function overlaps(ws: { start: string; end: string }[]): boolean {
  const sorted = [...ws].sort((a, b) => a.start.localeCompare(b.start));
  return sorted.some((w, i) => i > 0 && w.start < sorted[i - 1].end);
}

export const availabilityBody = z.object({
  rules: z
    .array(window.and(z.object({ weekday: z.number().int().min(1).max(7) })))
    .max(100)
    .refine(
      (rules) => [1, 2, 3, 4, 5, 6, 7].every((d) => !overlaps(rules.filter((r) => r.weekday === d))),
      "windows on the same weekday must not overlap",
    ),
});

// An override replaces the weekly rules on one date. No windows = day off.
export const overrideBody = z.object({
  date: z.iso.date(),
  windows: z.array(window).max(20).refine((ws) => !overlaps(ws), "windows must not overlap"),
});
