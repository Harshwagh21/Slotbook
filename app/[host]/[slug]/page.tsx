import { notFound } from "next/navigation";
import { BookingPage } from "@/components/BookingPage";
import { getEventType } from "@/lib/booking";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public booking page: /{host}/{event-slug}
export default async function Page({ params }: { params: Promise<{ host: string; slug: string }> }) {
  const { host, slug } = await params;
  const et = await getEventType(getPool(), host, slug).catch(() => null);
  if (!et) notFound();
  return (
    <>
      <h1>{et.name}</h1>
      <p className="muted">
        with {et.host_handle} · {et.duration_min} min{et.capacity > 1 ? ` · group of up to ${et.capacity}` : " · one-on-one"}
      </p>
      <BookingPage host={host} slug={slug} capacity={et.capacity} />
    </>
  );
}
