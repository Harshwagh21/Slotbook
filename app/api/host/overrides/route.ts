import { requireHost } from "@/lib/auth";
import { listOverrides, setOverride } from "@/lib/host";
import { json, readBody, route } from "@/lib/http";
import { overrideBody } from "@/lib/schemas";

// GET /api/host/overrides, PUT /api/host/overrides  body: { date, windows: [{ start, end }] }  (no windows = day off)
export const GET = route(async () => {
  const host = await requireHost();
  return json({ overrides: await listOverrides(host.id) });
});

export const PUT = route(async (req: Request) => {
  const host = await requireHost();
  const body = await readBody(req, overrideBody);
  await setOverride(host.id, body);
  return json({ overrides: await listOverrides(host.id) });
});
