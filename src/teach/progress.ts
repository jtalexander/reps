/**
 * Coach-facing progress: who is game-ready on this week's install, and how
 * far each player is on each assigned study set. Built on topic mastery (each
 * player's latest score on every question they've answered in a topic).
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { players, studySets } from "@/db/schema";
import { questions, topics } from "@/db/teach-schema";
import { inGroups } from "@/domain/positions";
import { mastery } from "./service";

/** A topic counts as known at 85%+ once a player has answered enough of it (3, or all of a smaller topic). */
export const KNOWN = 0.85;
const ENOUGH = 3;

export interface TopicScore {
  topicId: string;
  score: number | null;
  answered: number;
  known: boolean;
}

async function scores(teamId: string, database: Db) {
  const m = await mastery(teamId, database);
  const counts = await database
    .select({ topicId: questions.topicId, n: sql<number>`count(*)::int` })
    .from(questions)
    .where(and(eq(questions.teamId, teamId), eq(questions.status, "approved")))
    .groupBy(questions.topicId);
  const size = new Map(counts.map((c) => [c.topicId, c.n]));
  const by = new Map(m.map((r) => [`${r.playerId}:${r.topicId}`, r]));
  return (playerId: string, topicId: string): TopicScore => {
    const r = by.get(`${playerId}:${topicId}`);
    const need = Math.min(ENOUGH, size.get(topicId) ?? ENOUGH);
    return { topicId, score: r ? r.score : null, answered: r?.answered ?? 0, known: !!r && r.answered >= need && r.score >= KNOWN };
  };
}

/** Average over topics, counting a topic not started as 0. */
const avg = (s: TopicScore[]) => (s.length ? s.reduce((a, x) => a + (x.score ?? 0), 0) / s.length : 0);

/** Game-ready: every install topic known. */
export async function gameReady(teamId: string, database: Db = db) {
  const install = await database
    .select({ id: topics.id, name: topics.name })
    .from(topics)
    .where(and(eq(topics.teamId, teamId), eq(topics.inInstall, true), eq(topics.archived, false)))
    .orderBy(asc(topics.sort));
  if (!install.length) return null;
  const roster = await database.select().from(players).where(and(eq(players.teamId, teamId), eq(players.active, true))).orderBy(asc(players.name));
  const score = await scores(teamId, database);
  const rows = roster.map((p) => {
    const s = install.map((t) => score(p.id, t.id));
    return { playerId: p.id, name: p.name, positions: p.positions, topics: s, known: s.filter((x) => x.known).length, avg: avg(s), ready: s.every((x) => x.known) };
  });
  rows.sort((a, b) => Number(b.ready) - Number(a.ready) || b.avg - a.avg);
  return { topics: install, rows, ready: rows.filter((r) => r.ready).length };
}

/** Each topic study set: per player (in the set's positions), how many of its topics are known. */
export async function setProgress(teamId: string, database: Db = db) {
  const sets = (await database.select().from(studySets).where(eq(studySets.teamId, teamId)).orderBy(desc(studySets.createdAt))).filter((s) => s.topicIds.length > 0);
  if (!sets.length) return [];
  const roster = await database.select().from(players).where(and(eq(players.teamId, teamId), eq(players.active, true))).orderBy(asc(players.name));
  const score = await scores(teamId, database);
  return sets.map((s) => {
    const rows = roster
      .filter((p) => p.positions.some((pos) => inGroups(pos, s.positions)) || s.positions.length === 0)
      .map((p) => {
        const t = s.topicIds.map((id) => score(p.id, id));
        return { playerId: p.id, name: p.name, positions: p.positions, known: t.filter((x) => x.known).length, started: t.filter((x) => x.answered > 0).length, avg: avg(t) };
      })
      .sort((a, b) => b.known - a.known || b.avg - a.avg);
    return { id: s.id, name: s.name, dueDate: s.dueDate, topics: s.topicIds.length, rows, done: rows.filter((r) => r.known === s.topicIds.length).length };
  });
}
