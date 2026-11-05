import { describe, expect, it } from "vitest";
import { availabilityBody, overrideBody } from "@/lib/schemas";

describe("availability validation", () => {
  it("accepts several non-overlapping windows on one day (touching is fine)", () => {
    const r = availabilityBody.safeParse({
      rules: [
        { weekday: 1, start: "09:00", end: "12:00" },
        { weekday: 1, start: "12:00", end: "17:00" },
        { weekday: 2, start: "10:00", end: "11:00" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects overlapping windows on the same weekday", () => {
    const r = availabilityBody.safeParse({
      rules: [
        { weekday: 1, start: "13:00", end: "17:00" },
        { weekday: 1, start: "09:00", end: "14:00" },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rejects overlapping override windows and end before start", () => {
    expect(overrideBody.safeParse({ date: "2026-12-01", windows: [{ start: "09:00", end: "11:00" }, { start: "10:00", end: "12:00" }] }).success).toBe(false);
    expect(overrideBody.safeParse({ date: "2026-12-01", windows: [{ start: "11:00", end: "10:00" }] }).success).toBe(false);
    expect(overrideBody.safeParse({ date: "2026-12-01", windows: [] }).success).toBe(true);
  });
});
