import { assertAuthConfigured, auth } from "../../../auth";
import { ensureDatabase } from "../../../../db/workspace";

async function handle(request: Request) {
  assertAuthConfigured();
  await ensureDatabase();
  return auth.handler(request);
}

export const GET = handle;
export const POST = handle;
