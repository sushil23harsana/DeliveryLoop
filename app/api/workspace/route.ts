import { getChatGPTUser } from "../../chatgpt-auth";
import {
  addComment,
  approveRelease,
  createClient,
  createProject,
  createRelease,
  createTicket,
  getWorkspace,
  updateChecklist,
  updateTicket,
} from "../../../db/workspace";

async function actor() {
  const user = await getChatGPTUser();
  return user?.displayName || "Demo Operator";
}

export async function GET() {
  try {
    return Response.json({ workspace: await getWorkspace(), actor: await actor() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load workspace" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; payload?: Record<string, string> & { checklist?: string[] } };
    const payload = body.payload || {};
    const currentActor = await actor();
    let result: unknown = null;
    switch (body.action) {
      case "createClient": result = await createClient(payload, currentActor); break;
      case "createProject": result = await createProject(payload, currentActor); break;
      case "createRelease": result = await createRelease(payload, currentActor); break;
      case "createTicket": result = await createTicket(payload, currentActor); break;
      case "updateTicket": result = await updateTicket(payload, currentActor); break;
      case "addComment": result = await addComment(payload, currentActor); break;
      case "updateChecklist": result = await updateChecklist(payload, currentActor); break;
      case "approveRelease": result = await approveRelease(payload, currentActor); break;
      default: return Response.json({ error: "Unknown action" }, { status: 400 });
    }
    return Response.json({ ok: true, result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Action failed" }, { status: 500 });
  }
}
