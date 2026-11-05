import { requireHost } from "@/lib/auth";
import { upcomingBookings } from "@/lib/host";
import { json, route } from "@/lib/http";

// GET /api/host/bookings  -> upcoming confirmed bookings
export const GET = route(async () => {
  const host = await requireHost();
  return json({ bookings: await upcomingBookings(host.id) });
});
