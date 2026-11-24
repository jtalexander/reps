/** Lines a coach draws by hand: which route, block, carry or motion Reps reads from them. */
import { describe, expect, it } from "vitest";
import { emptyPlay, type Player, type Point } from "@/domain/play";
import { applyStroke, matchRoute, simplify } from "@/domain/sketch";

const p = (id: string, x: number, y: number): Player => ({
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
});
const lineup = [p("X", -14, 0), p("H", -7, -1), p("LT", -2.6, 0), p("LG", -1.3, 0), p("C", 0, 0), p("RG", 1.3, 0), p("RT", 2.6, 0), p("Y", 7, -1), p("Z", 14, 0), p("QB", 0, -5), p("F", 1.5, -5)];
const play = () => ({ ...emptyPlay(), players: lineup.map((x) => ({ ...x })) });
/** A shaky hand: points every half yard along the corners, nudged a little. */
const hand = (from: Point, ...corners: Point[]): Point[] => {
  const out: Point[] = [from];
  let at = from;
  let k = 0;
  for (const c of corners) {
    const len = Math.hypot(c[0] - at[0], c[1] - at[1]);
    const n = Math.max(1, Math.round(len / 0.5));
    for (let i = 1; i <= n; i++) {
      const wob = i === n ? 0 : ((k++ % 3) - 1) * 0.12;
      out.push([at[0] + ((c[0] - at[0]) * i) / n + wob, at[1] + ((c[1] - at[1]) * i) / n - wob]);
    }
    at = c;
  }
  return out;
};
const job = (d: ReturnType<typeof play>, id: string) => d.players.find((x) => x.id === id)!;

describe("reading a hand-drawn play", () => {
  it("smooths a shaky line down to its corners", () => {
    const pts = simplify(hand([0, 0], [0, 10], [5, 10]), 0.35);
    expect(pts.length).toBe(3);
    expect(pts[1]![1]).toBeCloseTo(10, 0);
  });

  it("names routes from the route tree, at the depth drawn, for either side of the field", () => {
    const z = lineup.find((x) => x.id === "Z")!;
    const x = lineup.find((q) => q.id === "X")!;
    expect(matchRoute([[0, 0], [0, 3], [-4, 7]], z)?.key).toBe("slant");
    expect(matchRoute([[0, 0], [0, 10], [5, 10]], z)).toMatchObject({ key: "out", depth: 10 });
    expect(matchRoute([[0, 0], [0, 10], [-5, 10]], x)).toMatchObject({ key: "out", depth: 10 }); // left side: out is to the left
    expect(matchRoute([[0, 0], [0, 12], [-6, 24]], z)?.key).toBe("post");
    expect(matchRoute([[0, 0], [0, 10], [6, 18]], z)?.key).toBe("corner");
    expect(matchRoute([[0, 0], [0, 16]], z)?.key).toBe("go");
    expect(matchRoute([[0, 0], [0, 6], [-0.6, 5]], z)?.key).toBe("hitch");
    expect(matchRoute([[0, 0], [0, 12], [-1.5, 10]], z)?.key).toBe("curl");
    expect(matchRoute([[0, 0], [0, 12], [-9, 12]], z)).toMatchObject({ key: "dig", depth: 12 });
    expect(matchRoute([[0, 0], [-2, 2], [-13, 4]], z)?.key).toBe("drag");
    expect(matchRoute([[0, 0], [2, 1], [7, 2]], lineup.find((q) => q.id === "Y")!)?.key).toBe("flat");
    expect(matchRoute([[0, 0], [-0.5, 6], [-1, 18]], z)?.key).toMatch(/seam|go/);
    // a scribble isn't a route
    expect(matchRoute([[0, 0], [4, 4], [-4, 8], [4, 12], [-4, 4]], z)).toBeNull();
  });

  it("an arrow from a receiver is his route; the drawing is kept as drawn", () => {
    const r = applyStroke(play(), "Z", hand([14, 0], [14, 10], [19, 10]), { style: "solid", end: "arrow" });
    const z = job(r.data, "Z");
    expect(z.route).toMatchObject({ name: "out", depth_yards: 10 });
    expect(z.route!.path!.length).toBe(3);
    expect(z.line).toEqual({ style: "solid", end: "arrow" });
    expect(r.said).toBe("Z: 10-yard out");
  });

  it("a T is a block: a guard who steps back and runs down the line pulls", () => {
    const r = applyStroke(play(), "LG", hand([-1.3, 0], [-1.3, -1], [3, -1], [4, 1.5]), { style: "solid", end: "t" });
    expect(job(r.data, "LG").block?.type).toBe("pull");
    const down = applyStroke(play(), "RT", hand([2.6, 0], [1.6, 1.2]), { style: "solid", end: "t" });
    expect(job(down.data, "RT").block?.type).toBe("down");
  });

  it("a back's arrow through the line carries the ball; dotted is a fake; outside the box it's a route", () => {
    const carry = applyStroke(play(), "F", hand([1.5, -5], [2.5, 0], [2.5, 5]), { style: "solid", end: "arrow" });
    expect(job(carry.data, "F").assignment_type).toBe("carry");
    const fake = applyStroke(play(), "F", hand([1.5, -5], [2.5, 0], [2.5, 5]), { style: "dotted", end: "arrow" });
    expect(job(fake.data, "F").assignment_type).toBe("fake");
    const swing = applyStroke(play(), "F", hand([1.5, -5], [3.5, -6], [7.5, -5], [9.5, -3.5]), { style: "solid", end: "arrow" });
    expect(job(swing.data, "F").assignment_type).toBe("route");
  });

  it("a squiggly line is the motion; the next line starts where the motion ends", () => {
    const m = applyStroke(play(), "H", hand([-7, -1], [3, -1.5]), { style: "squiggly", end: "none" });
    expect(m.data.motion).toMatchObject({ player: "H", direction: "right", end: [3, -1.5] });
    expect(m.data.motion!.path!.length).toBe(2); // the hand squiggle smoothed out
    const after = applyStroke(m.data, "H", hand([3, -1.5], [3, 3], [8, 3]), { style: "solid", end: "arrow" });
    expect(job(after.data, "H").route!.path![0]).toEqual([0, 0]);
    expect(job(after.data, "H").route!.path!.at(-1)).toEqual([5, 4.5]);
  });
});
