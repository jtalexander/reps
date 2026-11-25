/**
 * Read the whole playbook's drawings behind the scenes, once the naming rules
 * are confirmed, so the play builder never waits on a read.
 *
 * One Message Batch per team (half price; most finish within the hour), read
 * by a cheaper model than on-the-spot reads (Sonnet 5.5; BATCH_DRAWING_MODEL
 * to change). Steps, each in the background:
 *  1. cropping: a background worker has the site crop the drawings a few at a
 *     time (the image library only runs in normal requests)
 *  2. submitted: one request per drawing, same prompt as an on-the-spot read
 *  3. importing: when the batch has ended (checked every 10 minutes and when
 *     the builder is open), the answers become draft plays
 * A drawing read on the spot meanwhile is kept; the batch's answer is ignored.
 */
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { plays, teams } from "@/db/schema";
import { jobs, readBatches } from "@/db/teach-schema";
import { DefDrawingSchema, DrawingSchema, drawingBatchParams, drawingContent, type DefDrawing, type Drawing } from "./ai";
import { drawingInput, playForDrawing, prepareCrop, saveDrawing } from "./convert";
import { onNetlify, signBatch } from "./dispatch";
import { playbookDrawings } from "./drawings";
import { dispatchWorkers } from "./playbook-run";
import { aiBlockedReason, recordUsage } from "./usage";

export const BATCH_MODEL = process.env.BATCH_DRAWING_MODEL ?? "claude-sonnet-5-5";
export const CROPS_PATH = "/api/teach/crops";
/** Drawings cropped per request (each loads its page image). */
const CROP_PER_CALL = 12;
/** A step that hasn't moved in this long gets started again. */
const STALLED_MS = 20 * 60 * 1000;
/** After a failed batch, wait this long before trying again. */
const RETRY_MS = 24 * 60 * 60 * 1000;
const ACTIVE = ["cropping", "submitted", "importing"] as const;

export type ReadBatch = typeof readBatches.$inferSelect;

/** The parts of the Anthropic batch API used here (a fake one in tests). */
export interface BatchApi {
  create(requests: Anthropic.Messages.BatchCreateParams.Request[]): Promise<{ id: string }>;
  ended(batchId: string): Promise<boolean>;
  results(batchId: string): AsyncIterable<Anthropic.Messages.MessageBatchIndividualResponse>;
}

let testApi: BatchApi | null = null;
/** Tests: answer batches with this instead of Anthropic. */
export function useBatchApi(api: BatchApi | null) {
  testApi = api;
}

export function anthropicBatches(): BatchApi {
  if (testApi) return testApi;
  const client = new Anthropic({ maxRetries: 3 });
  return {
    create: async (requests) => client.messages.batches.create({ requests }),
    ended: async (id) => (await client.messages.batches.retrieve(id)).processing_status === "ended",
    results: (id) => ({
      async *[Symbol.asyncIterator]() {
        for await (const r of await client.messages.batches.results(id)) yield r;
      },
    }),
  };
}

/** The team's batch that's still going (or null). */
export async function activeBatch(teamId: string, database: Db = db): Promise<ReadBatch | null> {
  const [row] = await database
    .select()
    .from(readBatches)
    .where(and(eq(readBatches.teamId, teamId), inArray(readBatches.status, [...ACTIVE])))
    .orderBy(desc(readBatches.createdAt))
    .limit(1);
  return row ?? null;
}

/** Drawings no play has been made from and no on-the-spot read has been tried on. */
async function unreadKeys(teamId: string, database: Db): Promise<string[]> {
  const reads = await database.select({ ref: jobs.ref }).from(jobs).where(and(eq(jobs.teamId, teamId), eq(jobs.kind, "convert_drawing")));
  const made = await database
    .select({ key: sql<string | null>`${plays.aiRaw}->>'drawingKey'` })
    .from(plays)
    .where(eq(plays.teamId, teamId));
  const skip = new Set([...reads.map((r) => r.ref), ...made.flatMap((m) => (m.key ? [m.key] : []))]);
  return (await playbookDrawings(teamId, database)).map((d) => d.key).filter((k) => !skip.has(k));
}

/**
 * Start reading the whole playbook if it's time: the naming rules are
 * confirmed, AI is on, and no batch was made yet (or the last one failed a
 * day ago). Returns the batch that's going, if any.
 */
export async function ensureBatchRead(teamId: string, origin: string | null, database: Db = db): Promise<ReadBatch | null> {
  const going = await activeBatch(teamId, database);
  if (going) return going;
  // on the live site only (a local dev server would spend real money on its test teams); AUTO_READ_LOCAL=1 to try it locally
  if (!onNetlify() && process.env.AUTO_READ_LOCAL !== "1") return null;
  const [team] = await database.select({ approved: teams.namingApprovedAt }).from(teams).where(eq(teams.id, teamId));
  if (!team?.approved) return null;
  const [last] = await database.select().from(readBatches).where(eq(readBatches.teamId, teamId)).orderBy(desc(readBatches.createdAt)).limit(1);
  if (last && (last.status !== "failed" || Date.now() - last.updatedAt.getTime() < RETRY_MS)) return null;
  if (await aiBlockedReason(teamId, database)) return null;
  const keys = await unreadKeys(teamId, database);
  if (!keys.length) return null;
  const [row] = await database.insert(readBatches).values({ teamId, keys, model: BATCH_MODEL, origin }).returning();
  await database.insert(jobs).values({ teamId, kind: "read_batch", ref: row!.id });
  await dispatchWorkers(teamId, origin, 1, database);
  return row!;
}

/** Crop the next few drawings of a batch (runs in a normal request). Returns how many are left. */
export async function cropSome(batchId: string, database: Db = db): Promise<number> {
  const [row] = await database.select().from(readBatches).where(eq(readBatches.id, batchId));
  if (!row || row.status !== "cropping") return 0;
  const next = row.keys.slice(row.cropped, row.cropped + CROP_PER_CALL);
  const skipped: string[] = [];
  for (const key of next) {
    try {
      await prepareCrop(row.teamId, key, database);
    } catch {
      skipped.push(key);
    }
  }
  const cropped = row.cropped + next.length;
  await database
    .update(readBatches)
    .set({ cropped, skipped: [...row.skipped, ...skipped] })
    .where(and(eq(readBatches.id, row.id), eq(readBatches.cropped, row.cropped)));
  return row.keys.length - cropped;
}

/** Ask the site to crop some (on Netlify the worker can't run the image library itself). */
async function cropRemote(row: ReadBatch): Promise<number> {
  if (!onNetlify() || !row.origin) return cropSome(row.id);
  const res = await fetch(row.origin + CROPS_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ batch: row.id, sig: signBatch(row.id) }),
  });
  if (!res.ok) throw new Error(`Cropping answered ${res.status}`);
  return ((await res.json()) as { left: number }).left;
}

/** Background step 1-2: crop every drawing, then send the batch. */
export async function runReadBatch(batchId: string, database: Db = db, api: BatchApi = anthropicBatches(), budgetMs = 12 * 60 * 1000) {
  const until = Date.now() + budgetMs;
  let [row] = await database.select().from(readBatches).where(eq(readBatches.id, batchId));
  if (!row || row.status !== "cropping") return;
  let left = row.keys.length - row.cropped;
  while (left > 0 && Date.now() < until) left = await cropRemote(row);
  [row] = await database.select().from(readBatches).where(eq(readBatches.id, batchId));
  if (!row) return;
  if (row.cropped < row.keys.length) {
    // out of time: a fresh worker picks it up
    await database.insert(jobs).values({ teamId: row.teamId, kind: "read_batch", ref: row.id });
    await dispatchWorkers(row.teamId, row.origin, 1, database);
    return;
  }
  const blocked = await aiBlockedReason(row.teamId, database);
  if (blocked) {
    await database.update(readBatches).set({ status: "failed", error: blocked }).where(eq(readBatches.id, row.id));
    return;
  }
  const skipped = new Set(row.skipped);
  const requests: Anthropic.Messages.BatchCreateParams.Request[] = [];
  for (const [i, key] of row.keys.entries()) {
    if (skipped.has(key) || (await playForDrawing(row.teamId, key, database))) continue;
    const input = await drawingInput(row.teamId, key, database, false).catch(() => null);
    if (!input) continue;
    // custom ids allow only letters, digits, - and _: the request's place in `keys`
    requests.push({ custom_id: `d${i}`, params: drawingBatchParams(drawingContent(input.png, input.width, input.height, input.label, input.notes, input.naming), row.model, undefined, input.side) });
  }
  if (!requests.length) {
    await database.update(readBatches).set({ status: "imported" }).where(eq(readBatches.id, row.id));
    return;
  }
  const batch = await api.create(requests);
  await database.update(readBatches).set({ status: "submitted", batchId: batch.id }).where(eq(readBatches.id, row.id));
}

/** Background step 3: turn the batch's answers into draft plays. */
export async function importBatch(batchId: string, database: Db = db, api: BatchApi = anthropicBatches()) {
  const [row] = await database.select().from(readBatches).where(eq(readBatches.id, batchId));
  if (!row?.batchId || row.status !== "importing") return;
  let made = 0;
  let failed = 0;
  for await (const r of api.results(row.batchId)) {
    const key = row.keys[Number(r.custom_id.slice(1))];
    if (!key) continue;
    if (r.result.type !== "succeeded") {
      failed++;
      continue;
    }
    const msg = r.result.message;
    await recordUsage(`${row.model}:batch`, msg.usage, "drawing");
    const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    const input = await drawingInput(row.teamId, key, database, false).catch(() => null);
    let answer: Drawing | DefDrawing | null = null;
    try {
      const json = text ? JSON.parse(text) : null;
      const p = input?.side === "defense" ? DefDrawingSchema.safeParse(json) : DrawingSchema.safeParse(json);
      answer = p.success ? p.data : null;
    } catch {
      answer = null;
    }
    if (!answer || !input) {
      failed++;
      continue;
    }
    const saved = await saveDrawing(row.teamId, key, input, answer, database);
    if (!saved.existed) made++;
  }
  await database.update(readBatches).set({ status: "imported", made, failed }).where(eq(readBatches.id, row.id));
}

/**
 * Check batches that are waiting (one team's, or every team's from the
 * schedule): start importing the ones that ended, and restart a step that
 * stalled. Returns how many it moved on.
 */
export async function checkBatches(teamId: string | null, database: Db = db, api: BatchApi = anthropicBatches()): Promise<number> {
  const rows = await database
    .select()
    .from(readBatches)
    .where(teamId ? and(eq(readBatches.teamId, teamId), inArray(readBatches.status, [...ACTIVE])) : inArray(readBatches.status, [...ACTIVE]));
  let moved = 0;
  for (const row of rows) {
    try {
      if (row.status === "submitted" && row.batchId && (await api.ended(row.batchId))) {
        const [won] = await database
          .update(readBatches)
          .set({ status: "importing" })
          .where(and(eq(readBatches.id, row.id), eq(readBatches.status, "submitted")))
          .returning();
        if (!won) continue;
        await queue(row, "import_batch", database);
        moved++;
      } else if ((row.status === "cropping" || row.status === "importing") && Date.now() - row.updatedAt.getTime() > STALLED_MS) {
        const kind = row.status === "cropping" ? "read_batch" : "import_batch";
        const busy = await database
          .select({ id: jobs.id })
          .from(jobs)
          .where(and(eq(jobs.ref, row.id), eq(jobs.kind, kind), inArray(jobs.status, ["queued", "running"]), sql`${jobs.updatedAt} > now() - interval '20 minutes'`));
        if (busy.length) continue;
        await database.update(readBatches).set({ updatedAt: new Date() }).where(eq(readBatches.id, row.id));
        await queue(row, kind, database);
        moved++;
      }
    } catch (err) {
      console.error("read batch check", row.id, err);
    }
  }
  return moved;
}

async function queue(row: ReadBatch, kind: "read_batch" | "import_batch", database: Db) {
  await database.insert(jobs).values({ teamId: row.teamId, kind, ref: row.id });
  await dispatchWorkers(row.teamId, row.origin, 1, database);
}
