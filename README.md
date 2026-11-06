# Slotbook

A small booking app: hosts publish when they are free, guests book a slot, and nobody is double-booked.
It is a single Next.js (App Router) TypeScript app on Postgres 16. Route handlers are the JSON API, and the pages use that same API.

- **Starter template:** none (built from an empty folder).
- **Optional extensions built:** none (only the core).

## How to run

### One command (Docker)

```bash
docker compose up --build
```

This starts Postgres 16, waits for it to be healthy, then the app container runs migrations and the seed and serves on <http://localhost:3000>.

### Without the app container

```bash
docker compose up -d db   # Postgres on localhost:5432
pnpm i
pnpm dev                  # runs migrations + seed, then next dev on :3000
```

### Tests

```bash
docker compose up -d db
pnpm test
```

`pnpm test` creates a separate `slotbook_test` database if it is missing, migrates it, and runs every test (unit, booking rules, and concurrency) against real Postgres. Set `TEST_DATABASE_URL` to point it somewhere else.

### Demo login

| What | Value |
| --- | --- |
| Host login | <http://localhost:3000/login>, `demo@slotbook.dev` / `demo1234` |
| Dashboard | <http://localhost:3000/dashboard> |
| 1:1 booking page | <http://localhost:3000/demo/intro-call> (30 min, buffers 5/10 min, 4 h notice) |
| Group booking page | <http://localhost:3000/demo/group-workshop> (60 min, 5 seats, 15 min buffer after) |

The demo host's time zone is `Asia/Kolkata`, and its availability is Mon–Fri 09:00–12:00 and 13:00–17:00. The seed is idempotent, so it is safe to run on every start.

## 60-second UI tour

1. **Guest:** open `/demo/intro-call`. Slots for the next 30 days are grouped by day in your browser's time zone. Use the time-zone dropdown to see them in another zone.
2. Click a time. The slot is **held for 5 minutes**, with a countdown. Enter your name and email, then click **Confirm booking**.
3. You get a **private manage link** (`/manage/{token}`). Open it to view the booking, **reschedule** it (pick a new time) or **cancel** it (with an optional reason).
4. **Host:** log in at `/login`. The dashboard shows:
   - **Upcoming bookings**, each with a cancel-with-reason button.
   - **Home time zone** (IANA).
   - **Event types** (create, edit, delete: name, slug, duration 15–120, capacity, buffers 0–30, minimum notice, horizon).
   - **Weekly availability** (several windows per day).
   - **Date overrides** (a day off, or custom hours on one date).
5. Try opening the same slot in two tabs and holding it in both. The second tab gets "That slot is taken".

## API

All bodies are JSON. Errors look like `{ "error": { "code": "...", "message": "..." } }`.

### Guest (public)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/hosts/{host}/events/{slug}/slots?from&to&tz` | Available slots |
| POST | `/api/holds` (header `Idempotency-Key`) | Hold a slot for 5 minutes |
| POST | `/api/holds/{id}/confirm` | Confirm with guest details |
| POST | `/api/bookings/{token}/reschedule` | Move to a new slot |
| POST | `/api/bookings/{token}/cancel` | Cancel |

**GET slots**
- `from` and `to` are optional. Each can be an ISO instant (`2026-11-10T00:00:00Z`) or a date (`2026-11-10`). A date is read in `tz`, and `to` as a date means the end of that day. `tz` defaults to `UTC`.
- By default the range is now → now + 30 days. It is always clipped to `[now + minimum notice, now + horizon]`.
- Response:
  ```json
  { "host": {"handle":"demo","timezone":"Asia/Kolkata"},
    "eventType": {"slug":"intro-call","name":"Intro call","durationMin":30,"capacity":1},
    "tz": "America/New_York",
    "slots": [{"start":"2026-11-06T03:30:00.000Z","end":"2026-11-06T04:00:00.000Z","remaining":1,
               "localStart":"2026-11-05T22:30:00.000-05:00"}] }
  ```

**POST /api/holds**
- Request: header `Idempotency-Key: <uuid>`, body `{ "host": "demo", "slug": "intro-call", "start": "2026-11-06T03:30:00Z" }`.
- `201` → `{ holdId, start, end, expiresAt }`.
- Retrying with the same key and body returns the same hold. The same key with a different body → `422 idempotency_key_reused`. No key → `400`.
- `409 slot_taken` / `slot_full` when the slot is not free. `422 not_a_slot` / `not_bookable` when the time is not a real, bookable slot.

**POST /api/holds/{id}/confirm**
- Body: `{ "name": "Ana", "email": "ana@example.com" }`.
- `200` → `{ booking, manageToken, manageUrl }`.
- An expired hold → `410 hold_expired`. Confirming again is a no-op that returns the booking.

**POST /api/bookings/{token}/reschedule**
- Body: `{ "start": "<ISO instant>" }`.
- `200` → `{ booking }`. The booking keeps its id and manage link.
- `409` if the new slot is taken, or if the booking is cancelled or has already started.

**POST /api/bookings/{token}/cancel**
- Body: `{ "reason"?: "..." }`.
- `200` → `{ booking }`. Cancelling again is a no-op.

### Host (session cookie from login)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/host/login` `{email,password}` / `/api/host/logout` | Session cookie (httpOnly, 7 days) |
| GET, PUT | `/api/host/settings` `{timezone}` | Home time zone |
| GET, POST | `/api/host/event-types` | List / create event types |
| PUT, DELETE | `/api/host/event-types/{id}` | Update / delete (409 if it has bookings) |
| GET, PUT | `/api/host/availability` `{rules:[{weekday 1–7, start "09:00", end "12:00"}]}` | Replace weekly availability |
| GET, PUT | `/api/host/overrides` `{date, windows:[{start,end}]}` | Set one date's hours (`windows: []` = day off) |
| DELETE | `/api/host/overrides/{date}` | Remove an override |
| GET | `/api/host/bookings` | Upcoming confirmed bookings |
| POST | `/api/host/bookings/{id}/cancel` `{reason?}` | Cancel a booking as the host |

## How double-booking is prevented

Every hold, confirm, reschedule and cancel runs in **one Postgres transaction**. Each one:

1. takes `pg_advisory_xact_lock` for the host, so writes for one host run one at a time;
2. marks that host's stale holds `expired` (`hold_expires_at <= now()`);
3. counts overlapping `held` and `confirmed` bookings for that host, using the blocked range (start − buffer before, end + buffer after) and checking it against capacity;
4. writes.

The database's `now()` is the only clock, so a wrong client or server clock cannot extend a hold. Slot lists also ignore holds that have passed `hold_expires_at`, even before they are marked expired.

Notifications (`confirmed`, `rescheduled`, `cancelled`) are written to the `notifications` table **in the same transaction**. A notification is never lost or sent for a change that rolled back.

Tests (`tests/`):
- `slots.test.ts`: DST transitions (New York, March and November 2026), multiple windows, overrides, buffers, seats.
- `booking.test.ts`: idempotency, expiry, buffers across event types, notice, reschedule and cancel rules.
- `concurrency.test.ts`: 20 parallel holds on a 1:1 slot → exactly one wins; capacity 3 → exactly 3; 10 parallel retries with the same key → one hold.
- `schemas.test.ts`: availability window validation.

## Assumptions

- **Buffers block the host across all of their event types.** A buffer belongs to the host's time, not to one event type.
- **Group capacity is shared only by the same event type at the same start time.** Any other overlapping booking blocks the slot entirely.
- **Slots** step by the event's duration from the start of each availability window. A slot must end inside its window. Buffers may extend outside the window.
- Weekly availability and overrides are in the **host's** time zone. Slots are converted per date with Luxon, so DST changes are handled correctly. Windows on the same day must not overlap.
- An **override replaces** the weekly rules for its date. An override with no windows is a day off.
- **Minimum notice and horizon** are measured from the database's `now()`. The guest page shows at most the next 30 days.
- **Idempotency:** only a successful hold (`201`) is stored under its key. A failed attempt rolls back, so the same key can be retried. Reusing a key with a different body → `422`.
- **Confirm and cancel are idempotent by state.** Confirming a confirmed booking returns it again. Cancelling a cancelled booking returns it again.
- **Reschedule moves the same booking** (same id and manage link). It is allowed only while the booking is confirmed and has not started. The booking's own old time does not block the move.
- **An expired hold returns `410` on confirm.** The guest has to pick again.
- The **manage token** is a random 256-bit value. It is the only credential for the manage page.
- **Hosts can cancel any upcoming confirmed booking.** Deleting an event type that still has upcoming (held/confirmed) bookings is refused (`409`). Past, cancelled, or expired bookings are removed with the event type.
- The **host login is seeded** (scrypt password hash plus a session cookie). There is no host sign-up. Host handles are single path segments, so `api`, `dashboard`, `login` and `manage` cannot be used as handles.
- The `tz` parameter on the slots API only affects `localStart` and how date-only `from`/`to` values are read. Slot instants are always UTC.

## Project layout

```
app/                Next.js pages and API route handlers (app/api/...)
components/         Client components (booking page, slot picker, dashboard, manage page)
lib/                Booking engine (booking.ts), slot generation (slots.ts), host data, auth, schemas, db
db/migrations/      Plain SQL migrations
scripts/            migrate.ts, seed.ts, docker-entrypoint.sh
tests/              Vitest tests (real Postgres)
```

## Known gaps

- No optional extensions.
- Notifications are only written to the table. Nothing sends or reads them yet.
- The reschedule picker lists slots as other guests see them, so times next to the guest's own booking (inside its buffer) are hidden. The API itself allows those moves.
