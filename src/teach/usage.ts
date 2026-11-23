/**
 * AI spending: every Claude call records its tokens against the team it was
 * for (set with `withAi` around the work). Behind the scenes only: coaches
 * never see it; it feeds how teams are charged. Recording never throws.
 *
 * The gate: before every call, `checkAi` makes sure the team's AI is turned on
 * (new teams wait for the Reps admin) and that it's under its monthly cap.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { teams } from "@/db/schema";
import { aiUsage } from "@/db/teach-schema";

/** Dollars per million tokens (Anthropic list prices; thinking counts as output). */
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
};
const DEFAULT_PRICE = PRICES["claude-opus-5-5"]!;

export const dollars = (model: string, input: number, output: number) => {
  const p = PRICES[model] ?? DEFAULT_PRICE;
  return (input * p.input + output * p.output) / 1_000_000;
};

const ctx = new AsyncLocalStorage<{ teamId: string; kind: string }>();

/** Run AI work on behalf of a team, so its calls are counted for that team. */
export function withAi<T>(teamId: string, kind: string, fn: () => Promise<T>): Promise<T> {
  return ctx.run({ teamId, kind }, fn);
}

/** A new team's AI stays off until the Reps admin turns it on. */
export const AI_NOT_ON = "Reps turns on playbook reading once your account is checked, usually within a day.";
/** The Reps admin turned this team's AI off. */
export const AI_OFF = "Playbook reading is turned off for this team. Contact Reps to turn it back on.";
/** The team hit its monthly AI cap; Reps stops until next month or the admin raises it. */
export const AI_LIMIT = "This team reached its monthly limit for Reps' playbook reading. It starts again next month.";
/** Monthly cap in dollars when the admin hasn't set one for the team. */
export const DEFAULT_CAP_USD = 100;

export class AiBlocked extends Error {}

/**
 * Throws AiBlocked unless AI may run right now for the team in context. Work
 * with no team in context only runs outside production (scripts, tests).
 */
export async function checkAi(database: Db = db): Promise<void> {
  const c = ctx.getStore();
  if (!c) {
    if (process.env.NODE_ENV === "production") throw new AiBlocked("AI work has to be tied to a team.");
    return;
  }
  const why = await aiBlockedReason(c.teamId, database);
  if (why) throw new AiBlocked(why);
}

/** Why AI can't run for this team right now, or null when it can. */
export async function aiBlockedReason(teamId: string, database: Db = db): Promise<string | null> {
  const [team] = await database.select({ access: teams.aiAccess, cap: teams.aiBudgetUsd }).from(teams).where(eq(teams.id, teamId));
  if (!team || team.access === "pending") return AI_NOT_ON;
  if (team.access !== "on") return AI_OFF;
  const spent = (await monthSpendByTeam([teamId], database)).get(teamId) ?? 0;
  return spent >= (team.cap ?? DEFAULT_CAP_USD) ? AI_LIMIT : null;
}

/** Called by the AI wrapper after each response. */
export async function recordUsage(model: string, usage: { input_tokens?: number | null; output_tokens?: number | null } | null | undefined, step: string) {
  try {
    const c = ctx.getStore();
    await db.insert(aiUsage).values({
      teamId: c?.teamId ?? null,
      kind: c?.kind ?? step,
      step,
      model,
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
    });
  } catch (err) {
    console.error("ai usage not recorded", err);
  }
}

const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

/** This month's spend for a team (UTC calendar month), overall and by step. */
export async function monthSpend(teamId: string, database: Db = db) {
  const rows = await database
    .select({
      step: aiUsage.step,
      model: aiUsage.model,
      calls: sql<number>`count(*)::int`,
      input: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::bigint`,
      output: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::bigint`,
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.teamId, teamId), gte(aiUsage.createdAt, monthStart())))
    .groupBy(aiUsage.step, aiUsage.model);
  const steps = rows.map((r) => ({ step: r.step, calls: r.calls, cost: dollars(r.model, Number(r.input), Number(r.output)) })).sort((a, b) => b.cost - a.cost);
  const [team] = await database.select({ budget: teams.aiBudgetUsd }).from(teams).where(eq(teams.id, teamId));
  const total = steps.reduce((a, s) => a + s.cost, 0);
  const budget = team?.budget ?? DEFAULT_CAP_USD;
  return { total, steps, budget, level: total >= budget ? "over" : total >= budget * 0.8 ? "near" : "ok" } as const;
}

/** This month's spend for several teams at once (admin page, the gate). */
export async function monthSpendByTeam(teamIds: string[], database: Db = db) {
  if (!teamIds.length) return new Map<string, number>();
  const rows = await database
    .select({
      teamId: aiUsage.teamId,
      model: aiUsage.model,
      input: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::bigint`,
      output: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::bigint`,
    })
    .from(aiUsage)
    .where(and(sql`${aiUsage.teamId} in (${sql.join(teamIds.map((id) => sql`${id}::uuid`), sql`, `)})`, gte(aiUsage.createdAt, monthStart())))
    .groupBy(aiUsage.teamId, aiUsage.model);
  const out = new Map<string, number>();
  for (const r of rows) if (r.teamId) out.set(r.teamId, (out.get(r.teamId) ?? 0) + dollars(r.model, Number(r.input), Number(r.output)));
  return out;
}

export const STEP_LABEL: Record<string, string> = {
  decode: "Reading pages",
  gaps: "Finding Reps' questions",
  triage: "Sorting questions",
  write: "Writing lessons and questions",
  core: "Choosing core questions",
  grade: "Grading own-words answers",
  ask: "Answering players' questions",
  drawing: "Turning drawings into plays",
  naming: "Drafting naming rules",
};
