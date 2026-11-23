import "server-only";
/**
 * The Reps admin: people in the `admins` table see every team on /admin, turn
 * a team's AI on or off, and set its monthly AI cap. Nobody else can tell the
 * page exists (404).
 */
import { desc, eq, isNull, sql, and, gte } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, type Db } from "@/db";
import { admins, answers, players, teamCoaches, teams, users } from "@/db/schema";
import { aiUsage, attempts } from "@/db/teach-schema";
import { DEFAULT_CAP_USD, dollars, monthSpendByTeam } from "@/teach/usage";
import { requireUser, type SessionUser } from "./teams";

export async function isAdmin(userId: string, database: Db = db): Promise<boolean> {
  const [row] = await database.select({ id: admins.userId }).from(admins).where(eq(admins.userId, userId));
  return Boolean(row);
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser("/admin");
  if (!(await isAdmin(user.id))) notFound();
  return user;
}

export type AdminTeam = {
  id: string;
  name: string;
  level: string;
  createdAt: Date;
  access: "pending" | "on" | "off";
  cap: number;
  capSet: boolean;
  ownerName: string | null;
  ownerEmail: string | null;
  coaches: number;
  players: number;
  lastActive: Date | null;
  spend: number;
};

/** Every team with its owner, size, last player activity and this month's AI spend. */
export async function adminTeams(database: Db = db): Promise<AdminTeam[]> {
  const rows = await database
    .select({
      id: teams.id,
      name: teams.name,
      level: teams.level,
      createdAt: teams.createdAt,
      access: teams.aiAccess,
      cap: teams.aiBudgetUsd,
      ownerName: users.name,
      ownerEmail: users.email,
      coaches: sql<number>`(select count(*)::int from ${teamCoaches} c where c.team_id = ${teams.id})`,
      players: sql<number>`(select count(*)::int from ${players} p where p.team_id = ${teams.id})`,
      lastActive: sql<Date | null>`greatest((select max(a.created_at) from ${attempts} a where a.team_id = ${teams.id}), (select max(q.created_at) from ${answers} q where q.team_id = ${teams.id}))`,
    })
    .from(teams)
    .leftJoin(teamCoaches, and(eq(teamCoaches.teamId, teams.id), eq(teamCoaches.role, "owner")))
    .leftJoin(users, eq(users.id, teamCoaches.userId))
    .orderBy(desc(teams.createdAt));
  const spend = await monthSpendByTeam(
    rows.map((r) => r.id),
    database,
  );
  // a team has one owner; guard against duplicates all the same
  const seen = new Set<string>();
  return rows
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .map((r) => ({
      ...r,
      cap: r.cap ?? DEFAULT_CAP_USD,
      capSet: r.cap !== null,
      lastActive: r.lastActive ? new Date(r.lastActive) : null,
      spend: spend.get(r.id) ?? 0,
    }));
}

/** This month's AI spend not tied to any team (should stay near zero). */
export async function unattributedSpend(database: Db = db): Promise<number> {
  const d = new Date();
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const rows = await database
    .select({
      model: aiUsage.model,
      input: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::bigint`,
      output: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::bigint`,
    })
    .from(aiUsage)
    .where(and(isNull(aiUsage.teamId), gte(aiUsage.createdAt, start)))
    .groupBy(aiUsage.model);
  return rows.reduce((a, r) => a + dollars(r.model, Number(r.input), Number(r.output)), 0);
}

export async function setAiAccess(teamId: string, access: "pending" | "on" | "off", database: Db = db) {
  await database.update(teams).set({ aiAccess: access }).where(eq(teams.id, teamId));
}

/** Monthly AI cap in dollars; null puts the team back on the default. */
export async function setAiCap(teamId: string, dollarsCap: number | null, database: Db = db) {
  await database.update(teams).set({ aiBudgetUsd: dollarsCap }).where(eq(teams.id, teamId));
}
