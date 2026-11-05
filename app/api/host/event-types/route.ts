import { requireHost } from "@/lib/auth";
import { createEventType, listEventTypes } from "@/lib/host";
import { json, readBody, route } from "@/lib/http";
import { eventTypeBody } from "@/lib/schemas";

// GET /api/host/event-types, POST /api/host/event-types
export const GET = route(async () => {
  const host = await requireHost();
  return json({ eventTypes: await listEventTypes(host.id) });
});

export const POST = route(async (req: Request) => {
  const host = await requireHost();
  const body = await readBody(req, eventTypeBody);
  return json({ eventType: await createEventType(host.id, body) }, 201);
});
