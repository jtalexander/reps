/**
 * Netlify background function: reads one playbook box with Claude.
 * The "-background" suffix gives it up to 15 minutes and makes Netlify
 * answer the caller with 202 right away. Requests must carry a signature
 * made with the app's secret (see src/server/dispatch.ts).
 */
import { verifyRead } from "../../src/server/dispatch";
import { extractPlayRow } from "../../src/server/extract-row";

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body: { teamId?: string; playId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const { teamId, playId } = body;
  if (!teamId || !playId || !verifyRead(teamId, playId, req.headers.get("x-reps-signature"))) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    await extractPlayRow(teamId, playId);
  } catch (err) {
    console.error("read-box failed", playId, err);
  }
  return new Response(null, { status: 202 });
};
