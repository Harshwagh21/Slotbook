import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { cancelByHost, cancelByToken, confirmHold, createHold, listSlots, getEventType, rescheduleBooking } from "@/lib/booking";
import type { ApiError } from "@/lib/http";
import { createEventType, createHost, db, futureSlot, plusMinutes, resetDb } from "./helpers";

const guest = { name: "Gita", email: "gita@example.com" };

async function expectError(p: Promise<unknown>, status: number, code?: string) {
  const err = (await p.then(
    () => null,
    (e) => e,
  )) as ApiError | null;
  expect(err, "expected the call to fail").not.toBeNull();
  expect(err!.status).toBe(status);
  if (code) expect(err!.code).toBe(code);
}

async function book(slug: string, start: string) {
  const hold = await createHold({ host: "alice", slug, start }, randomUUID());
  return confirmHold(hold.body.holdId, guest);
}

describe("holds and idempotency", () => {
  beforeEach(resetDb);

  it("an idempotent retry returns the same hold", async () => {
    const hostId = await createHost();
    await createEventType(hostId, "call");
    const start = futureSlot();
    const key = randomUUID();
    const first = await createHold({ host: "alice", slug: "call", start }, key);
    const retry = await createHold({ host: "alice", slug: "call", start }, key);
    expect(first.status).toBe(201);
    expect(retry).toEqual(first);
    const { rows } = await db().query("SELECT count(*)::int AS n FROM bookings");
    expect(rows[0].n).toBe(1);
  });

  it("the same key with a different body is rejected with 422", async () => {
    const hostId = await createHost();
    await createEventType(hostId, "call");
    const key = randomUUID();
    await createHold({ host: "alice", slug: "call", start: futureSlot() }, key);
    await expectError(createHold({ host: "alice", slug: "call", start: futureSlot(2, 11) }, key), 422, "idempotency_key_reused");
  });

  it("rejects a start that is not a real slot", async () => {
    const hostId = await createHost();
    await createEventType(hostId, "call");
    await expectError(createHold({ host: "alice", slug: "call", start: futureSlot(2, 10, 7) }, randomUUID()), 422, "not_a_slot");
  });

  it("rejects a start inside the minimum notice or in the past", async () => {
    const hostId = await createHost();
    await createEventType(hostId, "call", { minNotice: 4 * 24 * 60 });
    await expectError(createHold({ host: "alice", slug: "call", start: futureSlot(2) }, randomUUID()), 422, "not_bookable");
    await expectError(createHold({ host: "alice", slug: "call", start: futureSlot(-1) }, randomUUID()), 422, "not_bookable");
  });
});

describe("confirm and expiry", () => {
  beforeEach(resetDb);

  it("confirms a live hold, gives a manage token and writes a notification", async () => {
    const hostId = await createHost();
    await createEventType(hostId, "call");
    const { booking, manageToken } = await book("call", futureSlot());
    expect(booking.status).toBe("confirmed");
    expect(manageToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { rows } = await db().query("SELECT type FROM notifications");
    expect(rows.map((r) => r.type)).toEqual(["confirmed"]);
  });

  it("confirming an expired hold is rejected with 410", async () => {
    const hostId = await createHost();
    await createEventType(hostId, "call");
    const hold = await createHold({ host: "alice", slug: "call", start: futureSlot() }, randomUUID());
    await db().query("UPDATE bookings SET hold_expires_at = now() - interval '1 second' WHERE id = $1", [hold.body.holdId]);
    await expectError(confirmHold(hold.body.holdId, guest), 410, "hold_expired");
    const { rows } = await db().query("SELECT count(*)::int AS n FROM notifications");
    expect(rows[0].n).toBe(0);
  });

  it("an expired hold no longer blocks the slot", async () => {
    const hostId = await createHost();
    await createEventType(hostId, "call");
    const start = futureSlot();
    const hold = await createHold({ host: "alice", slug: "call", start }, randomUUID());
    await expectError(createHold({ host: "alice", slug: "call", start }, randomUUID()), 409);
    await db().query("UPDATE bookings SET hold_expires_at = now() - interval '1 second' WHERE id = $1", [hold.body.holdId]);
    const again = await createHold({ host: "alice", slug: "call", start }, randomUUID());
    expect(again.status).toBe(201);
    const { rows } = await db().query("SELECT status FROM bookings WHERE id = $1", [hold.body.holdId]);
    expect(rows[0].status).toBe("expired");
  });
});

describe("buffers", () => {
  beforeEach(resetDb);

  it("a hold overlapping another booking's buffer is rejected, across event types", async () => {
    const hostId = await createHost();
    await createEventType(hostId, "call", { bufferAfter: 15 }); // 10:00–10:30 blocks until 10:45
    await createEventType(hostId, "other");
    const start = futureSlot(2, 10);
    await book("call", start);
    await expectError(createHold({ host: "alice", slug: "other", start: plusMinutes(start, 30) }, randomUUID()), 409, "slot_taken");
    expect((await createHold({ host: "alice", slug: "other", start: plusMinutes(start, 60) }, randomUUID())).status).toBe(201);
  });

  it("a buffer before the new slot is checked too", async () => {
    const hostId = await createHost();
    await createEventType(hostId, "call");
    await createEventType(hostId, "prep", { bufferBefore: 15 }); // needs 15 free minutes before it
    const start = futureSlot(2, 10);
    await book("call", start);
    await expectError(createHold({ host: "alice", slug: "prep", start: plusMinutes(start, 30) }, randomUUID()), 409);
  });

  it("the slots list hides slots blocked by buffers and full seats", async () => {
    const hostId = await createHost();
    await createEventType(hostId, "call", { bufferAfter: 15 });
    const start = futureSlot(2, 10);
    await book("call", start);
    const et = await getEventType(db(), "alice", "call");
    const slots = await listSlots(db(), et, { from: new Date(plusMinutes(start, -60)), to: new Date(plusMinutes(start, 120)) });
    expect(slots.map((s) => s.start.toISOString())).toEqual([
      plusMinutes(start, -60),
      // -30 would end at 10:00 but its own 15-min buffer after overlaps the booking
      plusMinutes(start, 60),
      plusMinutes(start, 90),
    ]);
  });
});

describe("reschedule and cancel", () => {
  beforeEach(resetDb);

  it("moves a booking to a free slot and keeps the manage link", async () => {
    const hostId = await createHost();
    await createEventType(hostId, "call");
    const { manageToken, booking } = await book("call", futureSlot(2, 10));
    const moved = await rescheduleBooking(manageToken, futureSlot(3, 12));
    expect(moved.id).toBe(booking.id);
    expect(moved.start).toBe(futureSlot(3, 12));
    // The old slot is free again.
    expect((await createHold({ host: "alice", slug: "call", start: futureSlot(2, 10) }, randomUUID())).status).toBe(201);
    const { rows } = await db().query("SELECT type FROM notifications ORDER BY id");
    expect(rows.map((r) => r.type)).toEqual(["confirmed", "rescheduled"]);
  });

  it("rejects a reschedule into a taken slot and leaves the booking where it was", async () => {
    const hostId = await createHost();
    await createEventType(hostId, "call");
    const a = await book("call", futureSlot(2, 10));
    await book("call", futureSlot(2, 11));
    await expectError(rescheduleBooking(a.manageToken, futureSlot(2, 11)), 409);
    const { rows } = await db().query("SELECT starts_at FROM bookings WHERE id = $1", [a.booking.id]);
    expect(rows[0].starts_at.toISOString()).toBe(futureSlot(2, 10));
  });

  it("a reschedule can overlap its own old time (it does not conflict with itself)", async () => {
    const hostId = await createHost();
    await createEventType(hostId, "call", { bufferAfter: 30 });
    const { manageToken } = await book("call", futureSlot(2, 10));
    const moved = await rescheduleBooking(manageToken, futureSlot(2, 10, 30));
    expect(moved.start).toBe(futureSlot(2, 10, 30));
  });

  it("cancel frees the slot, stores the reason and cannot be rescheduled after", async () => {
    const hostId = await createHost();
    await createEventType(hostId, "call");
    const start = futureSlot();
    const { manageToken } = await book("call", start);
    const cancelled = await cancelByToken(manageToken, "Can't make it");
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelReason).toBe("Can't make it");
    expect((await cancelByToken(manageToken)).status).toBe("cancelled"); // idempotent
    await expectError(rescheduleBooking(manageToken, futureSlot(3)), 409, "booking_not_active");
    expect((await createHold({ host: "alice", slug: "call", start }, randomUUID())).status).toBe(201);
    const { rows } = await db().query("SELECT type FROM notifications ORDER BY id");
    expect(rows.map((r) => r.type)).toEqual(["confirmed", "cancelled"]);
  });

  it("a host can cancel only their own bookings", async () => {
    const hostId = await createHost();
    const otherId = await createHost("bob");
    await createEventType(hostId, "call");
    const { booking } = await book("call", futureSlot());
    await expectError(cancelByHost(otherId, booking.id, "nope"), 404);
    expect((await cancelByHost(hostId, booking.id, "Sick")).cancelReason).toBe("Sick");
  });
});
