import { requireHost } from "@/lib/auth";
import { getAvailability, setAvailability } from "@/lib/host";
import { json, readBody, route } from "@/lib/http";
import { availabilityBody } from "@/lib/schemas";

// GET /api/host/availability, PUT /api/host/availability  body: { rules: [{ weekday, start, end }] }
export const GET = route(async () => {
  const host = await requireHost();
  return json({ rules: await getAvailability(host.id) });
});

export const PUT = route(async (req: Request) => {
  const host = await requireHost();
  const { rules } = await readBody(req, availabilityBody);
  await setAvailability(host.id, rules);
  return json({ rules: await getAvailability(host.id) });
});
