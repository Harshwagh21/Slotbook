import { requireHost } from "@/lib/auth";
import { deleteEventType, updateEventType } from "@/lib/host";
import { ApiError, json, readBody, route } from "@/lib/http";
import { eventTypeBody, uuid } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

async function eventTypeId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw new ApiError(404, "not_found", "Event type not found");
  return id;
}

// PUT /api/host/event-types/{id}, DELETE /api/host/event-types/{id}
export const PUT = route(async (req: Request, ctx: Ctx) => {
  const host = await requireHost();
  const id = await eventTypeId(ctx);
  const body = await readBody(req, eventTypeBody);
  return json({ eventType: await updateEventType(host.id, id, body) });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const host = await requireHost();
  await deleteEventType(host.id, await eventTypeId(ctx));
  return json({ ok: true });
});
