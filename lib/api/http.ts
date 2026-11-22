import type { z } from "zod";
import { invalid } from "./errors.ts";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers": "authorization, content-type, x-telegram-init-data, x-timezone",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
    status,
  });
}

export function noContent(): Response {
  return new Response(null, { headers: CORS_HEADERS, status: 204 });
}

export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    const text = await request.text();
    raw = text.trim() === "" ? {} : JSON.parse(text);
  } catch {
    throw invalid("Send a JSON body.");
  }
  return schema.parse(raw);
}

export function readQuery<T extends z.ZodType>(url: URL, schema: T): z.infer<T> {
  return schema.parse(Object.fromEntries(url.searchParams.entries()));
}
