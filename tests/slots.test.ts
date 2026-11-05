import { describe, expect, it } from "vitest";
import { filterAvailable, generateSlots } from "@/lib/slots";

const weekdays = (start: string, end: string) =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start_time: start, end_time: end }));

describe("generateSlots", () => {
  it("handles the end of US daylight time (America/New_York, 1 Nov 2026)", () => {
    const slots = generateSlots({
      timezone: "America/New_York",
      rules: weekdays("09:00", "17:00"),
      overrides: [],
      durationMin: 60,
      from: new Date("2026-10-31T00:00:00Z"),
      to: new Date("2026-11-02T05:00:00Z"),
    });
    const firstOf = (day: string) => slots.find((s) => s.start.toISOString().startsWith(day))!.start.toISOString();
    // Sat 31 Oct is EDT (UTC-4): 09:00 local = 13:00Z. Sun 1 Nov is EST (UTC-5): 09:00 local = 14:00Z.
    expect(firstOf("2026-10-31")).toBe("2026-10-31T13:00:00.000Z");
    expect(firstOf("2026-11-01")).toBe("2026-11-01T14:00:00.000Z");
    // Still 8 one-hour slots on each local day.
    expect(slots.filter((s) => s.start.toISOString().startsWith("2026-10-31"))).toHaveLength(8);
    expect(slots.filter((s) => s.start.toISOString().startsWith("2026-11-01"))).toHaveLength(8);
  });

  it("handles the start of US daylight time (8 Mar 2026)", () => {
    const slots = generateSlots({
      timezone: "America/New_York",
      rules: weekdays("09:00", "10:00"),
      overrides: [],
      durationMin: 60,
      from: new Date("2026-03-07T00:00:00Z"),
      to: new Date("2026-03-09T00:00:00Z"),
    });
    expect(slots.map((s) => s.start.toISOString())).toEqual(["2026-03-07T14:00:00.000Z", "2026-03-08T13:00:00.000Z"]);
  });

  it("supports several windows per day and steps by the duration", () => {
    const slots = generateSlots({
      timezone: "Asia/Kolkata",
      rules: [
        { weekday: 1, start_time: "09:00", end_time: "10:00" },
        { weekday: 1, start_time: "14:00", end_time: "15:15" },
      ],
      overrides: [],
      durationMin: 30,
      from: new Date("2026-11-09T00:00:00+05:30"), // a Monday
      to: new Date("2026-11-10T00:00:00+05:30"),
    });
    expect(slots.map((s) => s.start.toISOString())).toEqual([
      "2026-11-09T03:30:00.000Z",
      "2026-11-09T04:00:00.000Z",
      "2026-11-09T08:30:00.000Z",
      "2026-11-09T09:00:00.000Z", // 15:00–15:30 would overrun 15:15, so no third slot
    ]);
  });

  it("applies date overrides: a day off and custom hours", () => {
    const base = {
      timezone: "UTC",
      rules: weekdays("09:00", "11:00"),
      durationMin: 60,
      from: new Date("2026-11-09T00:00:00Z"),
      to: new Date("2026-11-11T00:00:00Z"),
    };
    const slots = generateSlots({
      ...base,
      overrides: [
        { date: "2026-11-09", start_time: null, end_time: null },
        { date: "2026-11-10", start_time: "15:00", end_time: "16:00" },
      ],
    });
    expect(slots.map((s) => s.start.toISOString())).toEqual(["2026-11-10T15:00:00.000Z"]);
  });
});

describe("filterAvailable", () => {
  const et = { id: "a", duration_min: 30, capacity: 1, buffer_before_min: 0, buffer_after_min: 15 };
  const slot = (iso: string) => ({ start: new Date(iso), end: new Date(new Date(iso).getTime() + 30 * 60_000) });

  it("removes slots that overlap another booking's buffers", () => {
    // Another event type's booking 10:00–10:30 with a 10-min buffer after blocks until 10:40.
    const busy = [
      {
        event_type_id: "b",
        starts_at: new Date("2026-11-10T10:00:00Z"),
        blocked_start: new Date("2026-11-10T10:00:00Z"),
        blocked_end: new Date("2026-11-10T10:40:00Z"),
      },
    ];
    const out = filterAvailable(et, [slot("2026-11-10T09:30:00Z"), slot("2026-11-10T10:30:00Z"), slot("2026-11-10T11:00:00Z")], busy);
    // 09:30 + 15 min buffer after reaches 10:15 (overlap); 10:30 starts inside 10:40; 11:00 is free.
    expect(out.map((s) => s.start.toISOString())).toEqual(["2026-11-10T11:00:00.000Z"]);
  });

  it("reports remaining seats for group slots", () => {
    const group = { ...et, capacity: 3, buffer_after_min: 0 };
    const s = "2026-11-10T10:00:00Z";
    const seat = { event_type_id: "a", starts_at: new Date(s), blocked_start: new Date(s), blocked_end: new Date("2026-11-10T10:30:00Z") };
    expect(filterAvailable(group, [slot(s)], [seat, seat])[0].remaining).toBe(1);
    expect(filterAvailable(group, [slot(s)], [seat, seat, seat])).toHaveLength(0);
  });
});
