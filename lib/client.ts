// Small browser-side helpers shared by the client components.

export type ApiResult<T> = { ok: boolean; status: number; data: T & { error?: { code: string; message: string } } };

export async function api<T = Record<string, unknown>>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function allTimeZones(): string[] {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

// Fixed locale so server-rendered and browser-rendered text match (no hydration mismatch).
const LOCALE = "en-US";

export function formatDateTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(new Date(iso));
}

export function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeStyle: "short", timeZone: tz }).format(new Date(iso));
}

export function formatDay(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(new Date(iso));
}
