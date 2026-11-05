import { redirect } from "next/navigation";
import { Availability, Bookings, EventTypes, LogoutButton, Overrides, Settings } from "@/components/Dashboard";
import { currentHost } from "@/lib/auth";
import { getAvailability, listEventTypes, listOverrides, upcomingBookings } from "@/lib/host";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const host = await currentHost();
  if (!host) redirect("/login");
  const [eventTypes, rules, overrides, bookings] = await Promise.all([
    listEventTypes(host.id),
    getAvailability(host.id),
    listOverrides(host.id),
    upcomingBookings(host.id),
  ]);
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Hi, {host.name}</h1>
        <LogoutButton />
      </div>
      <Bookings bookings={bookings} timezone={host.timezone} />
      <Settings key={host.timezone} timezone={host.timezone} />
      <EventTypes handle={host.handle} eventTypes={eventTypes} />
      <Availability key={JSON.stringify(rules)} rules={rules} />
      <Overrides overrides={overrides} />
    </>
  );
}
