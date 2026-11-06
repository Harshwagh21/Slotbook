import { notFound } from "next/navigation";
import { ManageBooking } from "@/components/ManageBooking";
import { getBookingByToken, getEventType } from "@/lib/booking";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Private manage page at `/manage/{token}` — token is the only credential. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getBookingByToken(token);
  if (!booking) notFound();
  const et = await getEventType(getPool(), booking.host.handle, booking.eventType.slug);
  return (
    <main className="app-shell">
      <div className="page-head">
        <div>
          <p className="badge">Manage booking</p>
          <h1>Your booking</h1>
          <p className="page-kicker">Private link — reschedule or cancel without an account.</p>
        </div>
      </div>
      <ManageBooking token={token} initial={booking} capacity={et.capacity} />
    </main>
  );
}
