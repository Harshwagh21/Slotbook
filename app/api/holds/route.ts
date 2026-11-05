import { createHold } from "@/lib/booking";
import { ApiError, json, readBody, route } from "@/lib/http";
import { holdBody } from "@/lib/schemas";

// POST /api/holds  (header: Idempotency-Key)  body: { host, slug, start }
export const POST = route(async (req: Request) => {
  const key = req.headers.get("idempotency-key");
  if (!key || key.length > 200) throw new ApiError(400, "missing_idempotency_key", "Send an Idempotency-Key header (max 200 chars)");
  const body = await readBody(req, holdBody);
  const result = await createHold(body, key);
  return json(result.body, result.status);
});
