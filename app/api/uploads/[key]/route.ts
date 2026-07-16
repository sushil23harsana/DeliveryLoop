import { getChatGPTUser } from "../../../chatgpt-auth";
import { AccessError, canAccessAttachment, getUploads, resolveActor } from "../../../../db/workspace";

export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await context.params;
    if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(key)) return new Response("Not found", { status: 404 });
    const user = await getChatGPTUser();
    const hostname = new URL(request.url).hostname;
    const actor = await resolveActor(
      user ? { email: user.email, name: user.displayName } : null,
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1",
    );
    if (!(await canAccessAttachment(key, actor))) return new Response("Not found", { status: 404 });
    const object = await getUploads().get(key);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "private, max-age=3600");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(object.body, { headers });
  } catch (error) {
    if (error instanceof AccessError) return new Response(error.message, { status: error.status });
    return new Response("Unable to retrieve attachment", { status: 500 });
  }
}
