import { getChatGPTUser } from "../../chatgpt-auth";
import {
  AccessError,
  addComment,
  approveRelease,
  createClient,
  createMember,
  createProject,
  createRelease,
  createTicket,
  getWorkspace,
  resolveActor,
  updateChecklist,
  updateTicket,
} from "../../../db/workspace";

async function currentActor(request: Request) {
  const user = await getChatGPTUser();
  const hostname = new URL(request.url).hostname;
  const allowDemo = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  return resolveActor(user ? { email: user.email, name: user.displayName } : null, allowDemo);
}

function errorResponse(error: unknown, fallback: string) {
  const status = error instanceof AccessError ? error.status : 500;
  return Response.json({ error: error instanceof Error ? error.message : fallback }, { status });
}

export async function GET(request: Request) {
  try {
    const actor = await currentActor(request);
    return Response.json({ workspace: await getWorkspace(actor), actor });
  } catch (error) {
    return errorResponse(error, "Unable to load workspace");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; payload?: Record<string, string> & { checklist?: string[] } };
    const payload = body.payload || {};
    const actor = await currentActor(request);
    let result: unknown = null;
    switch (body.action) {
      case "createClient": result = await createClient(payload, actor); break;
      case "createMember": result = await createMember(payload, actor); break;
      case "createProject": result = await createProject(payload, actor); break;
      case "createRelease": result = await createRelease(payload, actor); break;
      case "createTicket": result = await createTicket(payload, actor); break;
      case "updateTicket": result = await updateTicket(payload, actor); break;
      case "addComment": result = await addComment(payload, actor); break;
      case "updateChecklist": result = await updateChecklist(payload, actor); break;
      case "approveRelease": result = await approveRelease(payload, actor); break;
      default: return Response.json({ error: "Unknown action" }, { status: 400 });
    }
    return Response.json({ ok: true, result });
  } catch (error) {
    return errorResponse(error, "Action failed");
  }
}
