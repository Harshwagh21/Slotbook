import { confirmHold } from "@/lib/booking";
import { ApiError, json, readBody, route } from "@/lib/http";
import { confirmBody, uuid } from "@/lib/schemas";

// POST /api/holds/{id}/confirm  body: { name, email }
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw new ApiError(404, "not_found", "Hold not found");
  const guest = await readBody(req, confirmBody);
  const { booking, manageToken } = await confirmHold(id, guest);
  return json({ booking, manageToken, manageUrl: new URL(`/manage/${manageToken}`, req.url).toString() });
});
