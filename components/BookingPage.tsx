"use client";

import { useEffect, useState } from "react";
import { api, browserTimeZone, formatDateTime } from "@/lib/client";
import { SlotPicker } from "./SlotPicker";
import { TimeZoneSelect } from "./TimeZoneSelect";

type Hold = { holdId: string; start: string; end: string; expiresAt: string };

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
      <section>
        <h2>Booked!</h2>
        <p>{formatDateTime(hold.start, tz)} ({tz})</p>
        <p>
          Your private link to view, reschedule or cancel: <a href={manageUrl}>{manageUrl}</a>
        </p>
      </section>
    );
  }

  return (
    <>
      <div className="row">
        <label htmlFor="tz">Time zone</label>
        <TimeZoneSelect id="tz" value={tz} onChange={setTz} />
      </div>
      {message && <p className="error">{message}</p>}
      {hold ? (
        <section>
          <h2>{formatDateTime(hold.start, tz)}</h2>
          <p>
            Held for you for{" "}
            <b>
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
            </b>
          </p>
          <form action={confirm}>
            <div className="row">
              <input name="name" placeholder="Your name" required />
              <input name="email" type="email" placeholder="you@example.com" required />
              <button type="submit" disabled={busy}>
                Confirm booking
              </button>
              <button type="button" onClick={() => setHold(null)}>
                Pick another time
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section>
          <SlotPicker host={props.host} slug={props.slug} tz={tz} capacity={props.capacity} reloadKey={reloadKey} onPick={busy ? () => {} : pick} />
        </section>
      )}
    </>
  );
}
