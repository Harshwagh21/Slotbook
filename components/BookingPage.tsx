"use client";

import { useEffect, useState } from "react";
import { api, browserTimeZone, formatDateTime } from "@/lib/client";
import { SlotPicker } from "./SlotPicker";
import { TimeZoneSelect } from "./TimeZoneSelect";

type Hold = { holdId: string; start: string; end: string; expiresAt: string };

/** Guest booking flow: pick a slot → 5-min hold → confirm → manage link. */
export function BookingPage(props: { host: string; slug: string; capacity: number }) {
  const [tz, setTz] = useState("UTC");
  const [hold, setHold] = useState<Hold | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [manageUrl, setManageUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => setTz(browserTimeZone()), []);

  // Countdown for the 5-minute hold. The server enforces expiry; this is only for display.
  useEffect(() => {
    if (!hold || manageUrl) return;
    const tick = () => {
      const left = Math.max(0, Math.round((new Date(hold.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        setHold(null);
        setMessage("Your hold expired. Please pick a slot again.");
        setReloadKey((k) => k + 1);
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [hold, manageUrl]);

  /** Hold the chosen slot with an Idempotency-Key (one retry on network error). */
  async function pick(start: string) {
    setBusy(true);
    setMessage(null);
    // One key per pick: a retry after a network error reuses it and gets the same hold back.
    const key = crypto.randomUUID();
    const send = () =>
      api<Hold>("/api/holds", { method: "POST", headers: { "Idempotency-Key": key }, body: { host: props.host, slug: props.slug, start } });
    const r = await send().catch(() => send());
    setBusy(false);
    if (r.ok) setHold(r.data);
    else {
      setMessage(r.data.error?.message ?? "Could not hold that slot");
      setReloadKey((k) => k + 1);
    }
  }

  /** Confirm the live hold with guest name + email; shows the manage URL on success. */
  async function confirm(form: FormData) {
    if (!hold) return;
    setBusy(true);
    const r = await api<{ manageUrl: string }>(`/api/holds/${hold.holdId}/confirm`, {
      method: "POST",
      body: { name: form.get("name"), email: form.get("email") },
    });
    setBusy(false);
    if (r.ok) setManageUrl(r.data.manageUrl);
    else {
      setMessage(r.data.error?.message ?? "Could not confirm");
      if (r.status === 410) {
        setHold(null);
        setReloadKey((k) => k + 1);
      }
    }
  }

  if (manageUrl && hold) {
    return (
      <section className="panel">
        <p className="badge">Confirmed</p>
        <h2>Booked</h2>
        <p>
          {formatDateTime(hold.start, tz)} <span className="muted">({tz})</span>
        </p>
        <p className="muted">Your private link to view, reschedule or cancel:</p>
        <p>
          <a href={manageUrl}>{manageUrl}</a>
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="panel">
        <div className="row" style={{ marginTop: 0 }}>
          <label htmlFor="tz">
            Time zone
            <TimeZoneSelect id="tz" value={tz} onChange={setTz} />
          </label>
        </div>
        {message && <p className="error">{message}</p>}
      </section>

      {hold ? (
        <section className="panel">
          <div className="panel__title">
            <h2>{formatDateTime(hold.start, tz)}</h2>
          </div>
          <p>
            Held for you for{" "}
            <span className="hold-timer">
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
            </span>
          </p>
          <form action={confirm} className="stack">
            <div className="row">
              <label>
                Your name
                <input name="name" placeholder="Your name" required />
              </label>
              <label>
                Email
                <input name="email" type="email" placeholder="you@example.com" required />
              </label>
            </div>
            <div className="row">
              <button type="submit" className="primary" disabled={busy}>
                Confirm booking
              </button>
              <button type="button" onClick={() => setHold(null)}>
                Pick another time
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="panel">
          <div className="panel__title">
            <h2>Available slots</h2>
          </div>
          <SlotPicker host={props.host} slug={props.slug} tz={tz} capacity={props.capacity} reloadKey={reloadKey} onPick={busy ? () => {} : pick} />
        </section>
      )}
    </>
  );
}
