/**
 * Teach: decode pages -> topics -> coach interview -> lessons + questions
 * -> coach approval -> players learn and practice -> mastery.
 * Every query is scoped by teamId; callers authorize first.
 */
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { players, plays, teams, uploadPages } from "@/db/schema";
import { askLog, attempts, gaps, jobs, lessonProgress, lessons, questionFlags, questionSrs, questions, teachPages, topics } from "@/db/teach-schema";
import { media } from "@/media/store";
import { convertDrawing } from "./convert";
import { installTopicIds } from "./install";
import { runNaming } from "./naming";
import { sharedAnswers } from "./shared";
import { AI_LIMIT, AI_NOT_ON, AI_OFF, AiBlocked, withAi } from "./usage";
import { pngSize } from "./png";
import { askPlaybook, decodePage, findGaps, gradeOpen, pickCore, triageGaps, writeTopic, type PageImage } from "./ai";
import { QuestionDataSchema, type Audience, type Box, type DiagramRegion, type Fact, type QuestionData, type QuestionImage } from "./types";
import type { Diagram } from "@/library/types";

export const topicKey = (name: string) => name.toUpperCase().replace(/[^A-Z0-9#&' -]+/g, " ").replace(/\s+/g, " ").trim();

async function pageImage(teamId: string, pageNo: number, uploadId: string, database: Db): Promise<{ img: PageImage; widthPt: number } | null> {
  const [p] = await database
    .select()
    .from(uploadPages)
    .where(and(eq(uploadPages.teamId, teamId), eq(uploadPages.uploadId, uploadId), eq(uploadPages.pageNo, pageNo)));
  if (!p) return null;
  const file = await media().get(p.imageKey);
  if (!file) return null;
  const im = pngSize(file.bytes);
  const text = p.text
    .map((t) => t.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return { img: { pageNo, png: file.bytes, width: im.width, height: im.height, text }, widthPt: p.width };
}

export { pngSize } from "./png";

const toPoints = (b: { x: number; y: number; w: number; h: number }, scale: number): Box => ({
  x: Math.round((b.x / scale) * 10) / 10,
  y: Math.round((b.y / scale) * 10) / 10,
  w: Math.round((b.w / scale) * 10) / 10,
  h: Math.round((b.h / scale) * 10) / 10,
});

// ---------------- jobs ----------------

async function setJob(id: string, patch: Partial<typeof jobs.$inferInsert>, database: Db) {
  await database.update(jobs).set(patch).where(eq(jobs.id, id));
}

export async function failJob(job: typeof jobs.$inferSelect, msg: string, database: Db) {
  await setJob(job.id, { status: "failed", error: msg }, database);
  if (job.kind === "decode_page") await database.update(teachPages).set({ status: "failed", error: msg }).where(eq(teachPages.id, job.ref));
}

/**
 * Run a queued job to completion. Only one runner can claim a job, so a
 * retried or duplicated background call never runs the AI twice. Errors are
 * stored on the job, never thrown.
 */
export async function runJob(jobId: string, database: Db = db) {
  const [job] = await database
    .update(jobs)
    .set({ status: "running", error: null })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "queued"), sql`${jobs.kind} <> 'playbook'`))
    .returning();
  if (!job) return (await database.select().from(jobs).where(eq(jobs.id, jobId)))[0];
  return executeJob(job, database);
}

/** Claim the oldest queued job of a team (whole-playbook runs work through these). */
export async function claimNextJob(teamId: string, database: Db = db) {
  for (let tries = 0; tries < 5; tries++) {
    const [next] = await database
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.teamId, teamId), eq(jobs.status, "queued"), sql`${jobs.kind} <> 'playbook'`))
      .orderBy(asc(jobs.createdAt), asc(jobs.id))
      .limit(1);
    if (!next) return null;
    const [job] = await database
      .update(jobs)
      .set({ status: "running", error: null })
      .where(and(eq(jobs.id, next.id), eq(jobs.status, "queued")))
      .returning();
    if (job) return job; // else another worker took it; try the next one
  }
  return null;
}

/**
 * Errors from the Anthropic account itself (no credits, key turned down).
 * Every job after one of these fails the same way, so a whole-playbook run
 * stops instead of burning through its queue. Returns what to tell the coach.
 */
export const OUT_OF_CREDITS = "Reps' Anthropic account ran out of credits. Add credits at console.anthropic.com (Plans & Billing), then pick up where it stopped.";
export const KEY_TURNED_DOWN = "Anthropic turned down Reps' API key. Check ANTHROPIC_API_KEY on Netlify, then pick up where it stopped.";

export function accountProblem(message: string | null | undefined): string | null {
  if (!message) return null;
  if (message === OUT_OF_CREDITS || message === KEY_TURNED_DOWN) return message;
  if (message.includes(AI_NOT_ON)) return AI_NOT_ON;
  if (message.includes(AI_OFF)) return AI_OFF;
  if (message.includes(AI_LIMIT)) return AI_LIMIT;
  if (/credit balance is too low/i.test(message)) return OUT_OF_CREDITS;
  if (/authentication_error|invalid x-api-key|permission_error/i.test(message)) return KEY_TURNED_DOWN;
  return null;
}

export async function executeJob(job: typeof jobs.$inferSelect, database: Db = db) {
  return withAi(job.teamId, job.kind, () => executeJobInner(job, database));
}

async function executeJobInner(job: typeof jobs.$inferSelect, database: Db) {
  const jobId = job.id;
  try {
    let result: Record<string, number> | null = null;
    if (job.kind === "decode_page") await runDecode(job.teamId, job.ref, database);
    else if (job.kind === "find_gaps") await runGaps(job.teamId, job.ref, database);
    else if (job.kind === "triage") result = await triageTeamGaps(job.teamId, database);
    else if (job.kind === "write_topic") await runWrite(job.teamId, job.ref, database);
    else if (job.kind === "pick_core") result = await pickCoreQuestions(job.teamId, job.ref, database);
    else if (job.kind === "naming") result = await runNaming(job.teamId, database);
    else if (job.kind === "convert_drawing") await convertDrawing(job.teamId, job.ref, database);
    else throw new Error(`Unknown job kind ${job.kind}`);
    await setJob(job.id, { status: "done", result }, database);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    await failJob(job, accountProblem(raw) ?? raw.slice(0, 400), database);
  }
  const [after] = await database.select().from(jobs).where(eq(jobs.id, jobId));
  return after;
}

/** Background jobs stop at 15 minutes; one that never started was lost on the way. */
const STUCK_RUNNING_MS = 16 * 60 * 1000;
const STUCK_QUEUED_MS = 3 * 60 * 1000;

/** A job's state for the page waiting on it (team-scoped). Marks stuck jobs failed. */
export async function jobStatus(teamId: string, jobId: string, database: Db = db) {
  const [job] = await database.select().from(jobs).where(and(eq(jobs.teamId, teamId), eq(jobs.id, jobId)));
  if (!job) throw new Error("That job wasn't found.");
  const age = Date.now() - job.updatedAt.getTime();
  if (job.status === "running" && age > STUCK_RUNNING_MS) {
    await failJob(job, "This took too long and stopped. Try again.", database);
    return { status: "failed" as const, error: "This took too long and stopped. Try again.", result: null };
  }
  if (job.status === "queued" && age > STUCK_QUEUED_MS) {
    await failJob(job, "This never started. Try again.", database);
    return { status: "failed" as const, error: "This never started. Try again.", result: null };
  }
  return { status: job.status, error: job.error, result: job.result };
}

export async function newJob(teamId: string, kind: (typeof jobs.$inferInsert)["kind"], ref: string, database: Db = db) {
  const [job] = await database.insert(jobs).values({ teamId, kind, ref }).returning();
  return job!;
}

// ---------------- decode ----------------

/** Create decode rows for these pages (already rendered) and return their ids. */
export async function prepareDecode(teamId: string, uploadId: string, pageNos: number[], database: Db = db) {
  const pages = await database
    .select()
    .from(uploadPages)
    .where(and(eq(uploadPages.teamId, teamId), eq(uploadPages.uploadId, uploadId), inArray(uploadPages.pageNo, pageNos)));
  const ids: string[] = [];
  for (const p of pages.sort((a, b) => a.pageNo - b.pageNo)) {
    const [row] = await database
      .insert(teachPages)
      .values({ teamId, uploadId, pageId: p.id, pageNo: p.pageNo })
      .onConflictDoUpdate({ target: [teachPages.uploadId, teachPages.pageNo], set: { status: "pending", error: null } })
      .returning({ id: teachPages.id });
    ids.push(row!.id);
  }
  return ids;
}

async function runDecode(teamId: string, teachPageId: string, database: Db) {
  const [tp] = await database.select().from(teachPages).where(and(eq(teachPages.teamId, teamId), eq(teachPages.id, teachPageId)));
  if (!tp) throw new Error("Page not found.");
  await database.update(teachPages).set({ status: "decoding", error: null }).where(eq(teachPages.id, tp.id));
  const page = await pageImage(teamId, tp.pageNo, tp.uploadId, database);
  if (!page) throw new Error("Page image missing.");
  const known = (await database.select({ name: topics.name }).from(topics).where(and(eq(topics.teamId, teamId), eq(topics.archived, false)))).map((t) => t.name);
  const out = await decodePage(page.img, known);
  if (!out.is_playbook_content || out.facts.length === 0) {
    await database.update(teachPages).set({ status: "not_playbook", summary: out.summary, aiRaw: out }).where(eq(teachPages.id, tp.id));
    return;
  }
  const scale = page.img.width / page.widthPt;
  const facts: Fact[] = out.facts.map((f) => ({
    id: randomUUID().slice(0, 8),
    text: f.text,
    appliesTo: f.applies_to.map((a) => a.trim().toUpperCase()).filter(Boolean),
    kind: f.kind,
    source: "page",
    pageNo: tp.pageNo,
  }));
  const diagrams: DiagramRegion[] = out.diagrams.map((d) => ({ id: randomUUID().slice(0, 8), label: d.label, box: toPoints(d, scale) }));
  const topicName = out.topic.trim();
  const key = topicKey(topicName);
  const [existing] = await database.select().from(topics).where(and(eq(topics.teamId, teamId), eq(topics.nameKey, key)));
  if (existing) {
    const pageNos = [...new Set([...existing.pageNos, tp.pageNo])].sort((a, b) => a - b);
    await database.update(topics).set({ pageNos, archived: false }).where(eq(topics.id, existing.id));
  } else {
    await database
      .insert(topics)
      .values({ teamId, name: topicName, nameKey: key, summary: out.summary, pageNos: [tp.pageNo], sort: tp.pageNo })
      .onConflictDoNothing();
  }
  await database
    .update(teachPages)
    .set({ status: "decoded", section: out.section, topicName, summary: out.summary, facts, diagrams, aiRaw: out })
    .where(eq(teachPages.id, tp.id));
}

// ---------------- topic material ----------------

export async function topicMaterial(teamId: string, topicId: string, database: Db = db) {
  const [topic] = await database.select().from(topics).where(and(eq(topics.teamId, teamId), eq(topics.id, topicId)));
  if (!topic) throw new Error("Topic not found.");
  const pages = await database
    .select()
    .from(teachPages)
    .where(and(eq(teachPages.teamId, teamId), inArray(teachPages.pageNo, topic.pageNos.length ? topic.pageNos : [-1]), eq(teachPages.status, "decoded")))
    .orderBy(asc(teachPages.pageNo));
  const gapRows = await database.select().from(gaps).where(and(eq(gaps.teamId, teamId), eq(gaps.topicId, topicId))).orderBy(asc(gaps.sort));
  const facts = pages.flatMap((p) => p.facts);
  const factText = facts.map((f) => `- [p${f.pageNo}] (${f.appliesTo.join(", ") || "ALL"}; ${f.kind}) ${f.text}`).join("\n");
  const answered = gapRows
    .filter((g) => (g.status === "answered" || g.status === "approved") && g.answer)
    .map((g) => `- Q: ${g.question}\n  Coach: ${g.answer}`)
    .join("\n");
  const diagramText = pages.flatMap((p) => p.diagrams.map((d) => `- p${p.pageNo}: ${d.label}`)).join("\n");
  return { topic, pages, facts, factText, answered, diagramText, gaps: gapRows };
}

async function topicImages(teamId: string, pages: Array<{ pageNo: number; uploadId: string }>, database: Db, max = 4) {
  const out: Array<{ img: PageImage; widthPt: number }> = [];
  for (const p of pages.slice(0, max)) {
    const im = await pageImage(teamId, p.pageNo, p.uploadId, database);
    if (im) out.push(im);
  }
  return out;
}

// ---------------- gaps (coach interview) ----------------

/** How many questions per topic the coach is asked by default. */
export const KEY_PER_TOPIC = 3;

async function runGaps(teamId: string, topicId: string, database: Db) {
  const m = await topicMaterial(teamId, topicId, database);
  const imgs = await topicImages(teamId, m.pages, database);
  // What every other topic covers, from its pages' summaries, so gaps are real gaps.
  const others = await database
    .select({ name: topics.name, summary: topics.summary })
    .from(topics)
    .where(and(eq(topics.teamId, teamId), eq(topics.archived, false), sql`${topics.id} <> ${topicId}`));
  const pageSums = await database
    .select({ topicName: teachPages.topicName, summary: teachPages.summary })
    .from(teachPages)
    .where(and(eq(teachPages.teamId, teamId), eq(teachPages.status, "decoded")));
  const otherText = others
    .map((o) => {
      const sums = pageSums.filter((p) => p.topicName === o.name && p.summary).map((p) => p.summary);
      return `- ${o.name}: ${(sums.length ? sums : [o.summary ?? ""]).join(" ").slice(0, 400)}`;
    })
    .join("\n");
  const shared = await sharedAnswers(teamId, m.topic.name, 20, database);
  const out = await findGaps(m.topic.name, m.factText, imgs.map((i) => i.img), m.answered, otherText, shared);
  // Replace open questions from an earlier pass; keep anything the coach handled.
  await database.delete(gaps).where(and(eq(gaps.teamId, teamId), eq(gaps.topicId, topicId), eq(gaps.status, "open")));
  if (out.gaps.length)
    await database.insert(gaps).values(
      out.gaps.map((g, i) => ({
        teamId,
        topicId,
        pageNo: g.page_no,
        question: g.question,
        why: g.why,
        appliesTo: g.applies_to.map((a) => a.toUpperCase()),
        suggestion: g.suggestion,
        sort: i,
        // the model lists the most important first; ask the top few, keep the rest optional
        priority: i < KEY_PER_TOPIC ? ("key" as const) : ("optional" as const),
      })),
    );
  await database.update(topics).set({ gapsFoundAt: new Date() }).where(eq(topics.id, topicId));
}

export async function answerGap(
  teamId: string,
  gapId: string,
  action: { kind: "answer"; text: string } | { kind: "approve" } | { kind: "skip" } | { kind: "reopen" },
  userId: string,
  database: Db = db,
) {
  const [g] = await database.select().from(gaps).where(and(eq(gaps.teamId, teamId), eq(gaps.id, gapId)));
  if (!g) throw new Error("Question not found.");
  const now = new Date();
  if (action.kind === "answer") {
    const text = action.text.trim();
    if (!text) throw new Error("Type an answer, or skip it.");
    await database.update(gaps).set({ status: "answered", answer: text, answeredBy: userId, answeredAt: now }).where(eq(gaps.id, g.id));
  } else if (action.kind === "approve") {
    if (!g.suggestion) throw new Error("There's no suggestion to approve.");
    await database.update(gaps).set({ status: "approved", answer: g.suggestion, answeredBy: userId, answeredAt: now }).where(eq(gaps.id, g.id));
  } else if (action.kind === "skip") {
    await database.update(gaps).set({ status: "skipped", answeredBy: userId, answeredAt: now }).where(eq(gaps.id, g.id));
  } else {
    await database.update(gaps).set({ status: "open", answer: null, answeredAt: null }).where(eq(gaps.id, g.id));
  }
  await syncDuplicates(teamId, g.id, database);
}

/** The same question under other topics takes this one's answer. */
async function syncDuplicates(teamId: string, gapId: string, database: Db) {
  const [g] = await database.select().from(gaps).where(and(eq(gaps.teamId, teamId), eq(gaps.id, gapId)));
  if (!g) return;
  await database
    .update(gaps)
    .set({ status: g.status, answer: g.answer, answeredBy: g.answeredBy, answeredAt: g.answeredAt })
    .where(and(eq(gaps.teamId, teamId), eq(gaps.dupOf, g.id)));
}

/** Approve every suggested answer still open on a topic's main questions. */
export async function acceptSuggestions(teamId: string, topicId: string, userId: string, database: Db = db) {
  const open = await database
    .select()
    .from(gaps)
    .where(and(eq(gaps.teamId, teamId), eq(gaps.topicId, topicId), eq(gaps.status, "open"), eq(gaps.priority, "key"), isNull(gaps.dupOf), isNotNull(gaps.suggestion)));
  for (const g of open) await answerGap(teamId, g.id, { kind: "approve" }, userId, database);
  return open.length;
}

/**
 * Approve what the coach just skimmed on a topic: "core" = its draft lessons
 * and core questions; "reserve" = its reserve questions only.
 */
export async function approveTopic(teamId: string, topicId: string, userId: string, except: string[] = [], database: Db = db, pile: "core" | "reserve" = "core") {
  const set = { status: "approved" as const, approvedBy: userId, approvedAt: new Date() };
  const skip = except.length ? except : ["00000000-0000-0000-0000-000000000000"];
  const ls =
    pile === "core"
      ? await database
          .update(lessons)
          .set(set)
          .where(and(eq(lessons.teamId, teamId), eq(lessons.topicId, topicId), eq(lessons.status, "draft"), notInArray(lessons.id, skip)))
          .returning({ id: lessons.id })
      : [];
  const qs = await database
    .update(questions)
    .set(set)
    .where(and(eq(questions.teamId, teamId), eq(questions.topicId, topicId), eq(questions.status, "draft"), inPile(pile), notInArray(questions.id, skip)))
    .returning({ id: questions.id });
  return { lessons: ls.length, questions: qs.length };
}

/**
 * One pass over every open question for the coach: keep the few per topic
 * that players most need, and point repeats at a single question so the
 * coach answers it once.
 */
export async function triageTeamGaps(teamId: string, database: Db = db) {
  const rows = await database
    .select({ gap: gaps, topic: topics.name })
    .from(gaps)
    .innerJoin(topics, eq(topics.id, gaps.topicId))
    .where(and(eq(gaps.teamId, teamId), eq(gaps.status, "open"), eq(topics.archived, false)))
    .orderBy(asc(topics.sort), asc(gaps.sort));
  if (rows.length === 0) return { key: 0, optional: 0, repeats: 0 };
  // Questions already handled count too: a repeat of one takes its answer.
  const done = await database
    .select({ gap: gaps, topic: topics.name })
    .from(gaps)
    .innerJoin(topics, eq(topics.id, gaps.topicId))
    .where(and(eq(gaps.teamId, teamId), inArray(gaps.status, ["answered", "approved", "skipped"]), isNull(gaps.dupOf)));
  const all = [...rows, ...done];
  const list = all
    .map((r, n) => `${n + 1}. [${r.topic}]${r.gap.status === "open" ? "" : " (already answered)"} ${r.gap.question}${r.gap.why ? ` (why: ${r.gap.why})` : ""}`)
    .join("\n");
  const out = await triageGaps(list, KEY_PER_TOPIC);
  const at = (n: number) => all[n - 1];
  const key = new Set(out.key.map(at).flatMap((x) => (x && x.gap.status === "open" ? [x.gap.id] : [])));
  const dupOf = new Map<string, string>();
  for (const grp of out.same) {
    const members = [grp.keep, ...grp.also].map(at).filter((x): x is (typeof all)[number] => !!x);
    const topicsSeen = new Set(members.map((m) => m.gap.topicId));
    if (members.length < 2 || topicsSeen.size < 2) continue; // only repeats across topics
    // prefer one already answered, then a key one, then the one the model picked
    const head = members.find((m) => m.gap.status !== "open") ?? members.find((m) => key.has(m.gap.id)) ?? members[0]!;
    for (const m of members) if (m.gap.id !== head.gap.id && m.gap.status === "open" && !dupOf.has(head.gap.id)) dupOf.set(m.gap.id, head.gap.id);
    if (head.gap.status === "open") key.add(head.gap.id);
  }
  for (const r of rows) {
    await database
      .update(gaps)
      .set({ priority: key.has(r.gap.id) ? "key" : "optional", dupOf: dupOf.get(r.gap.id) ?? null })
      .where(eq(gaps.id, r.gap.id));
  }
  for (const head of new Set(dupOf.values())) await syncDuplicates(teamId, head, database);
  const keyAsked = rows.filter((r) => key.has(r.gap.id) && !dupOf.has(r.gap.id)).length;
  return { key: keyAsked, optional: rows.length - keyAsked - dupOf.size, repeats: dupOf.size };
}

// ---------------- player flags ----------------

export async function flagQuestion(teamId: string, playerId: string, questionId: string, note: string, database: Db = db) {
  const [q] = await database.select({ id: questions.id }).from(questions).where(and(eq(questions.teamId, teamId), eq(questions.id, questionId)));
  if (!q) throw new Error("Question not found.");
  await database.insert(questionFlags).values({ teamId, playerId, questionId, note: note.trim().slice(0, 1000) || null });
}

export async function openFlags(teamId: string, database: Db = db) {
  return database
    .select({ flag: questionFlags, question: questions, topic: topics.name, player: players.name })
    .from(questionFlags)
    .innerJoin(questions, eq(questions.id, questionFlags.questionId))
    .innerJoin(topics, eq(topics.id, questions.topicId))
    .innerJoin(players, eq(players.id, questionFlags.playerId))
    .where(and(eq(questionFlags.teamId, teamId), eq(questionFlags.status, "open")))
    .orderBy(desc(questionFlags.createdAt));
}

/** Close every open flag on a question (fixed, taken off, or it was fine). */
export async function resolveFlags(teamId: string, questionId: string, userId: string, database: Db = db) {
  await database
    .update(questionFlags)
    .set({ status: "resolved", resolvedBy: userId, resolvedAt: new Date() })
    .where(and(eq(questionFlags.teamId, teamId), eq(questionFlags.questionId, questionId), eq(questionFlags.status, "open")));
}


// ---------------- write lessons and questions ----------------

const shuffleOnce = <T,>(xs: T[]) => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

async function runWrite(teamId: string, topicId: string, database: Db) {
  const m = await topicMaterial(teamId, topicId, database);
  const imgs = await topicImages(teamId, m.pages, database);
  // Approved items stay; tell the writer about them so a rewrite only adds what's new.
  const liveL = await database.select().from(lessons).where(and(eq(lessons.teamId, teamId), eq(lessons.topicId, topicId), eq(lessons.status, "approved")));
  const liveQ = await database.select().from(questions).where(and(eq(questions.teamId, teamId), eq(questions.topicId, topicId), eq(questions.status, "approved")));
  const approved = [
    ...liveL.map((l) => `- Lesson (${l.audience}): ${l.title}: ${l.body.replace(/\s+/g, " ").slice(0, 600)}`),
    ...liveQ.map((q) => `- Question (${q.audience.join(", ")}): ${q.prompt}`),
  ].join("\n");
  const out = await writeTopic(m.topic.name, m.factText, m.answered, m.diagramText, imgs.map((i) => i.img), approved);
  const scaleOf = new Map(imgs.map((i) => [i.img.pageNo, i.img.width / i.widthPt]));
  const diagramOf = (pageNo: number | null, label: string | null): Box | null => {
    if (!pageNo || !label) return null;
    const page = m.pages.find((p) => p.pageNo === pageNo);
    const d = page?.diagrams.find((x) => x.label.toUpperCase() === label.toUpperCase()) ?? page?.diagrams.find((x) => x.label.toUpperCase().includes(label.toUpperCase()));
    return d?.box ?? null;
  };

  // Drafts from an earlier pass are replaced; approved items stay.
  await database.delete(lessons).where(and(eq(lessons.teamId, teamId), eq(lessons.topicId, topicId), eq(lessons.status, "draft")));
  await database.delete(questions).where(and(eq(questions.teamId, teamId), eq(questions.topicId, topicId), eq(questions.status, "draft")));

  if (out.lessons.length)
    await database.insert(lessons).values(
      out.lessons.map((l, i) => ({ teamId, topicId, audience: l.audience, title: l.title, body: l.body, sourcePages: l.source_pages, sort: i })),
    );

  const rows: Array<typeof questions.$inferInsert> = [];
  for (const [i, q] of out.questions.entries()) {
    let data: QuestionData | null = null;
    let image: QuestionImage | null = null;
    if (q.format === "choice" && q.choices.length >= 2) {
      const choices = q.choices.map((text, j) => ({ id: `c${j}`, text }));
      data = { kind: "choice", choices: shuffleOnce(choices), answer: "c0" };
    } else if (q.format === "order" && q.order_items.length >= 2) {
      data = { kind: "order", items: q.order_items };
    } else if (q.format === "open" && q.model_answer && q.key_points.length) {
      data = { kind: "open", modelAnswer: q.model_answer, keyPoints: q.key_points };
    } else if (q.format === "tap" && q.tap) {
      const scale = scaleOf.get(q.tap.page_no);
      if (scale) {
        data = { kind: "tap", target: toPoints(q.tap, scale), targetLabel: q.tap.target_label };
        image = { pageNo: q.tap.page_no, box: diagramOf(q.tap.page_no, q.tap.diagram_label) };
      }
    }
    if (!data) continue;
    if (!image && q.show_page) image = { pageNo: q.show_page, box: diagramOf(q.show_page, q.show_diagram_label) };
    rows.push({
      teamId,
      topicId,
      audience: q.audience.length ? q.audience : ["ALL"],
      format: data.kind,
      prompt: q.prompt,
      data,
      explanation: q.explanation,
      image,
      sourcePages: q.source_pages,
      sort: i,
    });
  }
  if (rows.length) await database.insert(questions).values(rows);
  await database.update(topics).set({ generatedAt: new Date() }).where(eq(topics.id, topicId));
  // Unsorted drafts show as core, and a whole-playbook run sorts them later, so a failure here is not fatal.
  await pickCoreQuestions(teamId, topicId, database).catch((err) => console.error("pick core", topicId, err));
}

// ---------------- core set ----------------

/** How many must-know questions per topic the coach reviews first; the rest wait in reserve. */
export const CORE_PER_TOPIC = 5;

const answerText = (d: QuestionData) =>
  d.kind === "choice" ? (d.choices.find((c) => c.id === d.answer)?.text ?? "") : d.kind === "tap" ? `tap ${d.targetLabel}` : d.kind === "order" ? d.items.join(" > ") : d.modelAnswer;

/**
 * Sort a topic's draft questions into core and reserve. Questions already
 * approved count toward the core, so after a rewrite only the gap is filled.
 */
export async function pickCoreQuestions(teamId: string, topicId: string, database: Db = db) {
  const [topic] = await database.select().from(topics).where(and(eq(topics.teamId, teamId), eq(topics.id, topicId)));
  if (!topic) throw new Error("Topic not found.");
  const all = await database.select().from(questions).where(and(eq(questions.teamId, teamId), eq(questions.topicId, topicId))).orderBy(asc(questions.sort));
  const drafts = all.filter((q) => q.status === "draft");
  const live = all.filter((q) => q.status === "approved" && q.tier !== "reserve");
  const room = Math.max(0, CORE_PER_TOPIC - live.length);
  const core = new Set<string>();
  if (drafts.length <= room) for (const q of drafts) core.add(q.id);
  else if (room > 0) {
    const line = (q: (typeof all)[number], n: number) => `${n}. [${q.audience.join(", ")}] (${q.format}) ${q.prompt} -> ${answerText(q.data).slice(0, 160)}`;
    const out = await pickCore(
      topic.name,
      drafts.map((q, i) => line(q, i + 1)).join("\n"),
      room,
      live.map((q) => `- ${q.prompt}`).join("\n"),
    );
    for (const n of out.core) {
      const q = drafts[n - 1];
      if (q && core.size < room) core.add(q.id);
    }
  }
  const coreIds = [...core];
  const reserveIds = drafts.filter((q) => !core.has(q.id)).map((q) => q.id);
  if (coreIds.length) await database.update(questions).set({ tier: "core" }).where(inArray(questions.id, coreIds));
  if (reserveIds.length) await database.update(questions).set({ tier: "reserve" }).where(inArray(questions.id, reserveIds));
  return { core: coreIds.length, reserve: reserveIds.length };
}

/** Put a topic in or out of the current install. */
export async function setInstall(teamId: string, topicId: string, on: boolean, database: Db = db) {
  await database.update(topics).set({ inInstall: on }).where(and(eq(topics.teamId, teamId), eq(topics.id, topicId)));
}

/**
 * With "only the install" on (and an install picked), the topics Teach asks
 * about, writes and reviews; null = every topic.
 */
export async function focusTopicIds(teamId: string, database: Db = db): Promise<Set<string> | null> {
  const [team] = await database.select({ on: teams.installOnly }).from(teams).where(eq(teams.id, teamId));
  if (!team?.on) return null;
  const ids = await database
    .select({ id: topics.id })
    .from(topics)
    .where(and(eq(topics.teamId, teamId), eq(topics.inInstall, true), eq(topics.archived, false)));
  return ids.length ? new Set(ids.map((t) => t.id)) : null;
}

export async function setInstallOnly(teamId: string, on: boolean, database: Db = db) {
  await database.update(teams).set({ installOnly: on }).where(eq(teams.id, teamId));
}

export async function clearInstall(teamId: string, database: Db = db) {
  await database.update(topics).set({ inInstall: false }).where(and(eq(topics.teamId, teamId), eq(topics.inInstall, true)));
  // and the plays picked one by one, and last week's name
  await database.update(plays).set({ inInstall: false }).where(and(eq(plays.teamId, teamId), eq(plays.inInstall, true)));
  await database.update(teams).set({ installName: null }).where(eq(teams.id, teamId));
}

// ---------------- coach review ----------------

/** Unsorted questions (tier null) count as core so nothing is hidden from the coach. */
export const inPile = (pile: "core" | "reserve") => (pile === "reserve" ? eq(questions.tier, "reserve") : sql`${questions.tier} is distinct from 'reserve'`);

export async function reviewLesson(teamId: string, id: string, patch: { status?: "approved" | "rejected" | "draft"; title?: string; body?: string; audience?: string }, userId: string, database: Db = db) {
  const set: Partial<typeof lessons.$inferInsert> = {};
  if (patch.title !== undefined) set.title = patch.title.trim().slice(0, 200);
  if (patch.body !== undefined) set.body = patch.body.trim();
  if (patch.audience !== undefined) set.audience = patch.audience;
  if (patch.status) {
    set.status = patch.status;
    set.approvedBy = patch.status === "approved" ? userId : null;
    set.approvedAt = patch.status === "approved" ? new Date() : null;
  }
  await database.update(lessons).set(set).where(and(eq(lessons.teamId, teamId), eq(lessons.id, id)));
}

export async function reviewQuestion(
  teamId: string,
  id: string,
  patch: { status?: "approved" | "rejected" | "draft"; prompt?: string; explanation?: string; data?: unknown; audience?: string[]; tier?: "core" | "reserve" },
  userId: string,
  database: Db = db,
) {
  const set: Partial<typeof questions.$inferInsert> = {};
  if (patch.tier === "core" || patch.tier === "reserve") set.tier = patch.tier;
  if (patch.prompt !== undefined) set.prompt = patch.prompt.trim();
  if (patch.explanation !== undefined) set.explanation = patch.explanation.trim();
  if (patch.data !== undefined) {
    const data = QuestionDataSchema.parse(patch.data);
    set.data = data;
    set.format = data.kind;
  }
  if (patch.audience !== undefined) set.audience = patch.audience.length ? patch.audience : ["ALL"];
  if (patch.status) {
    set.status = patch.status;
    set.approvedBy = patch.status === "approved" ? userId : null;
    set.approvedAt = patch.status === "approved" ? new Date() : null;
  }
  await database.update(questions).set(set).where(and(eq(questions.teamId, teamId), eq(questions.id, id)));
}

/** The team's playbook topics and where each stands (Football basics topics need no coach work and live on the Basics page). */
export async function topicOverview(teamId: string, database: Db = db) {
  const ts = await database
    .select()
    .from(topics)
    .where(and(eq(topics.teamId, teamId), eq(topics.archived, false), isNull(topics.libraryKey)))
    .orderBy(asc(topics.sort));
  const count = async (table: typeof lessons | typeof questions) =>
    database
      .select({ topicId: table.topicId, status: table.status, n: sql<number>`count(*)::int` })
      .from(table)
      .where(eq(table.teamId, teamId))
      .groupBy(table.topicId, table.status);
  const ls = await count(lessons);
  // reserve drafts are counted apart: they aren't waiting on the coach
  const qs = await database
    .select({
      topicId: questions.topicId,
      status: sql<string>`case when ${questions.status} = 'draft' and ${questions.tier} = 'reserve' then 'reserve' else ${questions.status} end`,
      n: sql<number>`count(*)::int`,
    })
    .from(questions)
    .where(eq(questions.teamId, teamId))
    .groupBy(sql`1`, sql`2`);
  const unsorted = await database
    .select({ topicId: questions.topicId, n: sql<number>`count(*)::int` })
    .from(questions)
    .where(and(eq(questions.teamId, teamId), eq(questions.status, "draft"), isNull(questions.tier)))
    .groupBy(questions.topicId);
  // An open question is "asked" when it's a main one and not a repeat of another topic's.
  const gs = await database
    .select({
      topicId: gaps.topicId,
      status: sql<string>`case when ${gaps.status} = 'open' and (${gaps.priority} = 'optional' or ${gaps.dupOf} is not null) then 'optional' else ${gaps.status} end`,
      n: sql<number>`count(*)::int`,
    })
    .from(gaps)
    .where(eq(gaps.teamId, teamId))
    .groupBy(sql`1`, sql`2`);
  const n = (rows: Array<{ topicId: string; status: string; n: number }>, topicId: string, status: string) =>
    rows.filter((r) => r.topicId === topicId && r.status === status).reduce((a, r) => a + r.n, 0);
  return ts.map((t) => ({
    ...t,
    gapsOpen: n(gs, t.id, "open"),
    gapsOptional: n(gs, t.id, "optional"),
    gapsDone: n(gs, t.id, "answered") + n(gs, t.id, "approved") + n(gs, t.id, "skipped"),
    lessonsDraft: n(ls, t.id, "draft"),
    lessonsApproved: n(ls, t.id, "approved"),
    questionsDraft: n(qs, t.id, "draft"),
    questionsReserve: n(qs, t.id, "reserve"),
    questionsApproved: n(qs, t.id, "approved"),
    /** drafts written before the core set existed (a whole-playbook run sorts them) */
    questionsUnsorted: unsorted.find((u) => u.topicId === t.id)?.n ?? 0,
  }));
}

// ---------------- players ----------------

export async function approvedFor(teamId: string, group: Audience, database: Db = db) {
  const ls = (await database.select().from(lessons).where(and(eq(lessons.teamId, teamId), eq(lessons.status, "approved"))).orderBy(asc(lessons.sort))).filter(
    (l) => l.audience === "ALL" || l.audience === group,
  );
  const qs = (await database.select().from(questions).where(and(eq(questions.teamId, teamId), eq(questions.status, "approved"))).orderBy(asc(questions.sort))).filter(
    (q) => q.audience.includes("ALL") || q.audience.includes(group),
  );
  return { lessons: ls, questions: qs };
}

/** A question as the player sees it before answering: no answer key. */
export type PublicQuestion = {
  id: string;
  topicId: string;
  format: "choice" | "tap" | "order" | "open";
  prompt: string;
  choices?: Array<{ id: string; text: string }>;
  items?: string[];
  image: QuestionImage | null;
  /** Football basics field drawing */
  diagram: Diagram | null;
};

export function publicQuestion(q: typeof questions.$inferSelect): PublicQuestion {
  const base = { id: q.id, topicId: q.topicId, format: q.format, prompt: q.prompt, image: q.image ?? null, diagram: q.diagram ?? null };
  const d = q.data;
  if (d.kind === "choice") return { ...base, choices: d.choices };
  if (d.kind === "order") return { ...base, items: shuffleOnce(d.items) };
  return base;
}

const DAY = 86_400_000;
const BOX_DAYS = [0, 1, 2, 4, 8, 16];

/** Share of key points the answer mentions (half of a point's longer words present). Used when AI grading is off. */
export function keyPointScore(answer: string, keyPoints: string[]): number {
  if (!keyPoints.length) return 0;
  const said = new Set(answer.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const hit = keyPoints.filter((kp) => {
    const words = (kp.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 4);
    if (!words.length) return false;
    return words.filter((w) => said.has(w)).length >= Math.ceil(words.length / 2);
  }).length;
  return hit / keyPoints.length;
}

export async function gradeAttempt(
  args: { teamId: string; playerId: string; questionId: string; given: unknown; responseMs: number; mode: "learn" | "practice" },
  database: Db = db,
) {
  const [q] = await database.select().from(questions).where(and(eq(questions.teamId, args.teamId), eq(questions.id, args.questionId), eq(questions.status, "approved")));
  if (!q) throw new Error("Question not found.");
  const d = q.data;
  let score = 0;
  let feedback: string | null = null;
  let gradedBy: "auto" | "ai" = "auto";
  let reveal: Record<string, unknown> = {};
  if (d.kind === "choice") {
    score = args.given === d.answer ? 1 : 0;
    reveal = { answer: d.answer };
  } else if (d.kind === "order") {
    const given = Array.isArray(args.given) ? (args.given as string[]) : [];
    score = given.length === d.items.length && given.every((x, i) => x === d.items[i]) ? 1 : 0;
    reveal = { order: d.items };
  } else if (d.kind === "tap") {
    const p = args.given as { x?: number; y?: number } | null;
    const pad = Math.max(d.target.w, d.target.h) * 0.25;
    const hit = !!p && typeof p.x === "number" && typeof p.y === "number" && p.x >= d.target.x - pad && p.x <= d.target.x + d.target.w + pad && p.y >= d.target.y - pad && p.y <= d.target.y + d.target.h + pad;
    score = hit ? 1 : 0;
    reveal = { target: d.target, targetLabel: d.targetLabel };
  } else {
    const text = typeof args.given === "string" ? args.given.slice(0, 2000) : "";
    try {
      const g = await withAi(args.teamId, "grade", () => gradeOpen(q.prompt, d.modelAnswer, d.keyPoints, text));
      score = Math.max(0, Math.min(1, g.score));
      feedback = g.feedback;
      gradedBy = "ai";
    } catch (err) {
      if (!(err instanceof AiBlocked)) throw err;
      // AI is off or capped: a plain word check against the key points keeps the quiz going
      score = keyPointScore(text, d.keyPoints);
      feedback = "Check your answer against your coach's answer below.";
      gradedBy = "auto";
    }
    reveal = { modelAnswer: d.modelAnswer, keyPoints: d.keyPoints };
  }
  const correct = score >= 0.7;
  await database.insert(attempts).values({
    teamId: args.teamId,
    playerId: args.playerId,
    questionId: q.id,
    mode: args.mode,
    given: (args.given ?? null) as object,
    correct,
    score,
    feedback,
    responseMs: Math.max(0, Math.min(args.responseMs, 600_000)),
    gradedBy,
  });
  const [prev] = await database.select().from(questionSrs).where(and(eq(questionSrs.playerId, args.playerId), eq(questionSrs.questionId, q.id)));
  const box = correct ? Math.min((prev?.box ?? 0) + 1, BOX_DAYS.length - 1) : 0;
  const dueAt = new Date(Date.now() + (correct ? BOX_DAYS[box]! * DAY : 10 * 60_000));
  await database
    .insert(questionSrs)
    .values({ teamId: args.teamId, playerId: args.playerId, questionId: q.id, box, dueAt, seen: 1, correct: correct ? 1 : 0 })
    .onConflictDoUpdate({
      target: [questionSrs.playerId, questionSrs.questionId],
      set: { box, dueAt, seen: sql`${questionSrs.seen} + 1`, correct: sql`${questionSrs.correct} + ${correct ? 1 : 0}` },
    });
  return { correct, score, feedback, explanation: q.explanation, ...reveal };
}

/** Practice set: due and missed questions first, then new ones. */
export async function practiceSet(teamId: string, playerId: string, group: Audience, count = 10, only?: string | string[], database: Db = db) {
  const { questions: qs } = await approvedFor(teamId, group, database);
  const pick = only === undefined ? null : new Set(Array.isArray(only) ? only : [only]);
  const pool = pick ? qs.filter((q) => pick.has(q.topicId)) : qs;
  const srs = await database.select().from(questionSrs).where(eq(questionSrs.playerId, playerId));
  const by = new Map(srs.map((s) => [s.questionId, s]));
  // new questions from the current install come before other new ones
  const install = await installTopicIds(teamId, database);
  const now = Date.now();
  // three piles: missed or due for review, never seen (install first), seen and not due yet
  const due: Array<{ q: (typeof pool)[number]; score: number }> = [];
  const fresh: typeof due = [];
  const later: typeof due = [];
  for (const q of pool) {
    const s = by.get(q.id);
    if (!s) fresh.push({ q, score: (install.has(q.topicId) ? 0 : 1) + Math.random() });
    else if (s.dueAt.getTime() <= now) due.push({ q, score: -(now - s.dueAt.getTime()) / DAY - (5 - s.box) });
    else later.push({ q, score: s.dueAt.getTime() + Math.random() * DAY });
  }
  for (const pile of [due, fresh, later]) pile.sort((a, b) => a.score - b.score);
  // At most half a session is review while there's new material, so a player
  // who misses a few doesn't get the same quiz back the next time.
  const picked: typeof due = [];
  const reviewCap = fresh.length ? Math.ceil(count / 2) : count;
  picked.push(...due.slice(0, reviewCap));
  picked.push(...fresh.slice(0, count - picked.length));
  if (picked.length < count) picked.push(...due.slice(reviewCap, reviewCap + count - picked.length));
  if (picked.length < count) picked.push(...later.slice(0, count - picked.length));
  // mixed order, so a session doesn't open with the same questions
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picked[i], picked[j]] = [picked[j]!, picked[i]!];
  }
  return picked.map((s) => publicQuestion(s.q));
}

export async function completeLesson(teamId: string, playerId: string, lessonId: string, database: Db = db) {
  await database.insert(lessonProgress).values({ teamId, playerId, lessonId }).onConflictDoNothing();
}

export async function ask(teamId: string, playerId: string, group: Audience, position: string, question: string, database: Db = db) {
  const { lessons: ls, questions: qs } = await approvedFor(teamId, group, database);
  const answeredGaps = await database
    .select({ question: gaps.question, answer: gaps.answer, appliesTo: gaps.appliesTo })
    .from(gaps)
    .where(and(eq(gaps.teamId, teamId), inArray(gaps.status, ["answered", "approved"])));
  const material = [
    ...ls.map((l) => `LESSON (${l.audience}) "${l.title}" [pages ${l.sourcePages.join(", ")}]\n${l.body}`),
    ...qs.map((q) => `QUIZ ITEM [pages ${q.sourcePages.join(", ")}]: ${q.prompt} — ${q.explanation}`),
    ...answeredGaps.map((g) => `COACH ANSWER: ${g.question} — ${g.answer}`),
  ].join("\n\n");
  let out: { answered: boolean; answer: string; source_pages: number[] } = { answered: false, answer: "Your coach hasn't approved anything to learn yet.", source_pages: [] };
  if (material) {
    try {
      out = await withAi(teamId, "ask", () => askPlaybook(question.slice(0, 500), position, material));
    } catch (err) {
      if (!(err instanceof AiBlocked)) throw err;
      out = { answered: false, answer: "Reps can't answer questions right now. Ask your coach.", source_pages: [] };
    }
  }
  await database.insert(askLog).values({ teamId, playerId, question: question.slice(0, 500), answer: out.answer, sourcePages: out.source_pages, answered: out.answered });
  return out;
}

// ---------------- coach results ----------------

/** Mastery: for each player and topic, the average of the latest score on each question. */
export async function mastery(teamId: string, database: Db = db) {
  const rows = await database.execute(sql`
    with latest as (
      select distinct on (a.player_id, a.question_id) a.player_id, a.question_id, a.score, a.created_at
      from ${attempts} a where a.team_id = ${teamId}
      order by a.player_id, a.question_id, a.created_at desc
    )
    select l.player_id as "playerId", q.topic_id as "topicId", avg(l.score)::float as "score", count(*)::int as "answered"
    from latest l join ${questions} q on q.id = l.question_id
    group by l.player_id, q.topic_id`);
  return rows.rows as Array<{ playerId: string; topicId: string; score: number; answered: number }>;
}

export async function weakSpots(teamId: string, database: Db = db) {
  return database
    .select({
      questionId: attempts.questionId,
      prompt: questions.prompt,
      topicId: questions.topicId,
      total: sql<number>`count(*)::int`,
      avg: sql<number>`avg(${attempts.score})::float`,
      players: sql<number>`count(distinct ${attempts.playerId})::int`,
    })
    .from(attempts)
    .innerJoin(questions, eq(questions.id, attempts.questionId))
    .where(eq(attempts.teamId, teamId))
    .groupBy(attempts.questionId, questions.prompt, questions.topicId)
    .having(sql`count(*) >= 2`)
    .orderBy(sql`avg(${attempts.score})`)
    .limit(10);
}

export async function openAnswers(teamId: string, database: Db = db) {
  return database
    .select({ attempt: attempts, prompt: questions.prompt })
    .from(attempts)
    .innerJoin(questions, eq(questions.id, attempts.questionId))
    .where(and(eq(attempts.teamId, teamId), eq(attempts.gradedBy, "ai")))
    .orderBy(desc(attempts.createdAt))
    .limit(50);
}

export async function overrideGrade(teamId: string, attemptId: string, correct: boolean, userId: string, database: Db = db) {
  await database
    .update(attempts)
    .set({ correct, score: correct ? 1 : 0, gradedBy: "coach", overriddenBy: userId })
    .where(and(eq(attempts.teamId, teamId), eq(attempts.id, attemptId)));
}

// ---------------- topic housekeeping ----------------

export async function renameTopic(teamId: string, topicId: string, name: string, database: Db = db) {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new Error("Give it a name.");
  await database.update(topics).set({ name: clean, nameKey: topicKey(clean) }).where(and(eq(topics.teamId, teamId), eq(topics.id, topicId)));
}

/** Fold one topic into another: its pages, interview, lessons and questions move. */
export async function mergeTopics(teamId: string, fromId: string, intoId: string, database: Db = db) {
  if (fromId === intoId) return;
  const [from] = await database.select().from(topics).where(and(eq(topics.teamId, teamId), eq(topics.id, fromId)));
  const [into] = await database.select().from(topics).where(and(eq(topics.teamId, teamId), eq(topics.id, intoId)));
  if (!from || !into) throw new Error("Topic not found.");
  await database.update(topics).set({ pageNos: [...new Set([...into.pageNos, ...from.pageNos])].sort((a, b) => a - b) }).where(eq(topics.id, into.id));
  await database.update(gaps).set({ topicId: into.id }).where(eq(gaps.topicId, from.id));
  await database.update(lessons).set({ topicId: into.id }).where(eq(lessons.topicId, from.id));
  await database.update(questions).set({ topicId: into.id }).where(eq(questions.topicId, from.id));
  await database.update(teachPages).set({ topicName: into.name }).where(and(eq(teachPages.teamId, teamId), eq(teachPages.topicName, from.name)));
  await database.update(topics).set({ archived: true, nameKey: `${from.nameKey}#merged-${from.id.slice(0, 6)}` }).where(eq(topics.id, from.id));
}
