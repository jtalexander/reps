/**
 * Start a Teach job without holding up the request that asked for it.
 *
 * On Netlify a normal function stops at 60 seconds, and reading pages or
 * writing a topic can take minutes. So the job row is created first, then
 * handed to the `teach-job-background` function (up to 15 minutes), and the
 * page polls `jobStatus` until it's done. Locally there is no limit, so the
 * dev server runs the job itself.
 *
 * Only callers that already checked the coach start jobs. The background
 * function only runs a job whose id is signed with BETTER_AUTH_SECRET, and
 * `runJob` only claims queued jobs, so a replayed call can't run the AI twice.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "@/db";
import { db } from "@/db";
import { jobs } from "@/db/teach-schema";
import { eq } from "drizzle-orm";
import { runJob } from "./service";

export const BACKGROUND_PATH = "/.netlify/functions/teach-job-background";

function secret() {
  const k = process.env.BETTER_AUTH_SECRET;
  if (!k) throw new Error("BETTER_AUTH_SECRET is not set.");
  return k;
}

export function signJob(jobId: string) {
  return createHmac("sha256", secret()).update(`teach-job:${jobId}`).digest("hex");
}

const same = (want: string, got: string) => {
  const a = Buffer.from(want);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
};

export function verifyJob(jobId: string, sig: string) {
  return same(signJob(jobId), sig);
}

/** Workers for a whole-playbook run carry the team and the site address they call back to. */
export function signWorker(teamId: string, origin: string) {
  return createHmac("sha256", secret()).update(`teach-worker:${teamId}:${origin}`).digest("hex");
}

export function verifyWorker(teamId: string, origin: string, sig: string) {
  return same(signWorker(teamId, origin), sig);
}

/** The background reader asks the site to crop a batch's drawings; the request carries this. */
export function signBatch(batchId: string) {
  return createHmac("sha256", secret()).update(`read-batch:${batchId}`).digest("hex");
}

export function verifyBatch(batchId: string, sig: string) {
  return same(signBatch(batchId), sig);
}

export const onNetlify = () => !!(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT);

/** Hand a queued job to whatever can run it. Never throws. */
export async function dispatchJob(jobId: string, origin: string | null, database: Db = db) {
  if (!onNetlify()) {
    // Local dev / tests / scripts: run in this process, don't wait for it.
    void runJob(jobId, database).catch((err) => console.error("job", jobId, err));
    return;
  }
  try {
    if (!origin) throw new Error("no site address on the request");
    const res = await fetch(origin + BACKGROUND_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, sig: signJob(jobId) }),
    });
    if (res.status !== 202) throw new Error(`background function answered ${res.status}`);
  } catch (err) {
    // Running it here would be cut off at 60 seconds mid-write, so fail fast instead.
    console.error("job dispatch", jobId, err);
    await database
      .update(jobs)
      .set({ status: "failed", error: "RepWon couldn't start this. Try again in a minute." })
      .where(eq(jobs.id, jobId));
  }
}
