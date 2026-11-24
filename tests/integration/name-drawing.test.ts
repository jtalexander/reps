/**
 * A play drawn by hand in the play builder gets its name from the team's own
 * words: the formation from where the players stand, the motion word, and
 * the play word from a playbook play drawn the same way or a known concept.
 */
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDb, type Db } from "@/db";
import { plays, teams, users } from "@/db/schema";
import type { Naming } from "@/domain/naming";
import { emptyPlay, flipPlay, type PlayData, type Player, type Point } from "@/domain/play";
import { applyStroke, type Pen } from "@/domain/sketch";

let db: Db;
let pool: Pool;
let ownerId: string;

beforeAll(async () => {
  process.env.DATABASE_URL = inject("dbUrl");
  ({ db, pool } = createDb(inject("dbUrl")));
  const [u] = await db.insert(users).values({ name: "Head", email: `draw${Date.now()}@x.test` }).returning();
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
const play = (name: string, players: Player[], more: Partial<PlayData> = {}): PlayData => ({ ...emptyPlay(name), players, ...more });
const withJobs = (jobs: Record<string, Partial<Player>>) => spread().map((x) => ({ ...x, ...jobs[x.id] }));

const naming: Naming = {
  positions: [],
  direction: { words: [], rule: "" },
  call_order: ["Formation", "Formation tag", "Motion", "Play", "Direction"],
  formations: [{ word: "SPREAD", means: "2x2", pages: [] }],
  formation_tags: [{ word: "ZOOT", means: "F to the strong side", pages: [] }],
  backfields: [],
  motions: [{ word: "JET", means: "fast motion across the formation at the snap", pages: [] }],
  plays: [
    { word: "SMASH", means: "hitch and corner", pages: [] },
    { word: "24 POWER", means: "power run, guard pulls", pages: [] },
  ],
  other: [],
};

/** Strokes from the player's spot: [id, pen, corners...] */
const draw = (start: PlayData, strokes: Array<[string, Pen, ...Point[]]>) =>
  strokes.reduce((d, [id, pen, ...pts]) => {
    const who = d.players.find((x) => x.id === id)!;
    const from: Point = d.motion?.player === id && d.motion.end && pen.style !== "squiggly" ? d.motion.end : [who.x, who.y];
    return applyStroke(d, id, [from, ...pts.map(([x, y]) => [from[0] + x, from[1] + y] as Point)], pen).data;
  }, start);
const solid: Pen = { style: "solid", end: "arrow" };
const t: Pen = { style: "solid", end: "t" };

describe("naming a hand-drawn play", () => {
  it("uses the team's formation, motion and play words", async () => {
    const { createTeam } = await import("@/server/teams");
    const team = await createTeam(db, ownerId, "Drawers", "youth");
    await db.update(teams).set({ naming }).where(eq(teams.id, team.id));
    const smash = play("SPREAD RIGHT ZOOT, SMASH", withJobs({ X: route("hitch"), H: route("corner"), Y: route("corner"), Z: route("hitch") }), { play_type: "pass" });
    const power = play(
      "SPREAD RIGHT, 24 POWER RIGHT",
      withJobs({ LT: block("down", [[0, 0], [1, 1.2]]), LG: block("pull", [[0, 0], [0, -1], [4, -1], [4.5, 2]]), C: block("down", [[0, 0], [-1, 1.2]]), RG: block("down", [[0, 0], [-1, 1.2]]), RT: block("down", [[0, 0], [-1, 1.2]]), F: { assignment_type: "carry", path: [[0, 0], [1, 5], [1, 11]] } }).map((x) => (x.id === "F" ? { ...x, x: -1.5 } : x)),
      { play_type: "run" },
    );
    const jet = play("SPREAD RIGHT, H JET SWEEP", withJobs({}), { motion: { player: "H", type: "jet", direction: "right", timing: "unknown", end: [1, -1] } });
    await db.insert(plays).values([smash, power, jet].map((data) => ({ teamId: team.id, name: data.name, playType: "pass" as const, data, status: "approved" as const, extraction: "done" as const })));
    const { nameDrawnPlay } = await import("@/teach/name-drawing");

    // smash drawn the other way round: same formation (flipped), and it's the playbook's SMASH
    const left = flipPlay(play("unknown", spread()));
    let drawn = draw(left, [
      ["X", solid, [0, 6], [0.6, 5]],
      ["Z", solid, [0, 6], [-0.6, 5]],
      ["H", solid, [0, 10], [-6, 18]],
      ["Y", solid, [0, 10], [6, 18]],
    ]);
    let g = await nameDrawnPlay(team.id, drawn, db);
    expect(g.parts).toMatchObject({ formation: "SPREAD", dir: "LEFT", tag: "ZOOT", play: "SMASH" });
    expect(g.same?.name).toBe("SPREAD RIGHT ZOOT, SMASH");

    // a concept the playbook doesn't have: Reps says what it is and calls it that
    drawn = draw(play("unknown", spread()), [
      ["Z", solid, [0, 3], [-4, 7]],
      ["Y", solid, [2, 1], [7, 2]],
    ]);
    g = await nameDrawnPlay(team.id, drawn, db);
    expect(g.parts.play).toBe("SLANT-FLAT");
    expect(g.same).toBeNull();
    expect(g.notes.join(" ")).toMatch(/naming rules don't have a word/);

    // power the other way: the right guard pulls, F carries left
    drawn = draw(play("unknown", spread().map((x) => (x.id === "F" ? { ...x, x: 1.5 } : x))), [
      ["RG", t, [0, -1], [-4, -1], [-4.5, 2]],
      ["LG", t, [1, 1.2]],
      ["C", t, [1, 1.2]],
      ["LT", t, [1, 1.2]],
      ["RT", t, [-1, 1.2]],
      ["F", solid, [-3.5, 5], [-3.5, 11]],
    ]);
    g = await nameDrawnPlay(team.id, drawn, db);
    expect(g.parts).toMatchObject({ play: "24 POWER", playDir: "LEFT" });

    // a squiggly line from H across the formation: JET motion
    drawn = draw(play("unknown", spread()), [["H", { style: "squiggly", end: "none" }, [4, 0.2], [8, 0]]]);
    g = await nameDrawnPlay(team.id, drawn, db);
    expect(g.parts).toMatchObject({ motion: "JET", motionPlayer: "H" });
  });
});
