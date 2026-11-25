"use server";
/** Coach actions for Teach. Every action checks the coach first. */
import { setInstallName, setPlaysInstall } from "@/teach/install";
import { ensureBatchRead } from "@/teach/read-batch";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import { uploadPages } from "@/db/schema";
import { renderPages } from "@/server/ingest";
import { dispatchJob } from "@/teach/dispatch";
import { WORKERS, dispatchWorkers, startPlaybookRun, stopPlaybookRun } from "@/teach/playbook-run";
import { requireCoach } from "@/server/teams";
import type { Naming } from "@/domain/naming";
import { saveNaming } from "@/teach/naming";
import { copyFromTeam } from "@/teach/reuse";
import { aiBlockedReason } from "@/teach/usage";
import type { RouteTree } from "@/domain/route-tree";
import { saveRouteTree } from "@/library/sync";
import { approveConvertedTopic, queueConversions, retryConversion } from "@/teach/convert-run";
import {
  acceptSuggestions,
  answerGap,
  approveTopic,
  clearInstall,
  setInstall,
  setInstallOnly,
  jobStatus,
  mergeTopics,
  newJob,
  overrideGrade,
  prepareDecode,
  renameTopic,
  resolveFlags,
  reviewLesson,
  reviewQuestion,
} from "@/teach/service";

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) });

/** Refuse to queue AI work while the team's AI is off or over its monthly cap. */
async function aiReady(teamId: string) {
  const why = await aiBlockedReason(teamId);
  if (why) throw new Error(why);
}

function parsePages(spec: string, max: number): number[] {
  const out = new Set<number>();
  for (const part of spec.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`"${part}" isn't a page or range. Use something like 5-10, 21, 27.`);
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) if (n >= 1 && n <= max) out.add(n);
  }
  if (out.size === 0) throw new Error("No pages in that range.");
  if (out.size > 150) throw new Error("That's more than 150 pages at once.");
  return [...out].sort((x, y) => x - y);
}

export async function prepareDecodeAction(teamId: string, uploadId: string, spec: string, pageCount: number): Promise<R<{ ids: string[] }>> {
  try {
    await requireCoach(teamId);
    const pages = parsePages(spec, pageCount);
    // split only the pages that haven't been split yet
    const have = new Set(
      (
        await db
          .select({ n: uploadPages.pageNo })
          .from(uploadPages)
          .where(and(eq(uploadPages.teamId, teamId), eq(uploadPages.uploadId, uploadId)))
      ).map((r) => r.n),
    );
    for (const n of pages) if (!have.has(n)) await renderPages(teamId, uploadId, n, n);
    return { ok: true, ids: await prepareDecode(teamId, uploadId, pages) };
  } catch (e) {
    return fail(e);
  }
}

/** The site address this request came in on, so the background call reaches the same deploy. */
async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}

/**
 * Queue an AI job and return at once; the page waits with `jobStatusAction`.
 * (AI steps can take minutes; a request on Netlify can't.)
 */
async function startJob(teamId: string, kind: "decode_page" | "find_gaps" | "write_topic" | "triage" | "naming", ref: string): Promise<R<{ jobId: string }>> {
  try {
    await requireCoach(teamId);
    await aiReady(teamId);
    const job = await newJob(teamId, kind, ref);
    await dispatchJob(job.id, await origin());
    return { ok: true, jobId: job.id };
  } catch (e) {
    return fail(e);
  }
}

export async function decodePageAction(teamId: string, teachPageId: string) {
  return startJob(teamId, "decode_page", teachPageId);
}
export async function findGapsAction(teamId: string, topicId: string) {
  return startJob(teamId, "find_gaps", topicId);
}
export async function writeTopicAction(teamId: string, topicId: string) {
  return startJob(teamId, "write_topic", topicId);
}
/** Draft the team's naming rules from everything RepWon read (one AI call). */
export async function draftNamingAction(teamId: string) {
  return startJob(teamId, "naming", teamId);
}
/** Re-rank the open questions and link repeats across topics (one AI call). */
export async function triageAction(teamId: string) {
  return startJob(teamId, "triage", teamId);
}

export async function jobStatusAction(
  teamId: string,
  jobId: string,
): Promise<R<{ status: "queued" | "running" | "done" | "failed"; error: string | null; result: Record<string, number> | null }>> {
  try {
    await requireCoach(teamId);
    const s = await jobStatus(teamId, jobId);
    if (s.status === "done") revalidatePath(`/t/${teamId}/teach`);
    return { ok: true, ...s };
  } catch (e) {
    return fail(e);
  }
}

export async function answerGapAction(
  teamId: string,
  gapId: string,
  action: { kind: "answer"; text: string } | { kind: "approve" } | { kind: "skip" } | { kind: "reopen" },
): Promise<R> {
  try {
    const { user } = await requireCoach(teamId);
    await answerGap(teamId, gapId, action, user.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function reviewLessonAction(
  teamId: string,
  id: string,
  patch: { status?: "approved" | "rejected" | "draft"; title?: string; body?: string; audience?: string },
): Promise<R> {
  try {
    const { user } = await requireCoach(teamId);
    await reviewLesson(teamId, id, patch, user.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function reviewQuestionAction(
  teamId: string,
  id: string,
  patch: { status?: "approved" | "rejected" | "draft"; prompt?: string; explanation?: string; data?: unknown; audience?: string[]; tier?: "core" | "reserve" },
): Promise<R> {
  try {
    const { user } = await requireCoach(teamId);
    await reviewQuestion(teamId, id, patch, user.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function renameTopicAction(teamId: string, topicId: string, name: string): Promise<R> {
  try {
    await requireCoach(teamId);
    await renameTopic(teamId, topicId, name);
    revalidatePath(`/t/${teamId}/teach`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function mergeTopicsAction(teamId: string, fromId: string, intoId: string): Promise<R> {
  try {
    await requireCoach(teamId);
    await mergeTopics(teamId, fromId, intoId);
    revalidatePath(`/t/${teamId}/teach`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function overrideGradeAction(teamId: string, attemptId: string, correct: boolean): Promise<R> {
  try {
    const { user } = await requireCoach(teamId);
    await overrideGrade(teamId, attemptId, correct, user.id);
    revalidatePath(`/t/${teamId}/teach/results`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Approve every draft lesson and question on a topic in one go. */
export async function approveTopicAction(
  teamId: string,
  topicId: string,
  except: string[] = [],
  pile: "core" | "reserve" = "core",
): Promise<R<{ lessons: number; questions: number }>> {
  try {
    const { user } = await requireCoach(teamId);
    const r = await approveTopic(
      teamId,
      topicId,
      user.id,
      except.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500),
      undefined,
      pile === "reserve" ? "reserve" : "core",
    );
    revalidatePath(`/t/${teamId}/teach`);
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}

/** Approve every suggested answer on a topic's main questions. */
export async function acceptSuggestionsAction(teamId: string, topicId: string): Promise<R<{ n: number }>> {
  try {
    const { user } = await requireCoach(teamId);
    const n = await acceptSuggestions(teamId, topicId, user.id);
    revalidatePath(`/t/${teamId}/teach`);
    return { ok: true, n };
  } catch (e) {
    return fail(e);
  }
}

export async function resolveFlagsAction(teamId: string, questionId: string): Promise<R> {
  try {
    const { user } = await requireCoach(teamId);
    await resolveFlags(teamId, questionId, user.id);
    revalidatePath(`/t/${teamId}/teach`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** One tap: read every page, find questions, sort, write drafts, all on the server. */
export async function startPlaybookRunAction(teamId: string, uploadId: string): Promise<R> {
  try {
    await requireCoach(teamId);
    if (!/^[0-9a-f-]{36}$/i.test(uploadId)) throw new Error("Pick a playbook.");
    await aiReady(teamId);
    await startPlaybookRun(teamId, uploadId);
    await dispatchWorkers(teamId, await origin(), WORKERS);
    revalidatePath(`/t/${teamId}/teach`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Restart the workers of a run that stopped moving (extra workers just find nothing to do). */
export async function keepGoingAction(teamId: string): Promise<R> {
  try {
    await requireCoach(teamId);
    await aiReady(teamId);
    await dispatchWorkers(teamId, await origin(), WORKERS);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function stopPlaybookRunAction(teamId: string): Promise<R> {
  try {
    await requireCoach(teamId);
    await stopPlaybookRun(teamId);
    revalidatePath(`/t/${teamId}/teach`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Put a topic in or out of the install the team is learning now. */
export async function setInstallAction(teamId: string, topicId: string, on: boolean): Promise<R> {
  try {
    await requireCoach(teamId);
    if (!/^[0-9a-f-]{36}$/i.test(topicId)) throw new Error("Topic not found.");
    await setInstall(teamId, topicId, !!on);
    revalidatePath(`/t/${teamId}/teach`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Start a new install: take every topic out of it. */
export async function clearInstallAction(teamId: string): Promise<R> {
  try {
    await requireCoach(teamId);
    await clearInstall(teamId);
    revalidatePath(`/t/${teamId}/teach`);
    revalidatePath(`/t/${teamId}/install`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Put plays in or out of this week's install, one by one. */
export async function setPlaysInstallAction(teamId: string, ids: string[], on: boolean): Promise<R<{ n: number }>> {
  try {
    await requireCoach(teamId);
    const clean = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 300);
    const n = await setPlaysInstall(teamId, clean, !!on);
    revalidatePath(`/t/${teamId}/install`);
    revalidatePath(`/t/${teamId}/teach`);
    return { ok: true, n };
  } catch (e) {
    return fail(e);
  }
}

/** Name this week's install ("Week 7: Eagles"); blank takes the name off. */
export async function setInstallNameAction(teamId: string, name: string): Promise<R<{ name: string | null }>> {
  try {
    await requireCoach(teamId);
    const saved = await setInstallName(teamId, String(name ?? ""));
    revalidatePath(`/t/${teamId}/install`);
    revalidatePath(`/t/${teamId}/teach`);
    return { ok: true, name: saved };
  } catch (e) {
    return fail(e);
  }
}

/** Save the coach's edits to the naming rules; `approve` marks them confirmed. */
export async function saveNamingAction(teamId: string, naming: Naming, approve: boolean): Promise<R<object>> {
  try {
    await requireCoach(teamId);
    await saveNaming(teamId, naming, approve);
    revalidatePath(`/t/${teamId}/plays/naming`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * The end of the guided check: confirm the naming rules, and save the route
 * tree the playbook showed (if the coach checked one and hasn't saved a tree
 * on Settings already).
 */
export async function confirmNamingAction(teamId: string, naming: Naming, tree: RouteTree | null): Promise<R<{ routeTree: boolean }>> {
  try {
    const { user, team } = await requireCoach(teamId);
    await saveNaming(teamId, naming, true);
    // now RepWon can read every drawing behind the scenes, so plays are ready before the coach needs them
    await ensureBatchRead(teamId, await origin()).catch((err) => console.error("read batch", teamId, err));
    const saveTree = Boolean(tree && !team.routeTree && tree.routes.length);
    if (saveTree) await saveRouteTree(teamId, tree!, user.id);
    revalidatePath(`/t/${teamId}`, "layout");
    return { ok: true, routeTree: saveTree };
  } catch (e) {
    return fail(e);
  }
}

// ---------- drawings -> plays ----------
const TOPIC_ID = /^[0-9a-f-]{36}$/i;

/** Queue conversion of the install topics' drawings, or of the given topics'. Call again while `left` > 0. */
export async function convertTopicsAction(teamId: string, which: "install" | string[]): Promise<R<{ queued: number; failed: number; left: number }>> {
  try {
    await requireCoach(teamId);
    const pick = which === "install" ? "install" : which.filter((x) => TOPIC_ID.test(x)).slice(0, 100);
    await aiReady(teamId);
    const r = await queueConversions(teamId, pick, await origin());
    revalidatePath(`/t/${teamId}/plays/converted`);
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}

/** The coach checked a topic's converted plays side by side: approve them all. */
export async function approveConvertedTopicAction(teamId: string, topicId: string): Promise<R<{ approved: number }>> {
  try {
    const { user } = await requireCoach(teamId);
    if (!TOPIC_ID.test(topicId)) throw new Error("That topic wasn't found.");
    const approved = await approveConvertedTopic(teamId, topicId, user.id);
    revalidatePath(`/t/${teamId}/plays/converted`);
    return { ok: true, approved };
  } catch (e) {
    return fail(e);
  }
}

/** Throw away one converted play and have RepWon read its drawing again. */
export async function retryConversionAction(teamId: string, playId: string): Promise<R<object>> {
  try {
    await requireCoach(teamId);
    if (!TOPIC_ID.test(playId)) throw new Error("That play wasn't found.");
    await aiReady(teamId);
    await retryConversion(teamId, playId, await origin());
    revalidatePath(`/t/${teamId}/plays/converted`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Teach only asks about and reviews the install topics (or every topic again). */
export async function setInstallOnlyAction(teamId: string, on: boolean): Promise<R<object>> {
  try {
    await requireCoach(teamId);
    await setInstallOnly(teamId, on);
    revalidatePath(`/t/${teamId}/teach`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Bring this coach's work over from another of their teams (both must be theirs). */
export async function copyFromTeamAction(teamId: string, fromTeamId: string): Promise<R<{ topics: number; answers: number; lessons: number; questions: number; naming: number }>> {
  try {
    const { user } = await requireCoach(teamId);
    if (!/^[0-9a-f-]{36}$/i.test(fromTeamId)) throw new Error("Pick a team.");
    await requireCoach(fromTeamId);
    const r = await copyFromTeam(fromTeamId, teamId, user.id);
    revalidatePath(`/t/${teamId}/teach`);
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}
