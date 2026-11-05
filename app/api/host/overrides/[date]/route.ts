import { z } from "zod";
import { requireHost } from "@/lib/auth";
import { deleteOverride } from "@/lib/host";
import { json, route } from "@/lib/http";

// DELETE /api/host/overrides/{YYYY-MM-DD}
export const DELETE = route(async (_req: Request, ctx: { params: Promise<{ date: string }> }) => {
  const host = await requireHost();
  const date = z.iso.date().parse((await ctx.params).date);
  await deleteOverride(host.id, date);
  return json({ ok: true });
});
