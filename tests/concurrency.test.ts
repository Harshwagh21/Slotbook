import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createHold } from "@/lib/booking";
import { ApiError } from "@/lib/http";
import { createEventType, createHost, db, futureSlot, resetDb } from "./helpers";

// 20 guests try the same slot at the same moment, against real Postgres.
async function race(slug: string, start: string, n = 20) {
  const results = await Promise.allSettled(
    Array.from({ length: n }, () => createHold({ host: "alice", slug, start }, randomUUID())),
  );
  const ok = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  return { ok, rejected };
}

describe("concurrency", () => {
  beforeEach(resetDb);

  it("20 parallel holds on a 1:1 slot give exactly 1 success", async () => {
    const hostId = await createHost();
    await createEventType(hostId, "one-on-one", { capacity: 1 });
    const start = futureSlot();

    const { ok, rejected } = await race("one-on-one", start);
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(19);
    for (const r of rejected) expect((r.reason as ApiError).status).toBe(409);

    const { rows } = await db().query("SELECT count(*)::int AS n FROM bookings WHERE status = 'held'");
    expect(rows[0].n).toBe(1);
  });

  it("20 parallel holds on a group slot never exceed capacity", async () => {
    const hostId = await createHost();
    await createEventType(hostId, "group", { capacity: 3 });
    const start = futureSlot();

    const { ok, rejected } = await race("group", start);
    expect(ok).toHaveLength(3);
    expect(rejected).toHaveLength(17);

    const { rows } = await db().query("SELECT count(*)::int AS n FROM bookings WHERE status IN ('held','confirmed')");
    expect(rows[0].n).toBe(3);
  });

  it("parallel retries with the same Idempotency-Key create one hold", async () => {
    const hostId = await createHost();
    await createEventType(hostId, "one-on-one");
    const start = futureSlot();
    const key = randomUUID();

    const results = await Promise.all(
      Array.from({ length: 10 }, () => createHold({ host: "alice", slug: "one-on-one", start }, key)),
    );
    expect(new Set(results.map((r) => r.body.holdId)).size).toBe(1);
    const { rows } = await db().query("SELECT count(*)::int AS n FROM bookings");
    expect(rows[0].n).toBe(1);
  });
});
