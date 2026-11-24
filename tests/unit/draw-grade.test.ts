/** "Draw your job" quiz answers: graded like a coach would, not to the inch. */
import { describe, expect, it } from "vitest";
import { gradeDrawing } from "@/domain/draw-grade";
import { emptyPlay, type PlayData, type Player, type Point } from "@/domain/play";
import { questionsFor } from "@/domain/quiz";
import { EMPTY_TERMS } from "@/domain/terms";

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
const route = (name: string, depth: number | "unknown" = "unknown"): Partial<Player> => ({ assignment_type: "route", route: { name, depth_yards: depth, break_direction: "unknown", notes: null, path: null } });
const play: PlayData = {
  ...emptyPlay("SPREAD RIGHT, 24 POWER"),
  play_type: "run",
  formation: { name: "SPREAD RIGHT", personnel: "unknown", strength: "right", backfield_alignment: "unknown" },
  players: [
    p("X", -14, 0, route("out", 10)),
    p("H", -7, -1, route("go")),
    p("LG", -1.3, 0, { assignment_type: "block", block: { type: "pull", target: null, path: [[0, 0], [0, -1], [4, -1], [4.5, 2]] } }),
    p("C", 0, 0, { assignment_type: "block", block: { type: "down", target: null, path: [[0, 0], [-1, 1.2]] } }),
    p("RG", 1.3, 0, { assignment_type: "block", block: { type: "down", target: null, path: [[0, 0], [-1, 1.2]] } }),
    p("Z", 14, 0, route("slant")),
    p("QB", 0, -5, { assignment_type: "fake", path: [[0, 0], [-2, 0.5]] }),
    p("F", 1.5, -5, { assignment_type: "carry", path: [[0, 0], [1.5, 5], [1.5, 11]] }),
  ],
};
/** A stroke from a spot through corners (absolute yards), with a little wobble. */
const line = (from: Point, ...corners: Point[]) => {
  const out: Point[] = [from];
  let at = from;
  for (const c of corners) {
    const n = Math.max(1, Math.round(Math.hypot(c[0] - at[0], c[1] - at[1]) / 0.5));
    for (let i = 1; i <= n; i++) out.push([at[0] + ((c[0] - at[0]) * i) / n + (i % 2 ? 0.1 : -0.1), at[1] + ((c[1] - at[1]) * i) / n]);
    at = c;
  }
  return out;
};
const arrow = { style: "solid", end: "arrow" } as const;
const t = { style: "solid", end: "t" } as const;
const dotted = { style: "dotted", end: "arrow" } as const;

describe("grading a drawn job", () => {
  it("routes: right route, right way, about the right depth", () => {
    expect(gradeDrawing(play, "X", { pts: line([-14, 0], [-14, 10], [-19, 10]), pen: arrow }).correct).toBe(true);
    expect(gradeDrawing(play, "X", { pts: line([-14, 0], [-14, 9], [-19, 9]), pen: arrow }).correct).toBe(true); // close enough
    const shallow = gradeDrawing(play, "X", { pts: line([-14, 0], [-14, 5], [-19, 5]), pen: arrow });
    expect(shallow).toEqual({ correct: false, note: "Your out was at 5; it's a 10-yard out." });
    expect(gradeDrawing(play, "X", { pts: line([-14, 0], [-14, 10], [-9, 10]), pen: arrow }).correct).toBe(false); // an in, not an out
    expect(gradeDrawing(play, "Z", { pts: line([14, 0], [14, 2], [10, 6]), pen: arrow }).correct).toBe(true);
    expect(gradeDrawing(play, "Z", { pts: line([14, 0], [14, 12], [8, 22]), pen: arrow }).note).toMatch(/You drew a .*post; you run a 2-yard slant/);
    expect(gradeDrawing(play, "H", { pts: line([-7, -1], [-7, 14]), pen: arrow }).correct).toBe(true); // a go: any depth
    expect(gradeDrawing(play, "Z", { pts: line([14, 0], [14, 2], [10, 6]), pen: t }).note).toMatch(/That's a block/);
  });

  it("blocks: the right kind, going the right way", () => {
    expect(gradeDrawing(play, "LG", { pts: line([-1.3, 0], [-1.3, -1], [2.7, -1], [3.2, 2]), pen: t }).correct).toBe(true);
    expect(gradeDrawing(play, "LG", { pts: line([-1.3, 0], [-0.3, 1.2]), pen: t }).note).toMatch(/You pull/);
    expect(gradeDrawing(play, "LG", { pts: line([-1.3, 0], [-1.3, -1], [-5.3, -1], [-5.8, 2]), pen: t }).note).toMatch(/wrong way/);
    expect(gradeDrawing(play, "RG", { pts: line([1.3, 0], [0.3, 1.2]), pen: t }).correct).toBe(true);
    expect(gradeDrawing(play, "RG", { pts: line([1.3, 0], [2.3, 1.2]), pen: t }).correct).toBe(false);
  });

  it("carries hit the right hole; fakes are dotted", () => {
    expect(gradeDrawing(play, "F", { pts: line([1.5, -5], [3, 0], [3, 6]), pen: arrow }).correct).toBe(true);
    const wrongHole = gradeDrawing(play, "F", { pts: line([1.5, -5], [-3, 0], [-3, 6]), pen: arrow });
    expect(wrongHole.correct).toBe(false);
    expect(wrongHole.note).toMatch(/3 yards to the left; it's 3 yards to the right/);
    expect(gradeDrawing(play, "QB", { pts: line([0, -5], [-2, -4.5]), pen: dotted }).correct).toBe(true);
    expect(gradeDrawing(play, "QB", { pts: line([0, -5], [-2, -4.5]), pen: arrow }).note).toMatch(/draw it dotted/);
  });

  it("a flipped picture is graded the right way round", () => {
    // X shows on the right when flipped; his out goes to the right sideline there
    expect(gradeDrawing(play, "X", { pts: line([14, 0], [14, 10], [19, 10]), pen: arrow }, { flip: true }).correct).toBe(true);
    expect(gradeDrawing(play, "X", { pts: line([14, 0], [14, 10], [9, 10]), pen: arrow }, { flip: true }).correct).toBe(false);
  });

  it("asks each position to draw its own line", () => {
    const ctx = { terms: EMPTY_TERMS, level: "high_school" as const, positions: ["F"], allowFlip: false };
    const qs = questionsFor("draw_job", { id: "p1", data: play, qbReady: true }, [], ctx, 1);
    expect(qs.map((q) => [q.kind, q.answer, q.diagram?.hide, q.prompt])).toEqual([["draw", "F", "player", "SPREAD RIGHT, 24 POWER: draw your job, F."]]);
    // the QB's fake isn't asked (the read questions cover it)
    expect(questionsFor("draw_job", { id: "p1", data: play, qbReady: true }, [], { ...ctx, positions: ["QB"] }, 1)).toEqual([]);
  });
});
