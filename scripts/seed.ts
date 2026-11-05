// Seeds a demo host with two event types and weekday availability.
// Idempotent: safe to run on every container start.
import path from "node:path";
import { Client } from "pg";
import { DATABASE_URL } from "../lib/config";
import { hashPassword } from "../lib/password";

export const DEMO = {
  handle: "demo",
  name: "Demo Host",
  email: "demo@slotbook.dev",
  password: "demo1234",
  timezone: "Asia/Kolkata",
};

export async function seed(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO hosts (handle, name, email, password_hash, timezone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (handle) DO NOTHING`,
      [DEMO.handle, DEMO.name, DEMO.email, hashPassword(DEMO.password), DEMO.timezone],
    );
    const { rows } = await client.query<{ id: string }>("SELECT id FROM hosts WHERE handle = $1", [DEMO.handle]);
    const hostId = rows[0].id;

    // 30-min one-on-one and a 60-min group session of 5.
    await client.query(
      `INSERT INTO event_types (host_id, slug, name, duration_min, capacity, buffer_before_min, buffer_after_min, min_notice_min, horizon_days)
       VALUES ($1, 'intro-call', 'Intro call', 30, 1, 5, 10, 240, 30),
              ($1, 'group-workshop', 'Group workshop', 60, 5, 0, 15, 240, 30)
       ON CONFLICT (host_id, slug) DO NOTHING`,
      [hostId],
    );

    // Mon–Fri 09:00–12:00 and 13:00–17:00 (two windows a day), only if the host has none yet.
    const { rowCount } = await client.query("SELECT 1 FROM availability_rules WHERE host_id = $1 LIMIT 1", [hostId]);
    if (!rowCount) {
      for (let weekday = 1; weekday <= 5; weekday++) {
        await client.query(
          `INSERT INTO availability_rules (host_id, weekday, start_time, end_time)
           VALUES ($1, $2, '09:00', '12:00'), ($1, $2, '13:00', '17:00')`,
          [hostId, weekday],
        );
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  seed(DATABASE_URL)
    .then(() => console.log(`seeded demo host: ${DEMO.email} / ${DEMO.password}`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
