import { NextResponse } from "next/server";
import { logout, SESSION_COOKIE } from "@/lib/auth";
import { route } from "@/lib/http";

// POST /api/host/logout
export const POST = route(async () => {
  await logout();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
