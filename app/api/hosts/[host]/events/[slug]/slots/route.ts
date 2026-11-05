import { DateTime } from "luxon";
import { getEventType, listSlots, parseBound } from "@/lib/booking";
import { getPool } from "@/lib/db";
import { ApiError, json, route } from "@/lib/http";
import { slotsQuery } from "@/lib/schemas";

// GET /api/hosts/{host}/events/{slug}/slots?from&to&tz
export const GET = route(async (req: Request, ctx: { params: Promise<{ host: string; slug: string }> }) => {
  const { host, slug } = await ctx.params;
  const q = slotsQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  const tz = q.tz ?? "UTC";
  const from = parseBound(q.from, tz, false);
  const to = parseBound(q.to, tz, true);
  if (from && to && to <= from) throw new ApiError(422, "invalid_range", "`to` must be after `from`");

  const db = getPool();
  const et = await getEventType(db, host, slug);
  const slots = await listSlots(db, et, { from, to });
  return json({
    host: { handle: et.host_handle, timezone: et.host_timezone },
    eventType: { slug: et.slug, name: et.name, durationMin: et.duration_min, capacity: et.capacity },
    tz,
    slots: slots.map((s) => ({
      start: s.start.toISOString(),
      end: s.end.toISOString(),
      remaining: s.remaining,
      localStart: DateTime.fromJSDate(s.start, { zone: tz }).toISO(),
    })),
  });
});
