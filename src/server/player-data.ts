/**
 * Player data: what RepWon keeps about players, and deleting it for good.
 * Deleting a player removes their answers, practice schedule, lesson
 * progress, questions they asked and flags they raised (all cascade).
 */
import { and, eq, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { players } from "@/db/schema";

export async function deletePlayer(teamId: string, playerId: string, database: Db = db) {
  await database.delete(players).where(and(eq(players.teamId, teamId), eq(players.id, playerId)));
}

export async function deleteAllPlayers(teamId: string, database: Db = db) {
  const rows = await database.delete(players).where(eq(players.teamId, teamId)).returning({ id: players.id });
  return rows.length;
}

export async function playerDataCounts(teamId: string, database: Db = db) {
  const [r] = await database
    .select({
      players: sql<number>`count(*)::int`,
      removed: sql<number>`count(*) filter (where not ${players.active})::int`,
    })
    .from(players)
    .where(eq(players.teamId, teamId));
  return { players: r?.players ?? 0, removed: r?.removed ?? 0 };
}
