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
      <section className="panel">
        <div className="panel__title">
          <h2>{booking.eventType.name}</h2>
          <span className="badge">{booking.status}</span>
        </div>
        <p>
          <strong>{formatDateTime(booking.start, tz)}</strong>
          <span className="muted"> – {formatDateTime(booking.end, tz)}</span>
        </p>
        <div className="row">
          <label htmlFor="tz">
            Time zone
            <TimeZoneSelect id="tz" value={tz} onChange={setTz} />
          </label>
        </div>
        <p className="muted">
          Guest: {booking.guestName} ({booking.guestEmail})
          <br />
          Host: {booking.host.name}
          {booking.cancelReason ? (
            <>
              <br />
              Reason: {booking.cancelReason}
            </>
          ) : null}
        </p>
        {message && <p className="ok">{message}</p>}
      </section>

      {booking.status === "confirmed" && (
        <>
          <section className="panel">
            <div className="panel__title">
              <h3>Reschedule</h3>
            </div>
            {rescheduling ? (
              <>
                <div className="row" style={{ marginTop: 0 }}>
                  <button onClick={() => setRescheduling(false)}>Close</button>
                </div>
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
              <button className="primary" onClick={() => setRescheduling(true)}>
                Pick a new time
              </button>
            )}
          </section>
          <section className="panel">
            <div className="panel__title">
              <h3>Cancel</h3>
            </div>
            <form action={cancel} className="row">
              <label style={{ flex: 1, minWidth: "12rem" }}>
                Reason (optional)
                <input name="reason" placeholder="Reason" maxLength={500} />
              </label>
              <button type="submit" className="btn--danger">
                Cancel booking
              </button>
            </form>
          </section>
        </>
      )}
    </>
  );
}
