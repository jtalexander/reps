/**
 * AI spending: every Claude call records its tokens against the team it was
 * for (set with `withAi` around the work). Behind the scenes only: coaches
 * never see it; it feeds how teams are charged. Recording never throws.
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
  const budget = team?.budget ?? null;
  return { total, steps, budget, level: budget ? (total >= budget ? "over" : total >= budget * 0.8 ? "near" : "ok") : "ok" } as const;
}

/** This month's spend for several teams at once (My teams). */
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
