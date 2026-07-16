import {
  addComment,
  approveRelease,
  createClient,
  createMember,
  createProject,
  createRelease,
  createTicket,
  getWorkspace,
  updateChecklist,
  updateMember,
  updateTicket,
} from "../../../db/workspace";
import { apiError, json, parseActionRequest, requestActor } from "../http";

export async function GET(request: Request) {
  try {
    const actor = await requestActor(request);
    return json({ workspace: await getWorkspace(actor), actor });
  } catch (error) {
    return apiError(error, request, "Unable to load workspace");
  }
}

export async function POST(request: Request) {
  try {
    const { action, payload } = await parseActionRequest(request);
    const actor = await requestActor(request);
    let result: unknown = null;
    switch (action) {
      case "createClient": result = await createClient(payload, actor); break;
      case "createMember": result = await createMember(payload, actor); break;
      case "updateMember": result = await updateMember(payload, actor); break;
      case "createProject": result = await createProject(payload, actor); break;
      case "createRelease": result = await createRelease(payload, actor); break;
      case "createTicket": result = await createTicket(payload, actor); break;
      case "updateTicket": result = await updateTicket(payload, actor); break;
      case "addComment": result = await addComment(payload, actor); break;
      case "updateChecklist": result = await updateChecklist(payload, actor); break;
      case "approveRelease": result = await approveRelease(payload, actor); break;
      default: return json({ error: "Unknown action" }, { status: 400 });
    }
    return json({ ok: true, result });
  } catch (error) {
    return apiError(error, request, "Action failed");
  }
}
