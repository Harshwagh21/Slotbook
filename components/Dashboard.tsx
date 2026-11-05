"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AvailabilityRule, DateOverride, EventType, UpcomingBooking } from "@/lib/host";
import { api, formatDateTime } from "@/lib/client";
import { TimeZoneSelect } from "./TimeZoneSelect";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Calls the API, shows the error if any, and refreshes the server-rendered data on success. */
function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function run(path: string, method: string, body?: unknown): Promise<boolean> {
    setError(null);
    const r = await api(path, { method, body });
    if (!r.ok) {
      setError(r.data.error?.message ?? `Request failed (${r.status})`);
      return false;
    }
    router.refresh();
    return true;
  }
  return { run, error };
}

export function Settings({ timezone }: { timezone: string }) {
  const { run, error } = useAction();
  const [tz, setTz] = useState(timezone);
  return (
    <section className="panel">
      <div className="panel__title">
        <h2>Home time zone</h2>
      </div>
      <div className="row">
        <label>
          Time zone
          <TimeZoneSelect value={tz} onChange={setTz} />
        </label>
        <button className="primary" onClick={() => run("/api/host/settings", "PUT", { timezone: tz })}>
          Save
        </button>
      </div>
      <p className="muted">Weekly availability and date overrides are read in this time zone.</p>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

const EMPTY: Omit<EventType, "id"> = {
  name: "",
  slug: "",
  durationMin: 30,
  capacity: 1,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minNoticeMin: 240,
  horizonDays: 30,
};

function EventTypeForm({ initial, onSave, onCancel }: {
  initial: Omit<EventType, "id">;
  onSave: (e: Omit<EventType, "id">) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [e, setE] = useState(initial);
  const num = (k: keyof typeof e) => (ev: React.ChangeEvent<HTMLInputElement>) => setE({ ...e, [k]: Number(ev.target.value) });
  return (
    <form
      className="stack"
      action={async () => {
        if ((await onSave(e)) && !onCancel) setE(EMPTY);
      }}
    >
      <div className="row">
        <label>Name <input value={e.name} onChange={(ev) => setE({ ...e, name: ev.target.value })} required /></label>
        <label>Slug <input value={e.slug} onChange={(ev) => setE({ ...e, slug: ev.target.value })} required pattern="[a-z0-9-]+" /></label>
      </div>
      <div className="row">
        <label>Duration (min) <input type="number" min={15} max={120} value={e.durationMin} onChange={num("durationMin")} /></label>
        <label>Capacity <input type="number" min={1} value={e.capacity} onChange={num("capacity")} /></label>
        <label>Buffer before <input type="number" min={0} max={30} value={e.bufferBeforeMin} onChange={num("bufferBeforeMin")} /></label>
        <label>Buffer after <input type="number" min={0} max={30} value={e.bufferAfterMin} onChange={num("bufferAfterMin")} /></label>
        <label>Min notice (min) <input type="number" min={0} value={e.minNoticeMin} onChange={num("minNoticeMin")} /></label>
        <label>Horizon (days) <input type="number" min={1} max={365} value={e.horizonDays} onChange={num("horizonDays")} /></label>
      </div>
      <div className="row">
        <button type="submit" className="primary">{onCancel ? "Save" : "Create event type"}</button>
        {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

export function EventTypes({ handle, eventTypes }: { handle: string; eventTypes: EventType[] }) {
  const { run, error } = useAction();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="panel">
      <div className="panel__title">
        <h2>Event types</h2>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Length</th><th>Seats</th><th>Buffers</th><th>Notice / horizon</th><th></th></tr>
          </thead>
          <tbody>
            {eventTypes.map((et) =>
              editing === et.id ? (
                <tr key={et.id}>
                  <td colSpan={6}>
                    <EventTypeForm
                      initial={et}
                      onCancel={() => setEditing(null)}
                      onSave={async (e) => {
                        const ok = await run(`/api/host/event-types/${et.id}`, "PUT", e);
                        if (ok) setEditing(null);
                        return ok;
                      }}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={et.id}>
                  <td>
                    <a href={`/${handle}/${et.slug}`}>{et.name}</a>
                    <div className="dim">/{handle}/{et.slug}</div>
                  </td>
                  <td>{et.durationMin} min</td>
                  <td>{et.capacity}</td>
                  <td>{et.bufferBeforeMin} / {et.bufferAfterMin} min</td>
                  <td>{et.minNoticeMin} min / {et.horizonDays} days</td>
                  <td>
                    <div className="row" style={{ margin: 0 }}>
                      <button onClick={() => setEditing(et.id)}>Edit</button>
                      <button
                        className="btn--danger"
                        onClick={() => window.confirm(`Delete ${et.name}?`) && run(`/api/host/event-types/${et.id}`, "DELETE")}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <h3 style={{ marginTop: "1.25rem" }}>New event type</h3>
      <EventTypeForm initial={EMPTY} onSave={(e) => run("/api/host/event-types", "POST", e)} />
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export function Availability({ rules: initial }: { rules: AvailabilityRule[] }) {
  const { run, error } = useAction();
  const [rules, setRules] = useState(initial);
  const update = (i: number, patch: Partial<AvailabilityRule>) => setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <section className="panel">
      <div className="panel__title">
        <h2>Weekly availability</h2>
      </div>
      <p className="muted">Add several windows for a day to split it (e.g. 09:00–12:00 and 13:00–17:00).</p>
      {rules.map((r, i) => (
        <div className="row" key={i}>
          <label>
            Day
            <select value={r.weekday} onChange={(e) => update(i, { weekday: Number(e.target.value) })}>
              {WEEKDAYS.map((d, n) => <option key={d} value={n + 1}>{d}</option>)}
            </select>
          </label>
          <label>
            Start
            <input type="time" value={r.start} onChange={(e) => update(i, { start: e.target.value })} />
          </label>
          <label>
            End
            <input type="time" value={r.end} onChange={(e) => update(i, { end: e.target.value })} />
          </label>
          <button onClick={() => setRules(rules.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <div className="row">
        <button onClick={() => setRules([...rules, { weekday: 1, start: "09:00", end: "17:00" }])}>Add window</button>
        <button className="primary" onClick={() => run("/api/host/availability", "PUT", { rules })}>Save availability</button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export function Overrides({ overrides }: { overrides: DateOverride[] }) {
  const { run, error } = useAction();
  const [date, setDate] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("14:00");
  return (
    <section className="panel">
      <div className="panel__title">
        <h2>Date overrides</h2>
      </div>
      <p className="muted">An override replaces the weekly hours on that date.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th>Windows</th><th></th></tr>
          </thead>
          <tbody>
            {overrides.length === 0 ? (
              <tr><td colSpan={3} className="muted">No overrides yet.</td></tr>
            ) : (
              overrides.map((o) => (
                <tr key={o.date}>
                  <td>{o.date}</td>
                  <td>{o.windows.length === 0 ? "Day off" : o.windows.map((w) => `${w.start}–${w.end}`).join(", ")}</td>
                  <td><button onClick={() => run(`/api/host/overrides/${o.date}`, "DELETE")}>Remove</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: "1rem" }}>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button disabled={!date} onClick={() => run("/api/host/overrides", "PUT", { date, windows: [] })}>Mark day off</button>
        <label>
          Start
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          End
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <button
          className="primary"
          disabled={!date}
          onClick={() => {
            const existing = overrides.find((o) => o.date === date)?.windows ?? [];
            run("/api/host/overrides", "PUT", { date, windows: [...existing, { start, end }] });
          }}
        >
          Add hours
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export function Bookings({ bookings, timezone }: { bookings: UpcomingBooking[]; timezone: string }) {
  const { run, error } = useAction();
  return (
    <section className="panel">
      <div className="panel__title">
        <h2>Upcoming bookings</h2>
      </div>
      {bookings.length === 0 ? (
        <p className="muted">No upcoming bookings.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>When ({timezone})</th><th>Event</th><th>Guest</th><th></th></tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>{formatDateTime(b.start, timezone)}</td>
                  <td>{b.eventType}</td>
                  <td>{b.guestName}<div className="dim">{b.guestEmail}</div></td>
                  <td>
                    <form className="row" style={{ margin: 0 }} action={(f) => { run(`/api/host/bookings/${b.id}/cancel`, "POST", { reason: String(f.get("reason") ?? "") || undefined }); }}>
                      <input name="reason" placeholder="Reason" maxLength={500} />
                      <button type="submit" className="btn--danger">Cancel</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button onClick={async () => { await api("/api/host/logout", { method: "POST" }); router.push("/login"); }}>
      Log out
    </button>
  );
}
