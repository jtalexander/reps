/** Breakdown milestone 0: the field standard, formation rules on anonymous players, and hand-marked frames. */
import { describe, expect, it } from "vitest";
import { score, sensitivity, readPlayers } from "@/breakdown/marking/evaluate";
import { MarkedFrameSchema, solveFrame, type Landmark } from "@/breakdown/marking/types";
import { readFormation } from "@/breakdown/rules/formation";
import { lineupDistance, matchFormation } from "@/breakdown/rules/match";
import { applyHomography, fromPlayFrame, lateralYards, NFHS_11, solveHomography, spotOf, toPlayFrame, type Homography, type LateralRef, type PlayPoint } from "@/shared/field";

const P = (x: number, y: number): PlayPoint => ({ x, y });
const LINE = [P(-2.6, -0.4), P(-1.3, -0.4), P(0, -0.3), P(1.3, -0.4), P(2.6, -0.4)];

const gunDoubles = [...LINE, P(-18, -0.3), P(-8, -1.8), P(8, -1.8), P(18, -0.3), P(0, -5), P(1.6, -5)];
const proIRight = [...LINE, P(3.9, -0.4), P(12, -1.8), P(-16, -0.3), P(0, -1.1), P(0, -4.2), P(0, -7)];
const tripsRight = [...LINE, P(-17, -0.3), P(6, -1.8), P(11, -1.8), P(18, -0.3), P(0, -5), P(-1.6, -5)];
const pistolWing = [...LINE, P(3.9, -0.4), P(5.2, -1.6), P(-16, -0.3), P(15, -1.8), P(0, -4), P(0, -7)];
const empty = [...LINE, P(-18, -0.3), P(-10, -1.8), P(6, -1.8), P(11, -1.8), P(18, -0.3), P(0, -5)];

describe("field standard", () => {
  it("NFHS hashes split the field in thirds", () => {
    expect(NFHS_11.width_yd).toBeCloseTo(53.333, 2);
    expect(lateralYards(NFHS_11, "near_hash")).toBeCloseTo(NFHS_11.width_yd / 3, 6);
    expect(lateralYards(NFHS_11, "far_hash")).toBeCloseTo((NFHS_11.width_yd * 2) / 3, 6);
  });

  it("play frame: x is the offense's right, y is downfield, whichever way they're going", () => {
    const ball = { along: 40, across: 20 };
    // going right in the picture: downfield is more yards along, their right hand is toward the camera
    expect(toPlayFrame({ along: 45, across: 15 }, ball, "right")).toEqual({ x: 5, y: 5 });
    // going left: downfield is fewer yards along, their right hand is away from the camera
    expect(toPlayFrame({ along: 35, across: 25 }, ball, "left")).toEqual({ x: 5, y: 5 });
    for (const dir of ["left", "right"] as const) {
      const back = toPlayFrame(fromPlayFrame({ x: -7, y: -3 }, ball, dir), ball, dir);
      expect(back.x).toBeCloseTo(-7);
      expect(back.y).toBeCloseTo(-3);
    }
  });

  it("the spot from the offense's side: yard line and hash", () => {
    const farHash = lateralYards(NFHS_11, "far_hash")!;
    // going right, the far sideline is on their left
    expect(spotOf({ along: 35, across: farHash }, "right", NFHS_11)).toMatchObject({ hash: "left", yard_line: "own 35" });
    expect(spotOf({ along: 35, across: farHash }, "left", NFHS_11)).toMatchObject({ hash: "right", yard_line: "opp 35" });
    expect(spotOf({ along: 50, across: NFHS_11.width_yd / 2 }, "left", NFHS_11)).toMatchObject({ hash: "middle", yard_line: "50" });
  });
});

/** A pretend sideline camera: field yards (along, across) to pixels, with real perspective. */
const CAMERA: Homography = [38, -14, 300, 1.5, -9, 900, 0.0004, -0.012, 1];
const shoot = (along: number, across: number) => applyHomography(CAMERA, [along, across]);

describe("picture to field", () => {
  const spots: Array<[number, LateralRef]> = [
    [30, "near_hash"],
    [30, "far_hash"],
    [45, "near_hash"],
    [45, "far_hash"],
    [40, "near_sideline"],
  ];

  it("recovers field positions from four or more known spots", () => {
    const pairs = spots.map(([along, ref]) => ({ from: shoot(along, lateralYards(NFHS_11, ref)!), to: [along, lateralYards(NFHS_11, ref)!] as const }));
    const h = solveHomography(pairs)!;
    expect(h).not.toBeNull();
    const [along, across] = applyHomography(h, shoot(37.5, 22));
    expect(along).toBeCloseTo(37.5, 4);
    expect(across).toBeCloseTo(22, 4);
  });

  it("refuses spots that can't fix the picture", () => {
    expect(solveHomography(spots.slice(0, 3).map(([a, r]) => ({ from: shoot(a, lateralYards(NFHS_11, r)!), to: [a, lateralYards(NFHS_11, r)!] })))).toBeNull();
    const oneLine = (["near_sideline", "near_hash", "far_hash", "far_sideline"] as const).map((r) => ({ from: shoot(30, lateralYards(NFHS_11, r)!), to: [30, lateralYards(NFHS_11, r)!] as const }));
    expect(solveHomography(oneLine)).toBeNull();
  });

  it("a marked frame comes out in play-frame yards and reads as the formation that was lined up", () => {
    for (const direction of ["left", "right"] as const) {
      const ball = { along: 38, across: lateralYards(NFHS_11, "near_hash")! };
      const click = (p: PlayPoint): [number, number] => {
        const f = fromPlayFrame(p, ball, direction);
        return shoot(f.along, f.across);
      };
      const landmarks: Landmark[] = spots.map(([along, ref]) => ({ px: shoot(along, lateralYards(NFHS_11, ref)!), along, ref }));
      const frame = MarkedFrameSchema.parse({ id: "f1", width: 1920, height: 1080, landmarks, direction, ball: click(P(0, 0)), offense: tripsRight.map(click) });
      const solved = solveFrame(frame, NFHS_11);
      if (!solved.ok) throw new Error(solved.reason);
      expect(solved.fitError).toBeLessThan(0.01);
      solved.offense.forEach((p, i) => {
        expect(p.x).toBeCloseTo(tripsRight[i]!.x, 1);
        expect(p.y).toBeCloseTo(tripsRight[i]!.y, 1);
      });
      expect(readFormation(solved.offense)).toMatchObject({ shape: "3x1", strength: "right" });
      expect(solved.spot.hash).toBe(direction === "right" ? "right" : "left");
    }
  });

  it("says what's missing instead of guessing", () => {
    const frame = MarkedFrameSchema.parse({ id: "f1", width: 1920, height: 1080 });
    expect(solveFrame(frame, NFHS_11)).toMatchObject({ ok: false });
  });
});

describe("formation rules", () => {
  it("gun doubles: 2x2, balanced, one back beside the quarterback, 10 personnel", () => {
    const r = readFormation(gunDoubles);
    expect(r).toMatchObject({ shape: "2x2", strength: "balanced", qb: "gun", backs: "right", personnel: "10" });
    expect(r.notes).toEqual([]);
    expect(r.confidence.shape).toBeGreaterThan(0.9);
  });

  it("pro I right: tight end side is strong, under center, two backs stacked, 21 personnel", () => {
    expect(readFormation(proIRight)).toMatchObject({ shape: "2x1", strength: "right", qb: "under_center", backs: "i", personnel: "21", receivers: { left: 1, right: 2 } });
  });

  it("trips right: 3x1 to the right, back left", () => {
    expect(readFormation(tripsRight)).toMatchObject({ shape: "3x1", strength: "right", qb: "gun", backs: "left", personnel: "10" });
  });

  it("pistol with a wing: the back behind the quarterback makes it pistol, the wing counts as a tight end", () => {
    const r = readFormation(pistolWing);
    expect(r).toMatchObject({ qb: "pistol", backs: "behind", personnel: "12", strength: "right" });
    expect(r.players.filter((p) => p.role === "wing")).toHaveLength(1);
  });

  it("empty: five out, nobody in the backfield", () => {
    expect(readFormation(empty)).toMatchObject({ shape: "3x2", backs: "empty", qb: "gun", personnel: "00" });
  });

  it("mirrors cleanly", () => {
    const mirrored = readFormation(tripsRight.map((p) => P(-p.x, p.y)));
    expect(mirrored).toMatchObject({ shape: "3x1", strength: "left", backs: "right" });
  });

  it("a close call lowers the confidence and a miscount is noted", () => {
    // the back drifts to the edge of the box: is he a back or a slot?
    const drifting = gunDoubles.map((p, i) => (i === 10 ? P(3.5, -5) : p));
    expect(readFormation(drifting).confidence.shape).toBeLessThan(0.3);
    const ten = readFormation(gunDoubles.slice(0, 10));
    expect(ten.notes.join(" ")).toMatch(/10 offensive players/);
    expect(ten.personnel).toBeNull();
  });
});

describe("the team's name for it", () => {
  const saved = [
    { name: "Doubles", players: gunDoubles.map((p, i) => ({ id: i < 5 ? ["LT", "LG", "C", "RG", "RT"][i]! : `S${i}`, x: p.x, y: p.y })) },
    { name: "Trips Right", players: tripsRight.map((p, i) => ({ id: i < 5 ? ["LT", "LG", "C", "RG", "RT"][i]! : `S${i}`, x: p.x, y: p.y })) },
  ];

  it("picks the saved formation the players are standing in, even a little off", () => {
    const nudged = tripsRight.map((p, i) => P(p.x + (i % 2 ? 0.6 : -0.6), p.y + 0.3));
    const m = matchFormation(readFormation(nudged).players, saved)!;
    expect(m.name).toBe("Trips Right");
    expect(m.cost).toBeLessThan(1);
    expect(m.confidence).toBeGreaterThan(0.8);
  });

  it("an unfamiliar lineup still gets the nearest name, with low confidence", () => {
    const m = matchFormation(readFormation(proIRight).players, saved)!;
    expect(m.cost).toBeGreaterThan(3);
    expect(m.confidence).toBeLessThan(0.4);
  });

  it("no saved formations, no name", () => {
    expect(matchFormation(readFormation(gunDoubles).players, [])).toBeNull();
    expect(lineupDistance([], [P(0, 0)])).toBe(Infinity);
  });

  it("scores each field on its own and counts blanks as unverified", () => {
    const ball = { along: 38, across: 26 };
    const landmarks: Landmark[] = (
      [
        [30, "near_hash"],
        [30, "far_hash"],
        [45, "near_hash"],
        [45, "far_hash"],
      ] as Array<[number, LateralRef]>
    ).map(([along, ref]) => ({ px: shoot(along, lateralYards(NFHS_11, ref)!), along, ref }));
    const frame = (id: string, lineup: PlayPoint[], expected: object) =>
      MarkedFrameSchema.parse({
        id,
        label: id,
        width: 1920,
        height: 1080,
        landmarks,
        ball: shoot(ball.along, ball.across),
        offense: lineup.map((p) => {
          const f = fromPlayFrame(p, ball, "right");
          return shoot(f.along, f.across);
        }),
        expected,
      });
    const report = score(
      [frame("one", tripsRight, { formation: "trips  right", shape: "3x1", strength: "right" }), frame("two", gunDoubles, { formation: "Doubles", shape: "3x1" }), frame("three", gunDoubles, {})],
      NFHS_11,
      saved,
    );
    const by = Object.fromEntries(report.fields.map((f) => [f.field, f]));
    expect(by.formation).toMatchObject({ right: 2, wrong: 0, unverified: 1 });
    expect(by.shape).toMatchObject({ right: 1, wrong: 1, unverified: 1 });
    expect(by.shape!.misses[0]).toMatchObject({ frame: "two", got: "2x2", expected: "3x1" });
    expect(by.strength).toMatchObject({ right: 1, wrong: 0, unverified: 2 });
  });

  it("noise: clean positions always agree, sloppy ones agree less", () => {
    const [clean, rough] = sensitivity([gunDoubles, tripsRight, proIRight], saved, [{ sigmaX: 0, sigmaY: 0 }, { sigmaX: 2, sigmaY: 1 }], 50, 7);
    expect(clean!.held.shape).toBe(1);
    expect(clean!.held.backs).toBe(1);
    expect(rough!.held.backs).toBeLessThan(1);
    expect(readPlayers(gunDoubles, saved).match?.name).toBe("Doubles");
  });
});
