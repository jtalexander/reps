/**
 * Weekly installs, play by play: the coach finds plays by formation, motion
 * and concept (in the team's words, and by what the drawing shows), picks
 * them one by one, names the install, and players get those plays first.
 */
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDb, type Db } from "@/db";
import { players, plays, teams, users } from "@/db/schema";
import type { Naming } from "@/domain/naming";
import { emptyPlay, type PlayData, type Player, type Point } from "@/domain/play";
import { buildQuiz } from "@/domain/srs";
import { EMPTY_TERMS } from "@/domain/terms";

let db: Db;
let pool: Pool;
let ownerId: string;

beforeAll(async () => {
  process.env.DATABASE_URL = inject("dbUrl");
  ({ db, pool } = createDb(inject("dbUrl")));
  const [u] = await db.insert(users).values({ name: "Head", email: `install${Date.now()}@x.test` }).returning();
  ownerId = u!.id;
});
afterAll(async () => {
  await pool?.end();
});

const p = (id: string, x: number, y: number, job: Partial<Player> = {}): Player => ({
  id,
  position: id,
  x,
  y,
  on_ball: y > -0.75,
  side: x < -1 ? "left" : x > 1 ? "right" : "middle",
  split: null,
  assignment_type: "unknown",
  route: null,
  block: null,
  path: null,
  notes: null,
  ...job,
});
const route = (name: string): Partial<Player> => ({ assignment_type: "route", route: { name, depth_yards: "unknown", break_direction: "unknown", notes: null, path: null } });
const block = (type: string, path: Point[]): Partial<Player> => ({ assignment_type: "block", block: { type, target: null, path } });
const spread = () => [p("X", -14, 0), p("H", -7, -1), p("LT", -2.6, 0), p("LG", -1.3, 0), p("C", 0, 0), p("RG", 1.3, 0), p("RT", 2.6, 0), p("Y", 7, -1), p("Z", 14, 0), p("QB", 0, -5), p("F", 1.5, -5)];
const withJobs = (jobs: Record<string, Partial<Player>>) => spread().map((x) => ({ ...x, ...jobs[x.id] }));
const play = (name: string, players: Player[], more: Partial<PlayData> = {}): PlayData => ({ ...emptyPlay(name), players, ...more });

const naming: Naming = {
  positions: [],
  direction: { words: [], rule: "" },
  call_order: ["Formation", "Formation tag", "Motion", "Play", "Direction"],
  formations: [
    { word: "SPREAD", means: "2x2", pages: [] },
    { word: "TRIPS", means: "3x1", pages: [] },
  ],
  formation_tags: [{ word: "ZOOT", means: "F to the strong side", pages: [] }],
  backfields: [],
  motions: [{ word: "JET", means: "fast motion across the formation at the snap", pages: [] }],
  plays: [
    { word: "DIVIDE", means: "our smash: hitch and corner", pages: [] },
    { word: "24 POWER", means: "power run, guard pulls", pages: [] },
  ],
  other: [],
  fronts: [],
  coverages: [],
  stunts: [],
  blitzes: [],
};

describe("weekly installs, play by play", () => {
  it("tags plays for the filters, picks them, names the install, and quizzes this week's plays", async () => {
    const { createTeam } = await import("@/server/teams");
    const inst = await import("@/teach/install");
    const svc = await import("@/teach/service");
    const { startSession } = await import("@/server/quiz");
    const team = await createTeam(db, ownerId, "Installers", "youth");
    await db.update(teams).set({ naming }).where(eq(teams.id, team.id));

    const smashJobs = { X: route("hitch"), H: route("corner"), Y: route("corner"), Z: route("hitch") };
    const jet = { player: "Z", type: "jet" as const, direction: "left" as const, timing: "at_snap" as const, end: [2, -1] as Point };
    const datas: PlayData[] = [
      // the team's word for smash, with jet motion
      play("SPREAD RIGHT ZOOT JET, DIVIDE", withJobs(smashJobs), { play_type: "pass", motion: jet }),
      // no concept word in the name: Reps sees smash in the routes
      play("TRIPS LEFT, 52", withJobs(smashJobs), { play_type: "pass" }),
      // a run: the guard pulls and the F carries
      play(
        "SPREAD RIGHT, 24 POWER",
        withJobs({ LG: block("pull", [[0, 0], [0, -1], [4, -1], [4.5, 2]]), C: block("down", [[0, 0], [-1, 1.2]]), F: { assignment_type: "carry", path: [[0, 0], [1.5, 5], [1.5, 11]] } }),
        { play_type: "run" },
      ),
    ];
    const ids: string[] = [];
    for (const data of datas) {
      const [r] = await db.insert(plays).values({ teamId: team.id, name: data.name, playType: data.play_type, data, status: "approved", extraction: "done", qbReady: true }).returning();
      ids.push(r!.id);
    }

    const all = await inst.installPlays(team.id, db);
    const tags = Object.fromEntries(all.map((x) => [x.name, x.tags]));
    expect(tags["SPREAD RIGHT ZOOT JET, DIVIDE"]).toMatchObject({ formation: "SPREAD", motion: "JET", concept: "smash", conceptLabel: "DIVIDE (Smash)", type: "pass" });
    expect(tags["TRIPS LEFT, 52"]).toMatchObject({ formation: "TRIPS", motion: null, concept: "smash", type: "pass" });
    expect(tags["SPREAD RIGHT, 24 POWER"]).toMatchObject({ formation: "SPREAD", motion: null, concept: "power", type: "run" });

    // pick two plays one by one; nothing else is in
    expect(await inst.setPlaysInstall(team.id, [ids[1]!, ids[2]!], true, db)).toBe(2);
    expect([...(await inst.installPlayIds(team.id, db))].sort()).toEqual([ids[1], ids[2]].sort());
    // another team's play can't be added
    const other = await createTeam(db, ownerId, "Others", "youth");
    expect(await inst.setPlaysInstall(other.id, [ids[0]!], true, db)).toBe(0);

    // name it
    expect(await inst.setInstallName(team.id, "  Week 7:   Eagles ", db)).toBe("Week 7: Eagles");

    // "Quiz me on this week's plays": only the picked plays
    const [kid] = await db.insert(players).values({ teamId: team.id, name: "Kid", positions: ["Z"] }).returning();
    const [fresh] = await db.select().from(teams).where(eq(teams.id, team.id));
    const { questions } = await startSession({ team: fresh!, playerId: kid!.id, position: "Z", mode: "mixed", install: true, count: 8 }, db);
    expect(questions.length).toBeGreaterThan(0);
    expect(new Set(questions.map((q) => q.playId)).has(ids[0]!)).toBe(false);

    // a new install clears the picks and the name
    await svc.clearInstall(team.id, db);
    expect((await inst.installPlayIds(team.id, db)).size).toBe(0);
    const [after] = await db.select({ name: teams.installName }).from(teams).where(eq(teams.id, team.id));
    expect(after!.name).toBeNull();
  });

  it("new plays in the install come before other new plays", () => {
    const smash = play("A", withJobs({ X: route("hitch"), H: route("corner") }), { play_type: "pass" });
    const qPlays = ["p1", "p2", "p3", "p4"].map((id) => ({ id, data: { ...smash, name: id }, qbReady: true }));
    const ctx = { terms: EMPTY_TERMS, level: "youth" as const, positions: ["X"], allowFlip: false };
    for (const seed of [1, 2, 3]) {
      const qs = buildQuiz({ plays: qPlays, ctx, state: [], now: new Date(), count: 2, mode: "mixed", focus: ["p3"], seed });
      expect(qs[0]!.playId).toBe("p3");
    }
  });
});
