"use client";

import { useEffect, useState } from "react";
import { allTimeZones } from "@/lib/client";

export function TimeZoneSelect({ value, onChange, id }: { value: string; onChange: (tz: string) => void; id?: string }) {
  // The zone list comes from the browser after mount (it can differ from the server's list).
  const [zones, setZones] = useState<string[]>([]);
  useEffect(() => setZones(allTimeZones()), []);
  const options = zones.includes(value) ? zones : [value, ...zones];
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((z) => (
        <option key={z} value={z}>
          {z}
        </option>
      ))}
    </select>
  );
}
