import { cancelByToken } from "@/lib/booking";
import { json, readBody, route } from "@/lib/http";
import { cancelBody } from "@/lib/schemas";

// POST /api/bookings/{token}/cancel  body: { reason? }
export const POST = route(async (req: Request, ctx: { params: Promise<{ token: string }> }) => {
  const { token } = await ctx.params;
  const { reason } = await readBody(req, cancelBody);
  return json({ booking: await cancelByToken(token, reason) });
});
