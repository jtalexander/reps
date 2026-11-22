/**
 * Netlify background function (the "-background" name gives it 15 minutes
 * instead of 60 seconds). Runs one Teach job that a coach action queued; the
 * page that started it polls the job row for the result. See src/teach/dispatch.ts.
 */
import { verifyJob } from "../../src/teach/dispatch";
import { runJob } from "../../src/teach/service";

const handler = async (req: Request) => {
  let body: { jobId?: unknown; sig?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // fall through to the check below
  }
  const { jobId, sig } = body;
  if (typeof jobId !== "string" || typeof sig !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId) || !verifyJob(jobId, sig)) {
    console.warn("teach-job-background: rejected request");
    return;
  }
  const job = await runJob(jobId);
  console.log("teach-job-background", jobId, job?.kind, job?.status, job?.error ?? "");
};

export default handler;
