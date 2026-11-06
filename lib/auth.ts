import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getPool } from "./db";
import { ApiError } from "./http";
import { verifyPassword } from "./password";

export const SESSION_COOKIE = "slotbook_session";
const SESSION_DAYS = 7;

export type Host = { id: string; handle: string; name: string; email: string; timezone: string };

/** Checks email + password and creates a session row. Returns the token, or null. */
export async function login(email: string, password: string): Promise<{ token: string; expires: Date } | null> {
  const { rows } = await getPool().query<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM hosts WHERE lower(email) = lower($1)",
    [email],
  );
  if (!rows[0] || !verifyPassword(password, rows[0].password_hash)) return null;
  const token = randomBytes(32).toString("base64url");
  const res = await getPool().query<{ expires_at: Date }>(
    "INSERT INTO sessions (token, host_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3)) RETURNING expires_at",
    [token, rows[0].id, SESSION_DAYS],
  );
  return { token, expires: res.rows[0].expires_at };
}

/** Delete the current session cookie's row from the database. */
export async function logout(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await getPool().query("DELETE FROM sessions WHERE token = $1", [token]);
}

/** The logged-in host for this request, or null. */
export async function currentHost(): Promise<Host | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { rows } = await getPool().query<Host>(
    `SELECT h.id, h.handle, h.name, h.email, h.timezone
       FROM sessions s JOIN hosts h ON h.id = s.host_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [token],
  );
  return rows[0] ?? null;
}

/** For host API routes: the logged-in host, or a 401. */
export async function requireHost(): Promise<Host> {
  const host = await currentHost();
  if (!host) throw new ApiError(401, "unauthorized", "Log in first");
  return host;
}
