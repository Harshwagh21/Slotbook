"use client";

import { useEffect, useState } from "react";
import type { BookingView } from "@/lib/booking";
import { api, browserTimeZone, formatDateTime } from "@/lib/client";
import { SlotPicker } from "./SlotPicker";
import { TimeZoneSelect } from "./TimeZoneSelect";

export function ManageBooking({ token, initial, capacity }: { token: string; initial: BookingView; capacity: number }) {
  const [booking, setBooking] = useState(initial);
  const [tz, setTz] = useState("UTC");
  const [rescheduling, setRescheduling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => setTz(browserTimeZone()), []);

  async function reschedule(start: string) {
    if (!window.confirm(`Move your booking to ${formatDateTime(start, tz)}?`)) return;
    const r = await api<{ booking: BookingView }>(`/api/bookings/${token}/reschedule`, { method: "POST", body: { start } });
    if (r.ok) {
      setBooking(r.data.booking);
      setRescheduling(false);
      setMessage("Rescheduled.");
    } else {
      setMessage(r.data.error?.message ?? "Could not reschedule");
      setReloadKey((k) => k + 1);
    }
  }

  async function cancel(form: FormData) {
    const r = await api<{ booking: BookingView }>(`/api/bookings/${token}/cancel`, {
      method: "POST",
      body: { reason: String(form.get("reason") ?? "") || undefined },
    });
    if (r.ok) {
      setBooking(r.data.booking);
      setMessage("Cancelled.");
    } else setMessage(r.data.error?.message ?? "Could not cancel");
  }

  return (
    <>
      <section>
        <h2>{booking.eventType.name}</h2>
        <p>
          <b>{formatDateTime(booking.start, tz)}</b> – {formatDateTime(booking.end, tz)}
        </p>
        <div className="row">
          <label htmlFor="tz">Time zone</label>
          <TimeZoneSelect id="tz" value={tz} onChange={setTz} />
        </div>
        <p>
          Guest: {booking.guestName} ({booking.guestEmail})<br />
          Host: {booking.host.name}
          <br />
          Status: <b>{booking.status}</b>
          {booking.cancelReason ? ` (reason: ${booking.cancelReason})` : ""}
        </p>
        {message && <p className="muted">{message}</p>}
      </section>

      {booking.status === "confirmed" && (
        <>
          <section>
            <h3>Reschedule</h3>
            {rescheduling ? (
              <>
                <button onClick={() => setRescheduling(false)}>Close</button>
                <SlotPicker
                  host={booking.host.handle}
                  slug={booking.eventType.slug}
                  tz={tz}
                  capacity={capacity}
                  reloadKey={reloadKey}
                  onPick={reschedule}
                />
              </>
            ) : (
              <button onClick={() => setRescheduling(true)}>Pick a new time</button>
            )}
          </section>
          <section>
            <h3>Cancel</h3>
            <form action={cancel} className="row">
              <input name="reason" placeholder="Reason (optional)" maxLength={500} />
              <button type="submit">Cancel booking</button>
            </form>
          </section>
        </>
      )}
    </>
  );
}
