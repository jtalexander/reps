/**
 * A weekly game plan: what the opponent shows, our plays built for it, and
 * sending the plan to the players as the week's install.
 */
import { and, eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDb, type Db } from "@/db";
import { plays, teams, users } from "@/db/schema";
import { emptyPlay } from "@/domain/play";

let db: Db;
let pool: Pool;
let ownerId: string;

beforeAll(async () => {
  process.env.DATABASE_URL = inject("dbUrl");
  ({ db, pool } = createDb(inject("dbUrl")));
  const [u] = await db.insert(users).values({ name: "HC", email: `hc${Date.now()}@x.test` }).returning();
  ownerId = u!.id;
});
afterAll(async () => {
  await pool?.end();
});

describe("game plans", () => {
  it("finds plays built for the opponent and sends the plan as the install", { timeout: 60_000 }, async () => {
    const { createTeam } = await import("@/server/teams");
    const team = await createTeam(db, ownerId, "Planners", "youth");
    const other = await createTeam(db, ownerId, "Someone else", "youth");
    const play = (name: string, side: "offense" | "defense", goodVs: string[], inInstall = false) => ({
      teamId: team.id,
      name,
      data: { ...emptyPlay(name), ...(side === "defense" ? { side } : {}) },
      side,
      playType: side === "defense" ? "unknown" : "pass",
      status: "approved" as const,
      extraction: "done" as const,
      goodVs: { yes: goodVs, no: [] },
      inInstall,
    });
    const [smash, mesh, cover3, old] = await db
      .insert(plays)
      .values([play("SPREAD RIGHT, SMASH", "offense", ["cover_2", "zone"]), play("SPREAD RIGHT, MESH", "offense", ["man", "blitz"]), play("4-3, COVER 3", "defense", ["run"]), play("OLD INSTALL PLAY", "offense", [], true)])
      .returning();
    const [theirs] = await db.insert(plays).values({ ...play("NOT OURS", "offense", ["cover_2"]), teamId: other.id }).returning();

    const g = await import("@/server/game-plans");
    await expect(g.createPlan(team.id, "  ", null, db)).rejects.toThrow();
    const plan = await g.createPlan(team.id, "Eagles", "2026-11-27", db);
    expect(g.installNameFor(plan)).toBe("Nov 27: vs Eagles");

    // they play Cover 2 and run the ball
    let p = await g.updatePlan(team.id, plan.id, { theyShow: ["cover_2", "x:Cover 6"], theyRun: ["run"] }, db);
    const s = await g.planSuggestions(team.id, p, db);
    expect(s.offense.map((r) => r.name)).toEqual(["SPREAD RIGHT, SMASH"]);
    expect(s.defense.map((r) => r.name)).toEqual(["4-3, COVER 3"]);
    await expect(g.updatePlan(team.id, plan.id, { theyShow: ["drop table"] }, db)).rejects.toThrow();

    // picked plays: another team's play is dropped
    p = await g.updatePlan(team.id, plan.id, { playIds: [smash!.id, cover3!.id, theirs!.id] }, db);
    expect(p.playIds).toEqual([smash!.id, cover3!.id]);
    p = await g.addToPlan(team.id, plan.id, mesh!.id, db);
    expect((await g.planPlays(team.id, p, db)).map((x) => x.name)).toEqual(["SPREAD RIGHT, SMASH", "4-3, COVER 3", "SPREAD RIGHT, MESH"]);

    // sent: exactly the plan's plays are this week's install, under the plan's name
    expect(await g.sendPlan(team.id, plan.id, db)).toEqual({ plays: 3, name: "Nov 27: vs Eagles" });
    const picked = await db.select({ name: plays.name }).from(plays).where(and(eq(plays.teamId, team.id), eq(plays.inInstall, true)));
    expect(picked.map((r) => r.name).sort()).toEqual(["4-3, COVER 3", "SPREAD RIGHT, MESH", "SPREAD RIGHT, SMASH"]);
    expect(old).toBeTruthy();
    const [t] = await db.select({ name: teams.installName }).from(teams).where(eq(teams.id, team.id));
    expect(t!.name).toBe("Nov 27: vs Eagles");
    expect((await g.getPlan(team.id, plan.id, db))!.sentAt).not.toBeNull();
    // another team can't see it
    expect(await g.getPlan(other.id, plan.id, db)).toBeNull();
    await g.deletePlan(team.id, plan.id, db);
    expect(await g.listPlans(team.id, db)).toEqual([]);
  });
});
