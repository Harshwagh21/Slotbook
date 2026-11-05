import { requireHost } from "@/lib/auth";
import { setTimezone } from "@/lib/host";
import { json, readBody, route } from "@/lib/http";
import { settingsBody } from "@/lib/schemas";

// GET /api/host/settings, PUT /api/host/settings  body: { timezone }
export const GET = route(async () => json({ host: await requireHost() }));

export const PUT = route(async (req: Request) => {
  const host = await requireHost();
  const { timezone } = await readBody(req, settingsBody);
  await setTimezone(host.id, timezone);
  return json({ host: { ...host, timezone } });
});
