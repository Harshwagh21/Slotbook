import { NextResponse } from "next/server";
import { login, SESSION_COOKIE } from "@/lib/auth";
import { ApiError, readBody, route } from "@/lib/http";
import { loginBody } from "@/lib/schemas";

// POST /api/host/login  body: { email, password }  -> sets an httpOnly session cookie
export const POST = route(async (req: Request) => {
  const { email, password } = await readBody(req, loginBody);
  const session = await login(email, password);
  if (!session) throw new ApiError(401, "invalid_credentials", "Wrong email or password");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: session.expires,
    secure: new URL(req.url).protocol === "https:",
  });
  return res;
});
