/**
 * Converting drawings topic by topic: cut each drawing out of its page now,
 * queue one background job per drawing, and let the team's workers (the same
 * ones a whole-playbook read uses) work through them. The coach then checks
 * each topic side by side and approves it in one tap.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { plays } from "@/db/schema";
import { jobs, topics } from "@/db/teach-schema";
import { prepareCrop } from "./convert";
import { playbookDrawings } from "./drawings";
import { WORKERS, dispatchWorkers } from "./playbook-run";

/** Crops take a moment each; queue at most this many per request and let the page ask again. */
const PER_REQUEST = 40;

/** Drawing keys already converted (not archived) or waiting in the queue. */
async function taken(teamId: string, database: Db) {
  const made = await database
    .select({ key: sql<string>`${plays.aiRaw}->>'drawingKey'` })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false), sql`${plays.aiRaw}->>'drawingKey' is not null`));
  const waiting = await database
    .select({ key: jobs.ref })
    .from(jobs)
    .where(and(eq(jobs.teamId, teamId), eq(jobs.kind, "convert_drawing"), inArray(jobs.status, ["queued", "running"])));
  return new Set([...made.map((r) => r.key), ...waiting.map((r) => r.key)]);
}

/**
 * Queue the drawings of these topics ("install" = this week's install) that
 * aren't converted or queued yet. Returns how many were queued and how many
 * are still left to queue (call again).
 */
export async function queueConversions(teamId: string, which: "install" | string[], origin: string | null, database: Db = db) {
  const ids =
    which === "install"
      ? (await database.select({ id: topics.id }).from(topics).where(and(eq(topics.teamId, teamId), eq(topics.inInstall, true), eq(topics.archived, false)))).map((t) => t.id)
      : which;
  const want = new Set(ids);
  const skip = await taken(teamId, database);
  const todo = (await playbookDrawings(teamId, database)).filter((d) => d.topicId && want.has(d.topicId) && !skip.has(d.key));
  const now = todo.slice(0, PER_REQUEST);
  let failed = 0;
  const queued: string[] = [];
  for (const d of now) {
    try {
      await prepareCrop(teamId, d.key, database);
      queued.push(d.key);
    } catch {
      failed++;
    }
  }
  if (queued.length) {
    await database.insert(jobs).values(queued.map((key) => ({ teamId, kind: "convert_drawing" as const, ref: key })));
    await dispatchWorkers(teamId, origin, Math.min(WORKERS, queued.length), database);
  }
  return { queued: queued.length, failed, left: todo.length - now.length };
}

/** Conversion jobs waiting or running, and ones that failed in the last day. */
export async function conversionProgress(teamId: string, database: Db = db) {
  const [r] = await database
    .select({
      waiting: sql<number>`count(*) filter (where ${jobs.status} in ('queued', 'running'))::int`,
      failed: sql<number>`count(*) filter (where ${jobs.status} = 'failed' and ${jobs.updatedAt} > now() - interval '1 day')::int`,
    })
    .from(jobs)
    .where(and(eq(jobs.teamId, teamId), eq(jobs.kind, "convert_drawing")));
  return { waiting: r?.waiting ?? 0, failed: r?.failed ?? 0 };
}

/** Approve every converted play in a topic (its drawings' plays), team-scoped. */
export async function approveConvertedTopic(teamId: string, topicId: string, userId: string, database: Db = db) {
  const keys = (await playbookDrawings(teamId, database)).filter((d) => d.topicId === topicId).map((d) => d.key);
  if (!keys.length) return 0;
  const rows = await database
    .update(plays)
    .set({ status: "approved", approvedAt: new Date(), approvedBy: userId })
    .where(
      and(
        eq(plays.teamId, teamId),
        eq(plays.archived, false),
        eq(plays.extraction, "done"),
        sql`${plays.status} <> 'approved'`,
        inArray(sql`${plays.aiRaw}->>'drawingKey'`, keys),
      ),
    )
    .returning({ id: plays.id });
  return rows.length;
}

/** Throw away one converted play and queue its drawing again. */
export async function retryConversion(teamId: string, playId: string, origin: string | null, database: Db = db) {
  const [row] = await database
    .update(plays)
    .set({ archived: true })
    .where(and(eq(plays.teamId, teamId), eq(plays.id, playId), sql`${plays.aiRaw}->>'drawingKey' is not null`))
    .returning({ key: sql<string>`${plays.aiRaw}->>'drawingKey'` });
  if (!row) throw new Error("That play wasn't found.");
  await database.insert(jobs).values({ teamId, kind: "convert_drawing", ref: row.key });
  await dispatchWorkers(teamId, origin, 1, database);
}
