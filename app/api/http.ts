import { assertAuthConfigured, auth } from "../auth";
import { AccessError, resolveActor, type Actor } from "../../db/workspace";

export type ActionPayload = Record<string, string> & { checklist?: string[]; attachmentKeys?: string[]; memberIds?: string[] };

const ARRAY_PAYLOAD_KEYS = new Set(["checklist", "attachmentKeys", "memberIds"]);

function localDemoAllowed(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export async function requestActor(request: Request): Promise<Actor> {
  assertAuthConfigured();
  const session = await auth.api.getSession({ headers: request.headers });
  return resolveActor(session?.user ? { email: session.user.email, name: session.user.name } : null, localDemoAllowed(request));
}

export function requireSameOrigin(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin && origin !== url.origin) throw new AccessError("Cross-origin request rejected", 403);
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) throw new AccessError("Cross-site request rejected", 403);
}

export async function parseActionRequest(request: Request): Promise<{ action: string; payload: ActionPayload }> {
  requireSameOrigin(request);
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw new AccessError("Use application/json", 415);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 64 * 1024) throw new AccessError("Request is too large", 413);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AccessError("Invalid JSON request", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AccessError("Invalid request", 400);
  const record = body as Record<string, unknown>;
  if (typeof record.action !== "string" || !record.action || record.action.length > 64) throw new AccessError("Action is required", 400);
  if (!record.payload || typeof record.payload !== "object" || Array.isArray(record.payload)) throw new AccessError("Payload is required", 400);
  const payload: ActionPayload = {};
  for (const [key, value] of Object.entries(record.payload as Record<string, unknown>)) {
    if (typeof value === "string") payload[key] = value;
    else if (ARRAY_PAYLOAD_KEYS.has(key) && Array.isArray(value) && value.length <= 60 && value.every((item) => typeof item === "string")) {
      payload[key as "checklist" | "attachmentKeys" | "memberIds"] = value as string[];
    } else throw new AccessError(`Invalid value for ${key}`, 400);
  }
  return { action: record.action, payload };
}

export function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  return Response.json(data, { ...init, headers });
}

export function apiError(error: unknown, request: Request, fallback: string) {
  if (error instanceof AccessError) return json({ error: error.message }, { status: error.status });
  console.error(JSON.stringify({
    message: fallback,
    error: error instanceof Error ? error.message : String(error),
    method: request.method,
    path: new URL(request.url).pathname,
  }));
  return json({ error: fallback }, { status: 500 });
}
