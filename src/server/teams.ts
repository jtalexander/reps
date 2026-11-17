import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db, type Db } from "@/db";
import { teamCoaches, teams } from "@/db/schema";
import { auth } from "@/lib/auth";
import type { Level } from "@/domain/readiness";

export type Team = typeof teams.$inferSelect;
export type SessionUser = { id: string; name: string; email: string };

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email } = session.user;
  return { id, name, email };
}

export async function requireUser(next = "/coach"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return user;
}

/** The team, if this user coaches it; 404 otherwise (never reveal other teams). */
export async function requireCoach(teamId: string): Promise<{ user: SessionUser; team: Team; role: "owner" | "coach" }> {
  const user = await requireUser(`/t/${teamId}`);
  if (!/^[0-9a-f-]{36}$/i.test(teamId)) notFound();
  const row = await db
    .select({ team: teams, role: teamCoaches.role })
    .from(teams)
    .innerJoin(teamCoaches, and(eq(teamCoaches.teamId, teams.id), eq(teamCoaches.userId, user.id)))
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!row[0]) notFound();
  return { user, team: row[0].team, role: row[0].role };
}

export async function teamsForUser(userId: string): Promise<Team[]> {
  const rows = await db
    .select({ team: teams })
    .from(teams)
    .innerJoin(teamCoaches, eq(teamCoaches.teamId, teams.id))
    .where(eq(teamCoaches.userId, userId))
    .orderBy(asc(teams.name));
  return rows.map((r) => r.team);
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newJoinCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export async function createTeam(database: Db, userId: string, name: string, level: Level): Promise<Team> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await database.transaction(async (tx) => {
        const [team] = await tx.insert(teams).values({ name, level, joinCode: newJoinCode() }).returning();
        await tx.insert(teamCoaches).values({ teamId: team!.id, userId, role: "owner" });
        return team!;
      });
    } catch (err) {
      const constraint = (err as { cause?: { constraint?: string } }).cause?.constraint;
      if (constraint !== "teams_join_code_unique") throw err;
    }
  }
  throw new Error("Could not create a unique join code. Try again.");
}

export function normalizeJoinCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
