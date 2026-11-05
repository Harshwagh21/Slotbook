-- Slotbook schema. All instants are timestamptz (stored as UTC).

CREATE TABLE hosts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle        text NOT NULL UNIQUE CHECK (handle ~ '^[a-z0-9-]+$'),
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  timezone      text NOT NULL DEFAULT 'UTC',   -- IANA name, validated in the app
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token      text PRIMARY KEY,
  host_id    uuid NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE event_types (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id           uuid NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  slug              text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  name              text NOT NULL,
  duration_min      int  NOT NULL CHECK (duration_min BETWEEN 15 AND 120),
  capacity          int  NOT NULL DEFAULT 1 CHECK (capacity >= 1),
  buffer_before_min int  NOT NULL DEFAULT 0 CHECK (buffer_before_min BETWEEN 0 AND 30),
  buffer_after_min  int  NOT NULL DEFAULT 0 CHECK (buffer_after_min BETWEEN 0 AND 30),
  min_notice_min    int  NOT NULL DEFAULT 0 CHECK (min_notice_min >= 0),
  horizon_days      int  NOT NULL DEFAULT 30 CHECK (horizon_days >= 1),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (host_id, slug)
);

-- Weekly availability in the host's time zone. Several windows per day = several rows.
CREATE TABLE availability_rules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id    uuid NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  weekday    int  NOT NULL CHECK (weekday BETWEEN 1 AND 7),   -- ISO: 1 = Monday
  start_time time NOT NULL,
  end_time   time NOT NULL,
  CHECK (start_time < end_time)
);

-- Date overrides replace the weekly rules for that date.
-- A row with both times null means a day off; otherwise each row is a custom window.
CREATE TABLE date_overrides (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id    uuid NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  date       date NOT NULL,
  start_time time,
  end_time   time,
  CHECK ((start_time IS NULL AND end_time IS NULL) OR (start_time < end_time))
);
CREATE INDEX ON date_overrides (host_id, date);

CREATE TYPE booking_status AS ENUM ('held', 'confirmed', 'cancelled', 'expired');

CREATE TABLE bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id         uuid NOT NULL REFERENCES hosts(id),
  event_type_id   uuid NOT NULL REFERENCES event_types(id),
  status          booking_status NOT NULL DEFAULT 'held',
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  blocked_start   timestamptz NOT NULL,   -- starts_at - buffer_before
  blocked_end     timestamptz NOT NULL,   -- ends_at + buffer_after
  hold_expires_at timestamptz,            -- now() + 5 min, set by Postgres
  guest_name      text,
  guest_email     text,
  manage_token    text UNIQUE,            -- random, set on confirm
  cancel_reason   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at),
  CHECK (blocked_start <= starts_at AND blocked_end >= ends_at),
  CHECK (status <> 'confirmed' OR (manage_token IS NOT NULL AND guest_email IS NOT NULL))
);
CREATE INDEX ON bookings (host_id, blocked_start, blocked_end);
CREATE INDEX ON bookings (event_type_id, starts_at);

-- Stored responses for POST /api/holds, keyed by the Idempotency-Key header.
CREATE TABLE idempotency_keys (
  key             text PRIMARY KEY,
  request_hash    text NOT NULL,
  response_status int,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Notifications sink: one row per confirm / reschedule / cancel, written in the same transaction.
CREATE TABLE notifications (
  id         bigserial PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id),
  type       text NOT NULL CHECK (type IN ('confirmed', 'rescheduled', 'cancelled')),
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
