/**
 * Opponents, the schedule and each opponent's scout playbook. Callers
 * authorize the team first (requireCoach / requirePlayer); every query here
 * is scoped by teamId.
 */
import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Db } from "@/shared/db";
import { formationKey, isDefense, PlayDataSchema } from "@/shared/football";
import { games, opponents, scoutPlays } from "../db/schema";

export type Opponent = typeof opponents.$inferSelect;
export type Game = typeof games.$inferSelect;
export type ScoutPlay = typeof scoutPlays.$inferSelect;

const UUID = /^[0-9a-f-]{36}$/i;
const short = (max: number) => z.string().trim().max(max).default("");

export const OpponentInput = z.object({
  name: z.string().trim().min(1, "Name the opponent.").max(80),
  season: z.coerce.number().int().min(2000).max(2100),
  headCoach: short(80),
  offensiveCoordinator: short(80),
  defensiveCoordinator: short(80),
  notes: short(2000),
});

export const GameInput = z.object({
  opponentId: z.string().regex(UUID, "Pick the opponent."),
  gameDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date."),
  kickoff: short(20),
  homeAway: z.enum(["home", "away", "neutral"]).default("home"),
  location: short(120),
  notes: short(2000),
});

// ---------- opponents ----------

export async function listOpponents(teamId: string, database: Db = db) {
  const rows = await database.select().from(opponents).where(eq(opponents.teamId, teamId)).orderBy(desc(opponents.season), asc(opponents.name));
  const counts = await database
    .select({ opponentId: scoutPlays.opponentId, n: sql<number>`count(*)::int` })
    .from(scoutPlays)
    .where(and(eq(scoutPlays.teamId, teamId), eq(scoutPlays.archived, false)))
    .groupBy(scoutPlays.opponentId);
  const by = new Map(counts.map((c) => [c.opponentId, c.n]));
  return rows.map((o) => ({ ...o, plays: by.get(o.id) ?? 0 }));
}

export async function getOpponent(teamId: string, opponentId: string, database: Db = db): Promise<Opponent | null> {
  if (!UUID.test(opponentId)) return null;
  const [row] = await database.select().from(opponents).where(and(eq(opponents.teamId, teamId), eq(opponents.id, opponentId)));
  return row ?? null;
}

/** Add an opponent for a season, or change one. The same school in the same season can only be there once. */
export async function saveOpponent(teamId: string, opponentId: string | null, input: unknown, database: Db = db): Promise<Opponent> {
  const v = OpponentInput.parse(input);
  const values = { ...v, nameKey: formationKey(v.name) };
  const [clash] = await database
    .select({ id: opponents.id })
    .from(opponents)
    .where(and(eq(opponents.teamId, teamId), eq(opponents.nameKey, values.nameKey), eq(opponents.season, v.season)));
  if (clash && clash.id !== opponentId) throw new Error(`${v.name} ${v.season} is already on your list.`);
  if (opponentId) {
    const [row] = await database.update(opponents).set(values).where(and(eq(opponents.teamId, teamId), eq(opponents.id, opponentId))).returning();
    if (!row) throw new Error("Opponent not found.");
    return row;
  }
  const [row] = await database.insert(opponents).values({ teamId, ...values }).returning();
  return row!;
}

/** Remove an opponent, with their games and scout plays. */
export async function deleteOpponent(teamId: string, opponentId: string, database: Db = db) {
  if (!UUID.test(opponentId)) return;
  await database.delete(opponents).where(and(eq(opponents.teamId, teamId), eq(opponents.id, opponentId)));
}

// ---------- schedule ----------

export async function listGames(teamId: string, database: Db = db) {
  return database
    .select({ game: games, opponent: opponents })
    .from(games)
    .innerJoin(opponents, and(eq(opponents.id, games.opponentId), eq(opponents.teamId, games.teamId)))
    .where(eq(games.teamId, teamId))
    .orderBy(asc(games.gameDate));
}

export async function saveGame(teamId: string, gameId: string | null, input: unknown, database: Db = db): Promise<Game> {
  const v = GameInput.parse(input);
  if (!(await getOpponent(teamId, v.opponentId, database))) throw new Error("Opponent not found.");
  if (gameId) {
    if (!UUID.test(gameId)) throw new Error("Game not found.");
    const [row] = await database.update(games).set(v).where(and(eq(games.teamId, teamId), eq(games.id, gameId))).returning();
    if (!row) throw new Error("Game not found.");
    return row;
  }
  const [row] = await database.insert(games).values({ teamId, ...v }).returning();
  return row!;
}

export async function deleteGame(teamId: string, gameId: string, database: Db = db) {
  if (!UUID.test(gameId)) return;
  await database.delete(games).where(and(eq(games.teamId, teamId), eq(games.id, gameId)));
}

// ---------- scout playbook ----------

export async function listScoutPlays(teamId: string, opponentId: string, database: Db = db): Promise<ScoutPlay[]> {
  if (!UUID.test(opponentId)) return [];
  return database
    .select()
    .from(scoutPlays)
    .where(and(eq(scoutPlays.teamId, teamId), eq(scoutPlays.opponentId, opponentId), eq(scoutPlays.archived, false)))
    .orderBy(asc(scoutPlays.sort), asc(scoutPlays.createdAt));
}

export async function getScoutPlay(teamId: string, playId: string, database: Db = db): Promise<ScoutPlay | null> {
  if (!UUID.test(playId)) return null;
  const [row] = await database.select().from(scoutPlays).where(and(eq(scoutPlays.teamId, teamId), eq(scoutPlays.id, playId)));
  return row ?? null;
}

/** Save a drawn scout play: a new one for this opponent, or a change to one of theirs. */
export async function saveScoutPlay(
  teamId: string,
  opponentId: string,
  playId: string | null,
  input: unknown,
  opts: { userId?: string; source?: "drawn" | "film"; database?: Db } = {},
): Promise<ScoutPlay> {
  const database = opts.database ?? db;
  const data = PlayDataSchema.parse(input);
  const columns = { name: data.name, side: isDefense(data) ? ("defense" as const) : ("offense" as const), data };
  if (!(await getOpponent(teamId, opponentId, database))) throw new Error("Opponent not found.");
  if (playId) {
    const current = await getScoutPlay(teamId, playId, database);
    if (!current || current.opponentId !== opponentId) throw new Error("Play not found.");
    const [row] = await database.update(scoutPlays).set(columns).where(and(eq(scoutPlays.teamId, teamId), eq(scoutPlays.id, playId))).returning();
    return row!;
  }
  const [last] = await database
    .select({ n: sql<number>`coalesce(max(${scoutPlays.sort}), 0)::int` })
    .from(scoutPlays)
    .where(and(eq(scoutPlays.teamId, teamId), eq(scoutPlays.opponentId, opponentId)));
  const [row] = await database
    .insert(scoutPlays)
    .values({ teamId, opponentId, ...columns, source: opts.source ?? "drawn", sort: (last?.n ?? 0) + 1, createdBy: opts.userId ?? null })
    .returning();
  return row!;
}

/** Put a scout play in this week's scout install, or take it out. */
export async function setScoutInstall(teamId: string, playId: string, on: boolean, database: Db = db) {
  if (!UUID.test(playId)) return;
  await database.update(scoutPlays).set({ inInstall: on }).where(and(eq(scoutPlays.teamId, teamId), eq(scoutPlays.id, playId)));
}

/** Every play of this opponent in or out of the week's scout install at once. */
export async function setScoutInstallAll(teamId: string, opponentId: string, on: boolean, database: Db = db) {
  if (!UUID.test(opponentId)) return;
  await database.update(scoutPlays).set({ inInstall: on }).where(and(eq(scoutPlays.teamId, teamId), eq(scoutPlays.opponentId, opponentId), eq(scoutPlays.archived, false)));
}

export async function archiveScoutPlay(teamId: string, playId: string, database: Db = db) {
  if (!UUID.test(playId)) return;
  await database.update(scoutPlays).set({ archived: true, inInstall: false }).where(and(eq(scoutPlays.teamId, teamId), eq(scoutPlays.id, playId)));
}

/** The week's scout install: the cards players see, grouped by opponent on the page. */
export async function scoutInstall(teamId: string, database: Db = db) {
  return database
    .select({ play: scoutPlays, opponent: opponents.name, season: opponents.season })
    .from(scoutPlays)
    .innerJoin(opponents, and(eq(opponents.id, scoutPlays.opponentId), eq(opponents.teamId, scoutPlays.teamId)))
    .where(and(eq(scoutPlays.teamId, teamId), eq(scoutPlays.inInstall, true), eq(scoutPlays.archived, false)))
    .orderBy(asc(opponents.name), asc(scoutPlays.side), asc(scoutPlays.sort));
}
