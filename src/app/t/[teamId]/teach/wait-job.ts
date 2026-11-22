/**
 * Browser side of a Teach AI job: start it, then check every few seconds
 * until it's done. Works the same locally and on Netlify (see src/teach/dispatch.ts).
 */
import { safeCall, type ActionResult } from "@/lib/safe-call";
import { jobStatusAction } from "./actions";

export type JobOutcome = ActionResult<{ status: "done" | "failed"; error: string | null; result: Record<string, number> | null }>;

const EVERY_MS = 3000;
const GIVE_UP_MS = 17 * 60 * 1000; // the server marks a job failed after 16 minutes
const MAX_MISSES = 5; // tolerate a few dropped checks (phone signal, a deploy)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runAndWait(teamId: string, start: () => Promise<ActionResult<{ jobId: string }>>, what: string): Promise<JobOutcome> {
  const started = await safeCall(start, what);
  if (!started.ok) return started;
  const until = Date.now() + GIVE_UP_MS;
  let misses = 0;
  while (Date.now() < until) {
    await sleep(EVERY_MS);
    const r = await safeCall(() => jobStatusAction(teamId, started.jobId), what);
    if (!r.ok) {
      if (++misses >= MAX_MISSES) return r;
      continue;
    }
    misses = 0;
    if (r.status === "done" || r.status === "failed") return { ok: true, status: r.status, error: r.error, result: r.result };
  }
  return { ok: false, error: `${what} is taking too long. Reload the page in a few minutes to see if it finished.` };
}
