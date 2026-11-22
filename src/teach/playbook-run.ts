/**
 * Whole-playbook run: one tap reads every page, finds Reps' questions for
 * every topic, sorts them, and writes draft lessons and questions, all on the
 * server so the coach can close the page.
 *
 * A run is a `jobs` row (kind "playbook", status running, result.stage) plus
 * ordinary queued jobs. Workers (background functions on Netlify, the dev
 * server locally) claim queued jobs one at a time. When a stage's queue is
 * empty and nothing is still running, exactly one worker moves the run to the
 * next stage, queues its jobs and calls in more workers. A worker hands off to
 * a fresh one before Netlify's 15-minute limit.
 */
import { and, asc, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { uploadPages } from "@/db/schema";
import { jobs, teachPages, topics } from "@/db/teach-schema";
import { BACKGROUND_PATH, onNetlify, signWorker } from "./dispatch";
import { claimNextJob, executeJob, failJob, prepareDecode } from "./service";

export const WORKERS = 3;
/** Stop taking new jobs after this long, leaving room for the last one inside 15 minutes. */
const BUDGET_MS = 8 * 60 * 1000;
const STUCK_MS = 16 * 60 * 1000;

export const STAGES = ["reading", "questions", "sorting", "writing", "done"] as const;
export type Stage = (typeof STAGES)[number];

type Job = typeof jobs.$inferSelect;

export async function activeRun(teamId: string, database: Db = db): Promise<Job | null> {
  const [run] = await database
    .select()
    .from(jobs)
    .where(and(eq(jobs.teamId, teamId), eq(jobs.kind, "playbook"), eq(jobs.status, "running")))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  return run ?? null;
}

/** Queue jobs in this order (claims go oldest first). */
async function enqueue(teamId: string, kind: "decode_page" | "find_gaps" | "write_topic" | "triage", refs: string[], database: Db) {
  if (!refs.length) return 0;
  const base = Date.now();
  await database.insert(jobs).values(refs.map((ref, i) => ({ teamId, kind, ref, createdAt: new Date(base + i) })));
  return refs.length;
}

/** Start (or return the already-running) whole-playbook run. Pages already read are skipped. */
export async function startPlaybookRun(teamId: string, uploadId: string, database: Db = db) {
  const existing = await activeRun(teamId, database);
  if (existing) return existing;
  const pages = await database
    .select({ n: uploadPages.pageNo })
    .from(uploadPages)
    .where(and(eq(uploadPages.teamId, teamId), eq(uploadPages.uploadId, uploadId)));
  if (!pages.length) throw new Error("That playbook hasn't been split into pages yet. Open it on the Upload tab first.");
  const read = new Set(
    (
      await database
        .select({ n: teachPages.pageNo })
        .from(teachPages)
        .where(and(eq(teachPages.teamId, teamId), eq(teachPages.uploadId, uploadId), inArray(teachPages.status, ["decoded", "not_playbook"])))
    ).map((r) => r.n),
  );
  const todo = pages
    .map((p) => p.n)
    .filter((n) => !read.has(n))
    .sort((a, b) => a - b);
  const [run] = await database.insert(jobs).values({ teamId, kind: "playbook", ref: uploadId, status: "running", result: { stage: 0 } }).returning();
  await enqueue(teamId, "decode_page", await prepareDecode(teamId, uploadId, todo, database), database);
  return run!;
}

/**
 * Called by an idle worker. Fails jobs a dead worker left behind, and if the
 * current stage is finished, moves the run on (only one worker wins that).
 * Returns how many jobs the next stage queued, or null when there's nothing to do.
 */
async function advanceRun(teamId: string, database: Db): Promise<number | null> {
  const run = await activeRun(teamId, database);
  if (!run) return null;
  const stuck = await database
    .select()
    .from(jobs)
    .where(and(eq(jobs.teamId, teamId), eq(jobs.status, "running"), ne(jobs.kind, "playbook"), lt(jobs.updatedAt, new Date(Date.now() - STUCK_MS))));
  for (const j of stuck) await failJob(j, "This took too long and stopped.", database);
  const [busy] = await database
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(eq(jobs.teamId, teamId), inArray(jobs.status, ["queued", "running"]), ne(jobs.kind, "playbook")));
  if (busy!.n > 0) return null; // others are still working on this stage

  const stage = run.result?.stage ?? 0;
  const [won] = await database
    .update(jobs)
    .set({ result: { ...run.result, stage: stage + 1 } })
    .where(and(eq(jobs.id, run.id), sql`(${jobs.result}->>'stage')::int = ${stage}`))
    .returning();
  if (!won) return null; // another worker moved it on

  const next = STAGES[stage + 1] ?? "done";
  const ts = await database.select().from(topics).where(and(eq(topics.teamId, teamId), eq(topics.archived, false))).orderBy(asc(topics.sort));
  if (next === "questions") return enqueue(teamId, "find_gaps", ts.filter((t) => !t.gapsFoundAt).map((t) => t.id), database);
  if (next === "sorting") return enqueue(teamId, "triage", [teamId], database);
  if (next === "writing") return enqueue(teamId, "write_topic", ts.filter((t) => !t.generatedAt).map((t) => t.id), database);
  await database.update(jobs).set({ status: "done" }).where(eq(jobs.id, run.id));
  return null;
}

/** Work through a team's queue. "more" = ran out of time with work possibly left. */
export async function workTeam(teamId: string, origin: string | null, budgetMs = BUDGET_MS, database: Db = db): Promise<"idle" | "more"> {
  const until = Date.now() + budgetMs;
  while (Date.now() < until) {
    const job = await claimNextJob(teamId, database);
    if (job) {
      await executeJob(job, database);
      continue;
    }
    const queued = await advanceRun(teamId, database);
    if (queued === null) return "idle";
    if (queued > 1) await dispatchWorkers(teamId, origin, Math.min(WORKERS, queued) - 1, database);
  }
  return "more";
}

/** Call in n more workers for a team. Never throws. */
export async function dispatchWorkers(teamId: string, origin: string | null, n: number, database: Db = db) {
  if (n <= 0) return;
  if (!onNetlify()) {
    for (let i = 0; i < n; i++) void workTeam(teamId, origin, Number.POSITIVE_INFINITY, database).catch((err) => console.error("worker", teamId, err));
    return;
  }
  if (!origin) return console.error("worker dispatch: no site address");
  await Promise.all(
    Array.from({ length: n }, () =>
      fetch(origin + BACKGROUND_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ worker: teamId, origin, sig: signWorker(teamId, origin) }),
      })
        .then((r) => {
          if (r.status !== 202) console.error("worker dispatch answered", r.status);
        })
        .catch((err) => console.error("worker dispatch", err)),
    ),
  );
}

/** Stop a run: queued work is dropped, whatever is mid-way finishes. */
export async function stopPlaybookRun(teamId: string, database: Db = db) {
  const run = await activeRun(teamId, database);
  if (!run) return;
  await database.update(jobs).set({ status: "failed", error: "Stopped by the coach." }).where(eq(jobs.id, run.id));
  const queued = await database.select().from(jobs).where(and(eq(jobs.teamId, teamId), eq(jobs.status, "queued"), ne(jobs.kind, "playbook")));
  for (const j of queued) await failJob(j, "Stopped by the coach.", database);
}

/** What the Teach page shows while a run is going. */
export async function runProgress(teamId: string, database: Db = db) {
  const run = await activeRun(teamId, database);
  if (!run) return null;
  const pageRows = await database
    .select({ status: teachPages.status, n: sql<number>`count(*)::int` })
    .from(teachPages)
    .where(and(eq(teachPages.teamId, teamId), eq(teachPages.uploadId, run.ref)))
    .groupBy(teachPages.status);
  const count = (...ss: string[]) => pageRows.filter((r) => ss.includes(r.status)).reduce((a, r) => a + r.n, 0);
  const [t] = await database
    .select({
      total: sql<number>`count(*)::int`,
      asked: sql<number>`count(${topics.gapsFoundAt})::int`,
      written: sql<number>`count(${topics.generatedAt})::int`,
    })
    .from(topics)
    .where(and(eq(topics.teamId, teamId), eq(topics.archived, false)));
  const [act] = await database
    .select({
      running: sql<number>`count(*) filter (where ${jobs.status} = 'running')::int`,
      last: sql<Date | null>`max(${jobs.updatedAt})`,
    })
    .from(jobs)
    .where(and(eq(jobs.teamId, teamId), ne(jobs.kind, "playbook"), sql`${jobs.createdAt} >= ${run.createdAt}`));
  const last = act?.last ? new Date(act.last) : run.createdAt;
  return {
    stage: STAGES[run.result?.stage ?? 0] ?? "done",
    startedAt: run.createdAt,
    pages: { total: count("pending", "decoding", "decoded", "not_playbook", "failed"), read: count("decoded", "not_playbook"), failed: count("failed") },
    topics: { total: t!.total, asked: t!.asked, written: t!.written },
    running: act?.running ?? 0,
    // nothing running and nothing has moved for a while: the workers are gone
    stalled: (act?.running ?? 0) === 0 && Date.now() - last.getTime() > 3 * 60 * 1000,
  };
}
