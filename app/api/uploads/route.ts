import { canSubmitFeedback, enforceRateLimit, getUploads } from "../../../db/workspace";
import { apiError, json, requestActor, requireSameOrigin } from "../http";

const allowedTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

function hasValidSignature(type: string, bytes: Uint8Array) {
  if (type === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/gif") return String.fromCharCode(...bytes.slice(0, 6)) === "GIF87a" || String.fromCharCode(...bytes.slice(0, 6)) === "GIF89a";
  if (type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await requestActor(request);
    if (!canSubmitFeedback(actor)) return json({ error: "Your role has read-only access" }, { status: 403 });
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 9 * 1024 * 1024) return json({ error: "Upload is too large" }, { status: 413 });
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File)) return json({ error: "Screenshot is required" }, { status: 400 });
    const extension = allowedTypes.get(file.type);
    if (!extension) return json({ error: "Use a PNG, JPG, WebP, or GIF image" }, { status: 400 });
    if (!file.size || file.size > 8 * 1024 * 1024) return json({ error: "Image must be between 1 byte and 8 MB" }, { status: 400 });
    const signature = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (!hasValidSignature(file.type, signature)) return json({ error: "The uploaded file does not match its image type" }, { status: 400 });
    await enforceRateLimit(actor, "upload:create", 30, 60);
    const key = `${crypto.randomUUID()}.${extension}`;
    await getUploads().put(key, file.stream(), {
      httpMetadata: { contentType: file.type, cacheControl: "private, max-age=3600" },
      customMetadata: {
        originalName: file.name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120),
        uploadedBy: actor.id,
        clientId: actor.clientId || "internal",
      },
    });
    return json({ key, url: `/api/uploads/${encodeURIComponent(key)}` }, { status: 201 });
  } catch (error) {
    return apiError(error, request, "Upload failed");
  }
}
