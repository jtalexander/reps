/**
 * Weekly game plans: the opponent, what they show, our plays built for it
 * (from the "Good against" tags), plays picked from anywhere in the playbook
 * or drawn new, and one tap to send it to the players as this week's install.
 */
import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, type Db } from "@/db";
import { gamePlans, plays } from "@/db/schema";
import { LOOK_KEY, gamePlan } from "./matchups";
import { setInstallName, setPlaysInstall } from "@/teach/install-set";

export type GamePlan = typeof gamePlans.$inferSelect;

export async function listPlans(teamId: string, database: Db = db): Promise<GamePlan[]> {
  return database.select().from(gamePlans).where(eq(gamePlans.teamId, teamId)).orderBy(desc(gamePlans.createdAt));
}

export async function getPlan(teamId: string, id: string, database: Db = db): Promise<GamePlan | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [p] = await database.select().from(gamePlans).where(and(eq(gamePlans.teamId, teamId), eq(gamePlans.id, id)));
  return p ?? null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function createPlan(teamId: string, opponent: string, gameDate: string | null, database: Db = db): Promise<GamePlan> {
  const name = opponent.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) throw new Error("Who are you playing?");
  const [p] = await database
    .insert(gamePlans)
    .values({ teamId, opponent: name, gameDate: gameDate && DATE.test(gameDate) ? gameDate : null })
    .returning();
  return p!;
}

const Patch = z.object({
  opponent: z.string().trim().min(1).max(60).optional(),
  gameDate: z.string().regex(DATE).nullable().optional(),
  theyShow: z.array(z.string().regex(LOOK_KEY)).max(30).optional(),
  theyRun: z.array(z.string().regex(LOOK_KEY)).max(30).optional(),
  notes: z.string().max(4000).optional(),
  playIds: z.array(z.string().uuid()).max(150).optional(),
});

export async function updatePlan(teamId: string, id: string, patch: unknown, database: Db = db): Promise<GamePlan> {
  const p = Patch.parse(patch);
  if (p.playIds) {
    // only this team's plays
    const ok = p.playIds.length
      ? new Set((await database.select({ id: plays.id }).from(plays).where(and(eq(plays.teamId, teamId), inArray(plays.id, p.playIds)))).map((r) => r.id))
      : new Set<string>();
    p.playIds = [...new Set(p.playIds.filter((x) => ok.has(x)))];
  }
  const [row] = await database
    .update(gamePlans)
    .set({ ...p, updatedAt: new Date() })
    .where(and(eq(gamePlans.teamId, teamId), eq(gamePlans.id, id)))
    .returning();
  if (!row) throw new Error("That game plan is gone.");
  return row;
}

export async function addToPlan(teamId: string, id: string, playId: string, database: Db = db): Promise<GamePlan> {
  const plan = await getPlan(teamId, id, database);
  if (!plan) throw new Error("That game plan is gone.");
  return updatePlan(teamId, id, { playIds: [...plan.playIds, playId] }, database);
}

export async function deletePlan(teamId: string, id: string, database: Db = db) {
  await database.delete(gamePlans).where(and(eq(gamePlans.teamId, teamId), eq(gamePlans.id, id)));
}

/** Our plays and calls built for what this opponent shows, best fits first. */
export async function planSuggestions(teamId: string, plan: GamePlan, database: Db = db) {
  const [offense, defense] = await Promise.all([
    plan.theyShow.length ? gamePlan(teamId, "offense", plan.theyShow, database) : Promise.resolve([]),
    plan.theyRun.length ? gamePlan(teamId, "defense", plan.theyRun, database) : Promise.resolve([]),
  ]);
  return { offense, defense };
}

/** The plan's plays, in its order, with what the Plays view needs. */
export async function planPlays(teamId: string, plan: GamePlan, database: Db = db) {
  if (!plan.playIds.length) return [];
  const rows = await database
    .select({ id: plays.id, name: plays.name, data: plays.data, status: plays.status, side: plays.side })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), inArray(plays.id, plan.playIds), eq(plays.archived, false)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return plan.playIds
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r?.data))
    .map((r) => ({ id: r.id, name: r.data!.name && r.data!.name !== "unknown" ? r.data!.name : r.name, data: r.data!, approved: r.status === "approved", side: r.side }));
}

/** "Week of Nov 28: vs Eagles" */
export function installNameFor(plan: Pick<GamePlan, "opponent" | "gameDate">): string {
  if (!plan.gameDate) return `vs ${plan.opponent}`;
  const d = new Date(`${plan.gameDate}T12:00:00Z`);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}: vs ${plan.opponent}`;
}

/**
 * Send the plan to the players: it becomes this week's install (its name, and
 * exactly its plays picked one by one; install topics stay).
 */
export async function sendPlan(teamId: string, id: string, database: Db = db): Promise<{ plays: number; name: string }> {
  const plan = await getPlan(teamId, id, database);
  if (!plan) throw new Error("That game plan is gone.");
  if (!plan.playIds.length) throw new Error("Add some plays to the plan first.");
  const picked = await database.select({ id: plays.id }).from(plays).where(and(eq(plays.teamId, teamId), eq(plays.inInstall, true)));
  await setPlaysInstall(
    teamId,
    picked.map((r) => r.id).filter((x) => !plan.playIds.includes(x)),
    false,
    database,
  );
  const n = await setPlaysInstall(teamId, plan.playIds, true, database);
  const name = installNameFor(plan);
  await setInstallName(teamId, name, database);
  await database.update(gamePlans).set({ sentAt: new Date() }).where(eq(gamePlans.id, id));
  return { plays: typeof n === "number" ? n : plan.playIds.length, name };
}
