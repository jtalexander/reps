"use server";
/** Player actions for Teach. The player comes from the signed join cookie. */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { lessons } from "@/db/teach-schema";
import { POSITION_GROUPS } from "@/domain/positions";
import { requirePlayer } from "@/server/player-session";
import { ask, completeLesson, flagQuestion, gradeAttempt } from "@/teach/service";
import { audienceOf } from "@/teach/types";

export async function gradeAction(questionId: string, given: unknown, responseMs: number, mode: "learn" | "practice") {
  const me = await requirePlayer();
  try {
    return { ok: true as const, ...(await gradeAttempt({ teamId: me.team.id, playerId: me.player.id, questionId, given, responseMs, mode })) };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function completeLessonsAction(lessonIds: string[]) {
  const me = await requirePlayer();
  for (const id of lessonIds.slice(0, 20)) {
    const [l] = await db.select({ id: lessons.id }).from(lessons).where(and(eq(lessons.teamId, me.team.id), eq(lessons.id, id), eq(lessons.status, "approved")));
    if (l) await completeLesson(me.team.id, me.player.id, l.id);
  }
}

export async function askAction(question: string) {
  const me = await requirePlayer();
  if (!question.trim()) return { ok: false as const, error: "Type a question." };
  try {
    const group = audienceOf(me.position, POSITION_GROUPS);
    return { ok: true as const, ...(await ask(me.team.id, me.player.id, group, me.position, question)) };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

/** "This question seems wrong": goes to the coach. */
export async function flagQuestionAction(questionId: string, note: string) {
  const me = await requirePlayer();
  try {
    await flagQuestion(me.team.id, me.player.id, questionId, note);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}
