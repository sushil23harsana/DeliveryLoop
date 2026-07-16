import { getUploads } from "../../../db/workspace";

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Screenshot is required" }, { status: 400 });
    if (!allowedTypes.has(file.type)) return Response.json({ error: "Use a PNG, JPG, WebP, or GIF image" }, { status: 400 });
    if (file.size > 8 * 1024 * 1024) return Response.json({ error: "Image must be under 8 MB" }, { status: 400 });
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "img";
    const key = `${crypto.randomUUID()}.${extension}`;
    await getUploads().put(key, file.stream(), {
      httpMetadata: { contentType: file.type, cacheControl: "private, max-age=3600" },
      customMetadata: { originalName: file.name.slice(0, 120) },
    });
    return Response.json({ key, url: `/api/uploads/${encodeURIComponent(key)}` }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 500 });
  }
}
