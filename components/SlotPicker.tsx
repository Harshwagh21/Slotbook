"use client";

import { useEffect, useState } from "react";
import { api, formatDay, formatTime } from "@/lib/client";

type Slot = { start: string; end: string; remaining: number };

/** Lists available slots (next 30 days) grouped by day in `tz`. */
export function SlotPicker({
  host,
  slug,
  tz,
  capacity,
  reloadKey,
  onPick,
}: {
  host: string;
  slug: string;
  tz: string;
  capacity: number;
  reloadKey: number;
  onPick: (start: string) => void;
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSlots(null);
    api<{ slots: Slot[] }>(`/api/hosts/${host}/events/${slug}/slots?tz=${encodeURIComponent(tz)}`).then((r) => {
      if (cancelled) return;
      if (r.ok) setSlots(r.data.slots);
      else setError(r.data.error?.message ?? "Could not load slots");
    });
    return () => {
      cancelled = true;
    };
  }, [host, slug, tz, reloadKey]);

  if (error) return <p className="error">{error}</p>;
  if (!slots) return <p className="muted">Loading slots…</p>;
  if (slots.length === 0) return <p>No available slots in the next 30 days.</p>;

  const days = new Map<string, Slot[]>();
  for (const s of slots) {
    const day = formatDay(s.start, tz);
    days.set(day, [...(days.get(day) ?? []), s]);
  }
  return (
    <div>
      {[...days.entries()].map(([day, list]) => (
        <div key={day}>
          <h3>{day}</h3>
          <div className="slots">
            {list.map((s) => (
              <button key={s.start} onClick={() => onPick(s.start)}>
                {formatTime(s.start, tz)}
                {capacity > 1 ? ` (${s.remaining} left)` : ""}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
