import { requireHost } from "@/lib/auth";
import { cancelByHost } from "@/lib/booking";
import { ApiError, json, readBody, route } from "@/lib/http";
import { cancelBody, uuid } from "@/lib/schemas";

// POST /api/host/bookings/{id}/cancel  body: { reason? }
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const host = await requireHost();
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw new ApiError(404, "not_found", "Booking not found");
  const { reason } = await readBody(req, cancelBody);
  return json({ booking: await cancelByHost(host.id, id, reason) });
});
