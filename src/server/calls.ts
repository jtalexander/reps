/**
 * A team's call system. The configuration lives on teams.call_system; a
 * single row in `plays` (kind "calls") anchors quiz results and spaced
 * repetition for call questions, and its status says whether call quizzes
 * are on (the coach turns them on, like approving an item).
 */
import { and, eq } from "drizzle-orm";
import { db, type Db } from "@/db";
import { plays, teams } from "@/db/schema";
import { CallSystemSchema, type CallSystem } from "@/domain/calls";

export async function callsRow(teamId: string, database: Db = db) {
  const [row] = await database.select().from(plays).where(and(eq(plays.teamId, teamId), eq(plays.kind, "calls")));
  return row ?? null;
}

export async function saveCallSystem(teamId: string, raw: unknown, opts: { quizzes: boolean; userId: string }, database: Db = db) {
  const system = CallSystemSchema.parse(raw);
  await database.update(teams).set({ callSystem: system }).where(eq(teams.id, teamId));
  const status = opts.quizzes ? "approved" : "draft";
  const row = await callsRow(teamId, database);
  if (row) {
    await database
      .update(plays)
      .set({ status, approvedAt: opts.quizzes ? new Date() : null, approvedBy: opts.quizzes ? opts.userId : null })
      .where(eq(plays.id, row.id));
  } else {
    await database.insert(plays).values({
      teamId,
      kind: "calls",
      name: "Play-calling system",
      nameKey: "CALLS",
      extraction: "done",
      status,
      approvedAt: opts.quizzes ? new Date() : null,
      approvedBy: opts.quizzes ? opts.userId : null,
    });
  }
  return system;
}

export function teamCallSystem(team: { callSystem: unknown }): CallSystem {
  return CallSystemSchema.parse(team.callSystem ?? {});
}

/** The call system as a quiz entry, when the coach has turned call quizzes on. */
export async function callsForQuiz(team: { id: string; callSystem: unknown }, database: Db = db) {
  const row = await callsRow(team.id, database);
  if (!row || row.status !== "approved") return null;
  return { id: row.id, system: teamCallSystem(team) };
}
