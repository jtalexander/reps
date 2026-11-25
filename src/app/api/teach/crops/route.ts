/**
 * The background reader's cropping step: crops the next few drawings of a
 * playbook batch. Called only by the background worker, signed with the
 * batch id (the image library runs here, not in the background function).
 */
import { verifyBatch } from "@/teach/dispatch";
import { cropSome } from "@/teach/read-batch";

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(req: Request) {
  let body: { batch?: unknown; sig?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // checked below
  }
  const { batch, sig } = body;
  if (typeof batch !== "string" || typeof sig !== "string" || !UUID.test(batch) || !verifyBatch(batch, sig)) return new Response("No", { status: 403 });
  return Response.json({ left: await cropSome(batch) });
}
