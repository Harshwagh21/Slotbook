import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

/** An error with an HTTP status, rendered as { error: { code, message } }. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return json({ error: { code: "invalid_input", message } }, 422);
  }
  console.error(err);
  return json({ error: { code: "internal", message: "Something went wrong" } }, 500);
}

/** Wraps a route handler so thrown ApiError / ZodError become JSON error responses. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let data: unknown;
  try {
    const text = await req.text();
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be JSON");
  }
  return schema.parse(data);
}
