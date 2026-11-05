import { notFound } from "next/navigation";
import { BookingPage } from "@/components/BookingPage";
import { getEventType } from "@/lib/booking";
import { getPool } from "@/lib/db";
import { ApiError } from "@/lib/http";

export const dynamic = "force-dynamic";

// Public booking page: /{host}/{event-slug}
export default async function Page({ params }: { params: Promise<{ host: string; slug: string }> }) {
  const { host, slug } = await params;
  const et = await getEventType(getPool(), host, slug).catch((e) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  });
  if (!et) notFound();
  return (
    <main className="app-shell">
      <div className="page-head">
        <div>
          <p className="badge">Public booking</p>
          <h1>{et.name}</h1>
          <p className="page-kicker">
            with {et.host_handle} · {et.duration_min} min
            {et.capacity > 1 ? ` · group of up to ${et.capacity}` : " · one-on-one"}
          </p>
        </div>
      </div>
      <BookingPage host={host} slug={slug} capacity={et.capacity} />
    </main>
  );
}
