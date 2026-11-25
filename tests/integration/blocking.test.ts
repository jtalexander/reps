/**
 * Blocking schemes end to end: the coach changes a scheme's rule once and
 * every play blocked with it is redrawn; linemen are quizzed on who they block
 * against the fronts the coach checked.
 */
import { and, eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDb, type Db } from "@/db";
import { players, plays, teams, users } from "@/db/schema";
import { newBlocking, SCHEME_LIBRARY, applyBlocking } from "@/domain/blocking";
import { emptyPlay, type PlayData, type Player } from "@/domain/play";

let db: Db;
let pool: Pool;
let ownerId: string;

beforeAll(async () => {
  process.env.DATABASE_URL = inject("dbUrl");
  ({ db, pool } = createDb(inject("dbUrl")));
  const [u] = await db.insert(users).values({ name: "OL coach", email: `ol${Date.now()}@x.test` }).returning();
  ownerId = u!.id;
});
afterAll(async () => {
  await pool?.end();
});

const p = (id: string, x: number, y: number): Player => ({ id, position: id, x, y, on_ball: Math.abs(y) < 0.8, side: x < -1 ? "left" : x > 1 ? "right" : "middle", split: null, assignment_type: "unknown", route: null, block: null, path: null, notes: null });
const proI = [p("LT", -2.6, 0), p("LG", -1.3, 0), p("C", 0, 0), p("RG", 1.3, 0), p("RT", 2.6, 0), p("Y", 4, 0), p("X", -14, 0), p("Z", 12, -1), p("QB", 0, -1), p("F", 0, -4), p("RB", 0, -6.5)];

describe("blocking schemes for a team", () => {
  it("redraws every play when a scheme's rule changes, and quizzes linemen on checked fronts", { timeout: 60_000 }, async () => {
    const { createTeam } = await import("@/server/teams");
    const team = await createTeam(db, ownerId, "Linemen", "youth");
    const power = SCHEME_LIBRARY.find((s) => s.key === "power")!;
    const base: PlayData = { ...emptyPlay("PRO RIGHT, 26 POWER"), play_type: "run", players: proI, blocking: { ...newBlocking(power, "right"), checked: ["4-3"] } };
    const data = { ...base, players: applyBlocking(base, base.blocking!, "4-3") };
    const [row] = await db.insert(plays).values({ teamId: team.id, name: data.name, data, playType: "run", status: "approved", extraction: "done", qbReady: true }).returning();

    const b = await import("@/server/blocking");
    const before = await b.getBlocking(team.id, db);
    expect(before.schemes.find((s) => s.key === "power")!.rules.PSG).toBe("down");
    expect(before.fronts).toContain("4-3");

    // the coach doubles with the play-side guard on his team's Power
    const r = await b.saveScheme(team.id, { ...power, rules: { ...power.rules, PSG: "double" }, words: ["26", "27"] }, db);
    expect(r.plays).toBe(1);
    const [after] = await db.select().from(plays).where(eq(plays.id, row!.id));
    expect(after!.data!.blocking!.rules.PSG).toBe("double");
    expect(after!.data!.players.find((x) => x.id === "RG")!.block!.type).toBe("double");
    expect(after!.status).toBe("approved");
    expect((await b.getBlocking(team.id, db)).schemes.find((s) => s.key === "power")!.words).toEqual(["26", "27"]);
    await expect(b.saveScheme(team.id, { ...power, rules: { PST: "tackle the QB" } }, db)).rejects.toThrow();

    // back to Reps' rules
    await b.resetScheme(team.id, "power", db);
    const [reset] = await db.select().from(plays).where(eq(plays.id, row!.id));
    expect(reset!.data!.blocking!.rules.PSG).toBe("down");

    // fronts the team sees
    expect(await b.saveFronts(team.id, ["5-3", "6-2", "nonsense"], db)).toEqual(["5-3", "6-2"]);
    await expect(b.saveFronts(team.id, [], db)).rejects.toThrow();

    // the right tackle is quizzed on who he blocks against the 4-3 (the one front checked)
    const { startSession } = await import("@/server/quiz");
    const [rt] = await db.insert(players).values({ teamId: team.id, name: "Big Mike", positions: ["RT"] }).returning();
    const [fresh] = await db.select().from(teams).where(eq(teams.id, team.id));
    const { questions } = await startSession({ team: fresh!, playerId: rt!.id, position: "RT", mode: "mixed", count: 10 }, db);
    const q = questions.find((x) => x.type === "block_vs");
    expect(q?.prompt).toBe("PRO RIGHT, 26 POWER against a 4-3: who do you block?");
    expect(q?.diagram?.front).toBe("4-3");
    // the diagram he answers from keeps the blocking (the field draws the front), with his own block hidden
    const { diagramData } = await import("@/server/quiz");
    const shown = diagramData(reset!.data!, q!);
    expect(shown?.blocking?.scheme).toBe("power");
    expect(shown?.players.find((x) => x.id === "RT")!.block).toBeNull();
    expect((await db.select({ id: plays.id }).from(plays).where(and(eq(plays.teamId, team.id)))).length).toBe(1);
  });
});
