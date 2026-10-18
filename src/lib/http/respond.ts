import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function notFound() {
  return json({ error: "Not found" }, 404);
}

export function badRequest(error: unknown) {
  if (error instanceof ZodError) {
    return json({ error: "Invalid request", issues: error.flatten() }, 400);
  }
  return json({ error: error instanceof Error ? error.message : "Invalid request" }, 400);
}
