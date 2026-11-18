/**
 * Play persistence: save coach edits, recompute status, approve, and keep
 * plays in step with the team's concept library. Callers authorize the team
 * first (requireCoach); every query here is scoped by teamId.
 */
// No "server-only": the Netlify background reader imports this module.
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, type Db } from "@/db";
import { plays, teamConcepts, teams } from "@/db/schema";
import {
  applyConcept,
  recognizeConcept,
  teamConcepts as mergeConcepts,
  type Concept,
} from "@/domain/concepts";
import { PlayDataSchema, type PlayData } from "@/domain/play";
import { readiness, type Level } from "@/domain/readiness";

export type PlayRow = typeof plays.$inferSelect;

export async function conceptsForTeam(teamId: string, database: Db = db): Promise<Concept[]> {
  const rows = await database.select().from(teamConcepts).where(eq(teamConcepts.teamId, teamId));
  return mergeConcepts(Object.fromEntries(rows.map((r) => [r.conceptKey, r.data])));
}

export async function getPlay(teamId: string, playId: string, database: Db = db): Promise<PlayRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(playId)) return null;
  const [row] = await database
    .select()
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.id, playId), inArray(plays.kind, ["play", "page"])));
  return row ?? null;
}

export async function listPlays(teamId: string, database: Db = db): Promise<PlayRow[]> {
  return database
    .select()
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false), eq(plays.kind, "play")))
    .orderBy(asc(plays.sourcePage), asc(plays.boxIndex), asc(plays.createdAt));
}

/** Status after an edit: approved plays stay approved only while complete. */
export function statusFor(data: PlayData, level: Level, wasApproved: boolean) {
  const r = readiness(data, level);
  const status: PlayRow["status"] = wasApproved && r.complete ? "approved" : r.complete ? "draft" : "needs_coach_input";
  return { status, qbReady: status === "approved" && r.qbReady, readiness: r };
}

function columnsFor(data: PlayData) {
  return {
    name: data.name,
    playType: String(data.play_type),
    conceptKey: data.concept_key,
    data,
  };
}

/** Fill a freshly read play from the concept library (suggestions only). */
export function withConcept(data: PlayData, concepts: Concept[]): PlayData {
  const concept = recognizeConcept(data, concepts);
  return concept ? applyConcept(data, concept) : data;
}

export async function savePlayData(
  teamId: string,
  playId: string,
  input: unknown,
  opts: { level: Level; database?: Db } = { level: "youth" },
): Promise<PlayRow> {
  const database = opts.database ?? db;
  const current = await getPlay(teamId, playId, database);
  if (!current) throw new Error("Play not found.");
  const data = PlayDataSchema.parse(input);
  const { status, qbReady } = statusFor(data, opts.level, current.status === "approved");
  const [row] = await database
    .update(plays)
    .set({ ...columnsFor(data), status, qbReady, ...(status !== "approved" ? { approvedAt: null, approvedBy: null } : {}) })
    .where(and(eq(plays.teamId, teamId), eq(plays.id, playId)))
    .returning();
  return row!;
}

export async function approvePlay(teamId: string, playId: string, userId: string, level: Level, database: Db = db) {
  const current = await getPlay(teamId, playId, database);
  if (!current?.data) throw new Error("Play not found.");
  const r = readiness(current.data, level);
  if (!r.complete) {
    throw new Error(`Still needed: ${r.missing.map((m) => m.label).join(", ")}`);
  }
  // Approval confirms every suggested value.
  const data: PlayData = { ...current.data, suggested: [] };
  const [row] = await database
    .update(plays)
    .set({ data, status: "approved", qbReady: r.qbReady, approvedAt: new Date(), approvedBy: userId })
    .where(and(eq(plays.teamId, teamId), eq(plays.id, playId)))
    .returning();
  return row!;
}

export async function unapprovePlay(teamId: string, playId: string, level: Level, database: Db = db) {
  const current = await getPlay(teamId, playId, database);
  if (!current?.data) throw new Error("Play not found.");
  const { status } = statusFor(current.data, level, false);
  await database
    .update(plays)
    .set({ status, qbReady: false, approvedAt: null, approvedBy: null })
    .where(and(eq(plays.teamId, teamId), eq(plays.id, playId)));
}

/** Link a play to a concept (or a different one) and fill from it. */
export async function setPlayConcept(teamId: string, playId: string, conceptKey: string | null, level: Level, database: Db = db) {
  const current = await getPlay(teamId, playId, database);
  if (!current?.data) throw new Error("Play not found.");
  let data: PlayData = { ...current.data, concept_key: conceptKey };
  if (conceptKey) {
    const concept = (await conceptsForTeam(teamId, database)).find((c) => c.key === conceptKey);
    if (!concept) throw new Error("Unknown concept.");
    data = applyConcept(data, concept);
  }
  return savePlayData(teamId, playId, data, { level, database });
}

/**
 * Save a team's version of a concept and push it into every play that
 * uses it. Fields the coach typed on a play are left alone; fields that
 * came from the concept are rewritten.
 */
export async function saveTeamConcept(teamId: string, key: string, patch: Partial<Concept>, database: Db = db) {
  const [team] = await database.select().from(teams).where(eq(teams.id, teamId));
  if (!team) throw new Error("Team not found.");
  await database
    .insert(teamConcepts)
    .values({ teamId, conceptKey: key, data: patch })
    .onConflictDoUpdate({ target: [teamConcepts.teamId, teamConcepts.conceptKey], set: { data: patch } });
  const concept = (await conceptsForTeam(teamId, database)).find((c) => c.key === key)!;
  const using = await database.select().from(plays).where(and(eq(plays.teamId, teamId), eq(plays.conceptKey, key)));
  for (const p of using) {
    if (!p.data) continue;
    const approved = p.status === "approved";
    const data = applyConcept(p.data, concept, { refresh: true, markSuggested: !approved });
    const { status, qbReady } = statusFor(data, team.level, approved);
    await database
      .update(plays)
      .set({ ...columnsFor(data), status, qbReady })
      .where(and(eq(plays.teamId, teamId), eq(plays.id, p.id)));
  }
  return using.length;
}

/** Recompute every play's status (after a level change). */
export async function restatusAll(teamId: string, level: Level, database: Db = db) {
  const rows = await listPlays(teamId, database);
  for (const p of rows) {
    if (!p.data) continue;
    const { status, qbReady } = statusFor(p.data, level, p.status === "approved");
    if (status !== p.status || qbReady !== p.qbReady)
      await database.update(plays).set({ status, qbReady }).where(and(eq(plays.teamId, teamId), eq(plays.id, p.id)));
  }
}

export async function approvedPlays(teamId: string, ids?: string[], database: Db = db) {
  const where = [eq(plays.teamId, teamId), eq(plays.status, "approved"), eq(plays.archived, false), eq(plays.kind, "play")];
  if (ids?.length) where.push(inArray(plays.id, ids));
  return database.select().from(plays).where(and(...where)).orderBy(asc(plays.sourcePage), asc(plays.boxIndex));
}
