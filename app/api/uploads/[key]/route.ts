import { AccessError, canAccessAttachment, deleteOrphanUpload, getUploads } from "../../../../db/workspace";
import { requestActor, requireSameOrigin } from "../../http";

export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await context.params;
    if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(key)) return new Response("Not found", { status: 404 });
    const actor = await requestActor(request);
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
    console.error(JSON.stringify({ message: "Unable to retrieve attachment", error: error instanceof Error ? error.message : String(error) }));
    return new Response("Unable to retrieve attachment", { status: 500 });
  }
}

/**
 * Cleans up an upload that never reached a ticket.
 *
 * The report form uploads screenshots in parallel and calls this for the keys
 * that succeeded when a sibling upload failed — without it, a failed submission
 * leaves paid-for R2 objects nobody can see or reach.
 *
 * All of the authorisation lives in deleteOrphanUpload: uploader-owned AND
 * unreferenced, denying by default. This handler only adds the same-origin
 * check every other mutating route carries.
 */
export async function DELETE(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    requireSameOrigin(request);
    const { key } = await context.params;
    const actor = await requestActor(request);
    await deleteOrphanUpload(key, actor);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof AccessError) return new Response(error.message, { status: error.status });
    console.error(JSON.stringify({ message: "Unable to delete attachment", error: error instanceof Error ? error.message : String(error) }));
    return new Response("Unable to delete attachment", { status: 500 });
  }
}
