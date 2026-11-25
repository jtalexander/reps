import { describe, expect, it } from "vitest";
import {
  applyBlocking,
  BLOCK_FRONTS,
  frontVs,
  newBlocking,
  resolveBlocking,
  SCHEME_LIBRARY,
  schemeForWords,
  teamSchemes,
  type Blocking,
} from "@/domain/blocking";
import { emptyPlay, flipPlay, type PlayData, type Player } from "@/domain/play";
import { candidates, questionsFor, type QuizPlay } from "@/domain/quiz";
import { EMPTY_TERMS } from "@/domain/terms";

const p = (id: string, x: number, y: number): Player => ({ id, position: id, x, y, on_ball: Math.abs(y) < 0.8, side: x < -1 ? "left" : x > 1 ? "right" : "middle", split: null, assignment_type: "unknown", route: null, block: null, path: null, notes: null });
const OL = [p("LT", -2.6, 0), p("LG", -1.3, 0), p("C", 0, 0), p("RG", 1.3, 0), p("RT", 2.6, 0)];
const proI = [...OL, p("Y", 4, 0), p("X", -14, 0), p("Z", 12, -1), p("QB", 0, -1), p("F", 0, -4), p("RB", 0, -6.5)];
const scheme = (key: string) => SCHEME_LIBRARY.find((s) => s.key === key)!;
const powerRight = (more: Partial<Blocking> = {}): PlayData => ({ ...emptyPlay("PRO RIGHT, POWER RIGHT"), play_type: "run", players: proI, blocking: { ...newBlocking(scheme("power"), "right"), ...more } });
const targets = (data: PlayData, front: (typeof BLOCK_FRONTS)[number]) => Object.fromEntries(resolveBlocking(data, data.blocking!, front).blocks.map((b) => [b.id, b.target]));

describe("fronts lined up against the offense", () => {
  it("puts every front's defenders by technique off this offense's own line", () => {
    for (const f of BLOCK_FRONTS) {
      const d = frontVs(f, proI);
      expect(new Set(d.map((x) => x.id)).size).toBe(d.length);
      // six or more in the box (the 3-3 stack has six)
      expect(d.filter((x) => x.level !== "back").length).toBeGreaterThanOrEqual(6);
      expect(d.every((x) => x.y > 0)).toBe(true);
    }
    // 4-3 over: the 3 technique sits on the strong (tight end) guard's outside shoulder
    const t = frontVs("4-3", proI).find((x) => x.id === "T")!;
    expect(t.label).toBe("3 technique");
    expect(t.x).toBeCloseTo(1.8);
    // with the tight end on the left, the front turns around
    const mirrored = frontVs("4-3", flipPlay({ ...emptyPlay(), players: proI }).players).find((x) => x.id === "T")!;
    expect(mirrored.x).toBeCloseTo(-1.8);
  });
});

describe("blocking schemes", () => {
  it("blocks Power the textbook way against a 4-3", () => {
    // center back on the 1, play-side guard up to Will, tackle down on the 3, back-side guard wraps for Mike,
    // back-side tackle hinges on the end, tight end climbs to Sam, fullback kicks out the 9
    expect(targets(powerRight(), "4-3")).toEqual({ C: "N", RG: "W", RT: "T", LG: "M", LT: "E", Y: "S", F: "R" });
  });

  it("works out every front, and the carrier hits the hole", () => {
    for (const f of BLOCK_FRONTS) {
      const r = resolveBlocking(powerRight(), powerRight().blocking!, f);
      expect(r.blocks.map((b) => b.id).sort()).toEqual(["C", "F", "LG", "LT", "RG", "RT", "Y"]);
      // no defender is blocked twice (no doubles in Power)
      const t = r.blocks.map((b) => b.target).filter(Boolean);
      expect(new Set(t).size).toBe(t.length);
      expect(r.carrier?.id).toBe("RB");
    }
    // Counter: the back-side guard kicks out, the back-side tackle wraps
    const counter = { ...powerRight(), blocking: newBlocking(scheme("counter"), "right") };
    expect(targets(counter, "4-3")).toMatchObject({ LG: "R", LT: "M" });
  });

  it("flips with the play, and the coach's fix for one front wins", () => {
    const left = flipPlay(powerRight());
    expect(left.blocking!.side).toBe("left");
    // flipped, each player stands on the other side (letters stay with him) and still has the play side's job
    expect(left.players.find((x) => x.id === "RG")!.x).toBe(-1.3);
    expect(targets(left, "4-3")).toEqual({ C: "N", RG: "W", RT: "T", LG: "M", LT: "E", Y: "S", F: "R" });
    const fixed = powerRight({ fixes: { "4-3": { RG: "M", LG: "W" } } });
    const r = resolveBlocking(fixed, fixed.blocking!, "4-3");
    expect(r.blocks.find((b) => b.id === "RG")).toMatchObject({ target: "M", fixed: true });
    expect(r.blocks.find((b) => b.id === "LG")).toMatchObject({ target: "W", fixed: true, rule: "pull_wrap" });
    // a fix takes that man out of the pool: the others work around it
    const one = powerRight({ fixes: { "4-3": { RG: "M" } } });
    const t1 = targets(one, "4-3");
    expect(t1.RG).toBe("M");
    expect(t1.LG).not.toBe("M");
    expect(new Set(Object.values(t1).filter(Boolean)).size).toBe(Object.values(t1).filter(Boolean).length);
    // only for that front
    expect(resolveBlocking(fixed, fixed.blocking!, "5-3").blocks.every((b) => !b.fixed)).toBe(true);
    // the play's own blocks are written for a front
    const players = applyBlocking(fixed, fixed.blocking!, "4-3");
    expect(players.find((x) => x.id === "RT")!.block).toMatchObject({ type: "down", target: "T" });
    expect(players.find((x) => x.id === "RB")!.assignment_type).toBe("carry");
  });

  it("finds the scheme from the play word, the team's own words first", () => {
    expect(schemeForWords("24 POWER")).toBe("power");
    expect(schemeForWords("OUTSIDE ZONE LEFT")).toBe("outside_zone");
    expect(schemeForWords("26 COUNTER GT")).toBe("counter");
    expect(schemeForWords("SMASH")).toBeNull();
    const mine = teamSchemes({ schemes: [{ ...scheme("power"), words: ["BELLY"] }] });
    expect(schemeForWords("BELLY RIGHT", mine)).toBe("power");
    expect(mine).toHaveLength(SCHEME_LIBRARY.length);
  });
});

describe("who do I block", () => {
  const ctx = (positions: string[]) => ({ terms: EMPTY_TERMS, level: "youth" as const, positions, allowFlip: false });
  const play = (checked: string[]): QuizPlay => ({ id: "p1", data: powerRight({ checked }), qbReady: false });

  it("asks a lineman who he blocks, only on the fronts the coach checked", () => {
    expect(questionsFor("block_vs", play([]), [], ctx(["RT"]), 1)).toEqual([]);
    const qs = questionsFor("block_vs", play(["4-3", "5-3"]), [], ctx(["RT"]), 1);
    expect(qs.map((q) => q.prompt)).toEqual(["PRO RIGHT, POWER RIGHT against a 4-3: who do you block?", "PRO RIGHT, POWER RIGHT against a 5-3: who do you block?"]);
    const q = qs[0]!;
    expect(q.choices.find((c) => c.id === q.answer)!.label).toBe("the 3 technique (T)");
    expect(q.diagram).toMatchObject({ front: "4-3", hide: "player", highlight: "RT" });
    expect(q.explanation).toContain("you block down");
    // a receiver isn't asked
    expect(candidates([play(["4-3"])], ctx(["X"])).some((c) => c.type === "block_vs")).toBe(false);
    expect(candidates([play(["4-3"])], ctx(["F"])).some((c) => c.type === "block_vs")).toBe(true);
  });
});
