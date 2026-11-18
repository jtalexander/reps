/** Coach dashboard numbers. All scoped by teamId. */
import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { answers, players, plays } from "@/db/schema";

export async function completeness(teamId: string, database: Db = db) {
  const [r] = await database
    .select({
      total: sql<number>`count(*) filter (where ${plays.data} is not null)::int`,
      approved: sql<number>`count(*) filter (where ${plays.status} = 'approved')::int`,
      qbPlays: sql<number>`count(*) filter (where ${plays.playType} in ('pass','play_action','rpo','screen','option'))::int`,
      qbReady: sql<number>`count(*) filter (where ${plays.qbReady} and ${plays.playType} in ('pass','play_action','rpo','screen','option'))::int`,
      needsInput: sql<number>`count(*) filter (where ${plays.status} = 'needs_coach_input')::int`,
      readyToApprove: sql<number>`count(*) filter (where ${plays.status} = 'draft' and ${plays.data} is not null)::int`,
      pending: sql<number>`count(*) filter (where ${plays.data} is null)::int`,
    })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false), eq(plays.kind, "play")));
  return r!;
}

export async function resultsByPlay(teamId: string, sinceDays?: number, database: Db = db) {
  const where = [eq(answers.teamId, teamId)];
  if (sinceDays) where.push(gte(answers.createdAt, new Date(Date.now() - sinceDays * 86_400_000)));
  return database
    .select({
      playId: answers.playId,
      name: plays.name,
      total: sql<number>`count(*)::int`,
      correct: sql<number>`count(*) filter (where ${answers.correct})::int`,
      players: sql<number>`count(distinct ${answers.playerId})::int`,
      playersMissing: sql<number>`count(distinct ${answers.playerId}) filter (where not ${answers.correct})::int`,
    })
    .from(answers)
    .innerJoin(plays, eq(plays.id, answers.playId))
    .where(and(...where))
    .groupBy(answers.playId, plays.name)
    .orderBy(sql`count(*) filter (where ${answers.correct})::float / count(*)`);
}

export async function resultsByType(teamId: string, playerId?: string, database: Db = db) {
  const where = [eq(answers.teamId, teamId)];
  if (playerId) where.push(eq(answers.playerId, playerId));
  return database
    .select({
      quizType: answers.quizType,
      total: sql<number>`count(*)::int`,
      correct: sql<number>`count(*) filter (where ${answers.correct})::int`,
      avgMs: sql<number>`avg(${answers.responseMs})::int`,
    })
    .from(answers)
    .where(and(...where))
    .groupBy(answers.quizType);
}

export async function resultsByPlayer(teamId: string, database: Db = db) {
  return database
    .select({
      playerId: players.id,
      name: players.name,
      positions: players.positions,
      total: sql<number>`count(${answers.id})::int`,
      correct: sql<number>`count(${answers.id}) filter (where ${answers.correct})::int`,
      avgMs: sql<number>`coalesce(avg(${answers.responseMs}), 0)::int`,
      lastAt: sql<Date | null>`max(${answers.createdAt})`,
    })
    .from(players)
    .leftJoin(answers, eq(answers.playerId, players.id))
    .where(and(eq(players.teamId, teamId), eq(players.active, true)))
    .groupBy(players.id, players.name, players.positions)
    .orderBy(players.name);
}

export async function playerPlayResults(teamId: string, playerId: string, database: Db = db) {
  return database
    .select({
      playId: answers.playId,
      name: plays.name,
      quizType: answers.quizType,
      total: sql<number>`count(*)::int`,
      correct: sql<number>`count(*) filter (where ${answers.correct})::int`,
    })
    .from(answers)
    .innerJoin(plays, eq(plays.id, answers.playId))
    .where(and(eq(answers.teamId, teamId), eq(answers.playerId, playerId)))
    .groupBy(answers.playId, plays.name, answers.quizType)
    .orderBy(plays.name);
}

export const pct = (c: number, t: number) => (t ? Math.round((c / t) * 100) : null);
