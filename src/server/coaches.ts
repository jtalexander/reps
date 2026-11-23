/**
 * More than one coach per team. The owner shares an invite link; anyone who
 * signs in through it becomes a coach on the team. Coaches can do everything
 * on the team except manage coaches and delete all player data (owner only).
 */
import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db, type Db } from "@/db";
import { teamCoaches, teams, users } from "@/db/schema";

export async function listCoaches(teamId: string, database: Db = db) {
  return database
    .select({ userId: users.id, name: users.name, email: users.email, role: teamCoaches.role, since: teamCoaches.createdAt })
    .from(teamCoaches)
    .innerJoin(users, eq(users.id, teamCoaches.userId))
    .where(eq(teamCoaches.teamId, teamId))
    .orderBy(asc(teamCoaches.createdAt));
}

/** A fresh invite link code (the old link stops working). */
export async function newCoachInvite(teamId: string, database: Db = db) {
  const code = randomBytes(12).toString("base64url");
  await database.update(teams).set({ coachInviteCode: code }).where(eq(teams.id, teamId));
  return code;
}

export async function stopCoachInvite(teamId: string, database: Db = db) {
  await database.update(teams).set({ coachInviteCode: null }).where(eq(teams.id, teamId));
}

/** Join a team as a coach through its invite link. Returns the team id, or null for a dead link. */
export async function joinAsCoach(code: string, userId: string, database: Db = db) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(code)) return null;
  const [team] = await database.select({ id: teams.id }).from(teams).where(eq(teams.coachInviteCode, code));
  if (!team) return null;
  await database.insert(teamCoaches).values({ teamId: team.id, userId, role: "coach" }).onConflictDoNothing();
  return team.id;
}

/** The owner removes a coach (never the owner). */
export async function removeCoach(teamId: string, userId: string, database: Db = db) {
  await database.delete(teamCoaches).where(and(eq(teamCoaches.teamId, teamId), eq(teamCoaches.userId, userId), eq(teamCoaches.role, "coach")));
}
