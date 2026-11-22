"use server";
/** Coach actions for Teach. Every action checks the coach first. */
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import { uploadPages } from "@/db/schema";
import { renderPages } from "@/server/ingest";
import { dispatchJob } from "@/teach/dispatch";
import { requireCoach } from "@/server/teams";
import {
  acceptSuggestions,
  answerGap,
  approveTopic,
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
async function startJob(teamId: string, kind: "decode_page" | "find_gaps" | "write_topic" | "triage", ref: string): Promise<R<{ jobId: string }>> {
  try {
    await requireCoach(teamId);
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
  patch: { status?: "approved" | "rejected" | "draft"; prompt?: string; explanation?: string; data?: unknown; audience?: string[] },
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
export async function approveTopicAction(teamId: string, topicId: string, except: string[] = []): Promise<R<{ lessons: number; questions: number }>> {
  try {
    const { user } = await requireCoach(teamId);
    const r = await approveTopic(teamId, topicId, user.id, except.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500));
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
