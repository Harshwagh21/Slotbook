"use client";

import { useMemo } from "react";
import { allTimeZones } from "@/lib/client";

export function TimeZoneSelect({ value, onChange, id }: { value: string; onChange: (tz: string) => void; id?: string }) {
  const zones = useMemo(() => {
    const list = allTimeZones();
    return list.includes(value) ? list : [value, ...list];
  }, [value]);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {zones.map((z) => (
        <option key={z} value={z}>
          {z}
        </option>
      ))}
    </select>
  );
}
