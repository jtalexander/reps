/**
 * Netlify background function (the "-background" name gives it 15 minutes
 * instead of 60 seconds). Two kinds of request, both signed:
 *  - { jobId, sig }: run one Teach job a coach button queued; the page polls it.
 *  - { worker: teamId, origin, sig }: work through a whole-playbook run's queue,
 *    then hand off to a fresh worker if time ran out.
 * See src/teach/dispatch.ts and src/teach/playbook-run.ts.
 */
import { verifyJob, verifyWorker } from "../../src/teach/dispatch";
import { dispatchWorkers, workTeam } from "../../src/teach/playbook-run";
import { runJob } from "../../src/teach/service";

const UUID = /^[0-9a-f-]{36}$/i;
const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i;

const handler = async (req: Request) => {
  let body: { jobId?: unknown; worker?: unknown; origin?: unknown; sig?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // fall through to the checks below
  }
  const { jobId, worker, origin, sig } = body;
  if (typeof sig !== "string") return console.warn("teach-job-background: rejected request");

  if (typeof worker === "string" && typeof origin === "string" && UUID.test(worker) && ORIGIN.test(origin) && verifyWorker(worker, origin, sig)) {
    const r = await workTeam(worker, origin);
    console.log("teach-job-background worker", worker, r);
    if (r === "more") await dispatchWorkers(worker, origin, 1);
    return;
  }
  if (typeof jobId === "string" && UUID.test(jobId) && verifyJob(jobId, sig)) {
    const job = await runJob(jobId);
    console.log("teach-job-background", jobId, job?.kind, job?.status, job?.error ?? "");
    return;
  }
  console.warn("teach-job-background: rejected request");
};

export default handler;
