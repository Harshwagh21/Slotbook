import { rescheduleBooking } from "@/lib/booking";
import { json, readBody, route } from "@/lib/http";
import { rescheduleBody } from "@/lib/schemas";

// POST /api/bookings/{token}/reschedule  body: { start }
export const POST = route(async (req: Request, ctx: { params: Promise<{ token: string }> }) => {
  const { token } = await ctx.params;
  const { start } = await readBody(req, rescheduleBody);
  return json({ booking: await rescheduleBooking(token, start) });
});
