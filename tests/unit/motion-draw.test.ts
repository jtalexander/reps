import { describe, expect, it } from "vitest";
import { drawMotion, motionKind } from "@/domain/motion-draw";
import type { Player } from "@/domain/play";

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
// pro: X wide left, Y tight right, Z wide right, F offset right
const lineup = [p("X", -14, 0), p("LT", -2.6, 0), p("LG", -1.3, 0), p("C", 0, 0), p("RG", 1.3, 0), p("RT", 2.6, 0), p("Y", 3.9, 0), p("Z", 12, -1), p("H", 7, -1), p("QB", 0, -5), p("F", 1.5, -5)];

// what a team's naming rules say (wording from a real playbook)
const MEANS: Record<string, string> = {
  "3 / 4": "Tells the motion man to go just outside the end man on the LOS.",
  "9 / 10": "Tells the motion man to go outside the widest WR.",
  RETURN: "Motion to the opposite guard and return to just outside the end man on the LOS.",
  TRACE: "Motion to the opposite guard and return to original position.",
  CRAZY: "Motion to the opposite guard, return to the near guard and then across the formation to the end man on the LOS.",
  SHORT: "Outside-in motion to a point 2 yds outside the next receiver inside of you (do not cross any players).",
  SHUFFLE: "Backfield motion used by an offset RB to shuffle to the opposite tackle.",
  RINGO: "Wide backfield motion to the right. It does not change relative position in the formation and will not get closer to the LOS.",
  TRADE: "The TE will trade, or move, to a TE position on the opposite side of the formation.",
  ARMY: "Motion from left to right by a WR into the backfield. It looks like Jet motion at full speed, then he backpedals into his final position.",
  ORBIT: "Motion by a WR into the backfield to the same side as the player's original alignment.",
  FLY: "Motion by a WR into the backfield directly behind the QB.",
  DANCE: "Everyone aligns in SPREAD RIGHT and shifts to the called formation.",
};

const draw = (word: string, who: string) => drawMotion(word, MEANS[word] ?? "", who, lineup).motion!;

describe("motions drawn from the team's own definitions", () => {
  it("reads each kind from the words", () => {
    expect(Object.fromEntries(Object.entries(MEANS).map(([w, m]) => [w, motionKind(w, m)]))).toEqual({
      "3 / 4": "spot",
      "9 / 10": "spot",
      RETURN: "return",
      TRACE: "trace",
      CRAZY: "crazy",
      SHORT: "short",
      SHUFFLE: "shuffle",
      RINGO: "wide",
      TRADE: "trade",
      ARMY: "army",
      ORBIT: "orbit",
      FLY: "fly",
      DANCE: "shift",
    });
    expect(motionKind("JET", "")).toBe("jet");
    expect(motionKind("3 or 4", "")).toBe("spot");
    expect(motionKind("WHIRL", "something new")).toBe("across");
  });

  it("each motion ends where its definition puts him", () => {
    // Z (right) on 3/4: across to just outside the left end man (the tackle, -2.6)
    expect(draw("3 / 4", "Z").end).toEqual([-4.1, -1]);
    // 9/10: outside the widest receiver on the far side (X at -14)
    expect(draw("9 / 10", "Z").end).toEqual([-16, -1]);
    // RETURN: to the opposite guard, back outside his own end man (Y at 3.9)
    const ret = draw("RETURN", "Z");
    expect(ret.path).toBeTruthy();
    expect(ret.path![1]).toEqual([-13.3, 0]); // the left guard, from Z
    expect(ret.end).toEqual([5.4, -1]);
    // TRACE: there and back to where he started
    expect(draw("TRACE", "Z").end).toEqual([12, -1]);
    // CRAZY: ends outside the far end man
    expect(draw("CRAZY", "Z").end).toEqual([-4.1, -1]);
    // SHORT: H is the next receiver inside Z; 2 yards outside him
    expect(draw("SHORT", "Z").end).toEqual([9, -1]);
    // SHUFFLE: the offset back to the opposite tackle
    expect(draw("SHUFFLE", "F").end).toEqual([-2.6, -5]);
    // RINGO: wide to the right, same depth
    expect(draw("RINGO", "F").end).toEqual([6.5, -5]);
    // TRADE: Y to a tight end spot on the other side
    expect(draw("TRADE", "Y").end).toEqual([-3.9, 0]);
    // FLY: right behind the QB
    expect(draw("FLY", "Z").end).toEqual([0, -7]);
    // ORBIT: into the backfield on his own side
    expect(draw("ORBIT", "Z").end![0]).toBeGreaterThan(0);
    expect(draw("ORBIT", "Z").end![1]).toBeLessThan(-3);
    // ARMY: left to right into the backfield
    expect(draw("ARMY", "X").end).toEqual([3, -5]);
  });

  it("different words draw different motions", () => {
    const ends = ["3 / 4", "9 / 10", "RETURN", "TRACE", "SHORT", "FLY", "ORBIT"].map((w) => JSON.stringify(draw(w, "Z").end));
    expect(new Set(ends).size).toBe(ends.length);
  });

  it("a shift has no motion line", () => {
    expect(drawMotion("DANCE", MEANS.DANCE!, "Z", lineup).motion).toBeNull();
  });
});
