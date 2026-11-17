import { describe, expect, it } from "vitest";
import { applyConcept, LIBRARY_BY_KEY, recognizeConcept, CONCEPT_LIBRARY } from "@/domain/concepts";
import { buildLook, defenderForKey } from "@/domain/defense";
import { flipPlay, PlayDataSchema, UNKNOWN } from "@/domain/play";
import { readiness } from "@/domain/readiness";
import { normalizeRouteName, routePath } from "@/domain/routes";
import { candidates, isCorrect, questionsFor, typesForPositions, type QuizContext, type QuizPlay } from "@/domain/quiz";
import { buildQuiz, nextState } from "@/domain/srs";
import { EMPTY_TERMS } from "@/domain/terms";
import { toPlayData, type Extracted } from "@/domain/extraction";
import { JET, SMASH, ZONE, ZONE_READ, SAMPLE_PLAYS } from "../fixtures/sample-plays";

const ctx = (positions: string[], level: QuizContext["level"] = "middle_school"): QuizContext => ({ terms: EMPTY_TERMS, level, positions, allowFlip: false });
const asQuiz = (): QuizPlay[] => SAMPLE_PLAYS.map((d, i) => ({ id: `p${i}`, data: d, qbReady: readiness(d, "middle_school").qbReady }));

describe("routes", () => {
  it("normalizes common names", () => {
    expect(normalizeRouteName("Fly")).toBe("go");
    expect(normalizeRouteName("Quick Out")).toBe("quick_out");
    expect(normalizeRouteName("shallow")).toBe("drag");
  });
  it("draws outside breaks toward the receiver's sideline on both sides", () => {
    const r = { name: "out", depth_yards: 10, break_direction: "unknown" as const, notes: null, path: null };
    expect(routePath(r, { x: 15, side: "right" })!.at(-1)![0]).toBeGreaterThan(0);
    expect(routePath(r, { x: -15, side: "left" })!.at(-1)![0]).toBeLessThan(0);
  });
});

describe("concepts", () => {
  it("fills Smash reads by route and marks them suggested", () => {
    const raw = PlayDataSchema.parse({ ...SMASH, pass_details: null, suggested: [], from_concept: [] });
    const concept = recognizeConcept(raw, CONCEPT_LIBRARY)!;
    expect(concept.key).toBe("smash");
    const filled = applyConcept(raw, concept);
    expect(filled.pass_details!.progression.map((s) => s.player)).toEqual(["Y", "Z"]);
    expect(filled.pass_details!.vs_coverage.cover_3!.target).toBe("Z");
    expect(filled.suggested).toContain("pass_details.presnap_read");
  });
  it("never overwrites what the coach typed, except linked fields on refresh", () => {
    const typed = { ...SMASH, pass_details: { ...SMASH.pass_details!, presnap_read: "Coach's words" }, from_concept: SMASH.from_concept.filter((p) => p !== "pass_details.presnap_read") };
    const edited = { ...LIBRARY_BY_KEY.get("smash")!, presnap_read: "New team read" };
    expect(applyConcept(typed, edited, { refresh: true }).pass_details!.presnap_read).toBe("Coach's words");
    expect(applyConcept(SMASH, edited, { refresh: true }).pass_details!.presnap_read).toBe("New team read");
  });
});

describe("readiness (QB-ready gate)", () => {
  it("sample plays are complete at middle school", () => {
    for (const p of SAMPLE_PLAYS) expect(readiness(p, "middle_school").missing).toEqual([]);
  });
  it("a pass play without reads is not QB-ready", () => {
    const p = { ...SMASH, pass_details: { ...SMASH.pass_details!, presnap_read: UNKNOWN, progression: [] } };
    const r = readiness(p, "youth");
    expect(r.complete).toBe(false);
    expect(r.missing.map((m) => m.path)).toEqual(expect.arrayContaining(["pass_details.presnap_read", "pass_details.progression"]));
  });
  it("option plays need a read key and give/keep rules", () => {
    const p = { ...ZONE_READ, option_details: { ...ZONE_READ.option_details!, read_key: UNKNOWN } };
    expect(readiness(p, "youth").missing.map((m) => m.path)).toContain("option_details.read_key");
  });
  it("run plays need point of attack and ball carrier", () => {
    const p = { ...ZONE, run_details: { ...ZONE.run_details!, ball_carrier: UNKNOWN } };
    expect(readiness(p).missing.map((m) => m.path)).toContain("run_details.ball_carrier");
  });
  it("high school expects coverage answers", () => {
    const p = { ...SMASH, pass_details: { ...SMASH.pass_details!, vs_coverage: { cover_0: null, cover_1: null, cover_2: null, cover_3: null, cover_4: null } } };
    expect(readiness(p, "middle_school").complete).toBe(true);
    expect(readiness(p, "high_school").complete).toBe(false);
  });
});

describe("defense", () => {
  it("finds the zone-read key in every front", () => {
    for (const front of ["4-3", "4-2-5", "3-4", "5-3", "4-4"] as const) {
      expect(defenderForKey(buildLook(ZONE_READ, "cover_3", front), "backside_de")).toBeDefined();
    }
  });
  it("man coverage assigns every eligible receiver once", () => {
    const look = buildLook(SMASH, "cover_1");
    const targets = Object.values(look.man);
    expect(new Set(targets).size).toBe(targets.length);
    expect(targets).toEqual(expect.arrayContaining(["X", "Z"]));
  });
});

describe("flip", () => {
  it("mirrors players and strength and is its own inverse", () => {
    const f = flipPlay(JET);
    expect(f.formation.strength).toBe("left");
    expect(f.motion!.direction).toBe("right");
    expect(flipPlay(f).players).toEqual(JET.players);
  });
});

describe("quiz generation", () => {
  const plays = asQuiz();
  it("QB gets reads; receivers do not", () => {
    expect(typesForPositions(["QB"])).toContain("progression");
    expect(typesForPositions(["X"])).not.toContain("progression");
  });
  it("every question's answer is one of its choices and comes from play data", () => {
    for (const pos of ["QB", "X", "Z", "RB", "Y"]) {
      for (const play of plays) {
        for (const type of typesForPositions([pos])) {
          for (const q of questionsFor(type, play, plays, ctx([pos]), 7)) {
            const ids = q.choices.map((c) => c.id);
            if (Array.isArray(q.answer)) expect([...q.answer].sort()).toEqual([...ids].sort());
            else expect(ids).toContain(q.answer);
            expect(q.explanation.length).toBeGreaterThan(0);
            expect(new Set(q.choices.map((c) => c.label)).size).toBe(q.choices.length);
          }
        }
      }
    }
  });
  it("assignment question for Z on Smash answers Hitch", () => {
    const [q] = questionsFor("assignment", plays[0]!, plays, ctx(["Z"]), 3);
    expect(q!.choices.find((c) => c.id === q!.answer)!.label).toMatch(/^Hitch/);
  });
  it("option decision follows the play's rules", () => {
    const qs = questionsFor("option_decision", plays[2]!, plays, ctx(["QB"]), 3);
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) {
      const reaction = q.id.split(":")[2];
      const expected = ZONE_READ.option_details!.decisions.find((d) => d.reaction === reaction)!.action;
      expect(q.answer).toBe(expected);
      expect(isCorrect(q, expected)).toBe(true);
    }
  });
  it("progression order question grades order", () => {
    const [q] = questionsFor("progression", plays[0]!, plays, ctx(["QB"]), 3);
    expect(q!.kind).toBe("order");
    expect(isCorrect(q!, q!.answer)).toBe(true);
    expect(isCorrect(q!, [...(q!.answer as string[])].reverse())).toBe(false);
  });
  it("only uses plays it is given (approved only)", () => {
    const only = [plays[1]!];
    const qs = buildQuiz({ plays: only, ctx: ctx(["RB"]), state: [], now: new Date(), count: 10, mode: "mixed", seed: 1 });
    expect(qs.length).toBeGreaterThan(0);
    expect(new Set(qs.map((q) => q.playId))).toEqual(new Set(["p1"]));
  });
  it("candidates exist for a QB across the sample book", () => {
    expect(candidates(plays, ctx(["QB"])).length).toBeGreaterThan(8);
  });
});

describe("spaced repetition", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  it("misses reset to box 0 and return soon; hits wait longer", () => {
    const miss = nextState({ playId: "a", type: "assignment", box: 3, dueAt: now, seen: 3, correct: 3 }, { playId: "a", type: "assignment" }, false, now);
    expect(miss.box).toBe(0);
    expect(miss.dueAt.getTime() - now.getTime()).toBeLessThan(3_600_000);
    const hit = nextState(undefined, { playId: "a", type: "assignment" }, true, now);
    expect(hit.box).toBe(1);
  });
  it("puts overdue missed plays first", () => {
    const plays = asQuiz();
    const state = [{ playId: "p3", type: "assignment" as const, box: 0, dueAt: new Date(now.getTime() - 86_400_000), seen: 2, correct: 0 }];
    const qs = buildQuiz({ plays, ctx: ctx(["Z"]), state, now, count: 5, mode: "assignment", seed: 2 });
    expect(qs[0]!.playId).toBe("p3");
  });
});

describe("extraction conversion", () => {
  it("turns pixels into yards and keeps unknowns", () => {
    const e: Extracted = {
      is_play: true,
      name: "ACE LT 63 STINGRAY",
      play_type: "pass",
      concept_name: "unknown",
      ball: { x: 500, y: 300 },
      formation: { name: "Ace Lt", personnel: "unknown", strength: "left", backfield_alignment: "unknown" },
      motion: null,
      players: [
        { id: "C", position: "C", x: 500, y: 300, on_ball: true, assignment_type: "unknown", route: null, block: null, path: null, notes: null },
        { id: "X", position: "X", x: 200, y: 300, on_ball: true, assignment_type: "route", route: { name: "Slant", depth_yards: null, break_direction: "in", notes: null }, block: null, path: [{ x: 200, y: 300 }, { x: 200, y: 280 }, { x: 260, y: 220 }], notes: null },
      ],
      run_details: null,
      option_details: null,
      pass_details: null,
      coaching_points: [],
      confidence: [{ path: "formation.name", level: "low" }],
    };
    const d = toPlayData(e, (x, y) => [(x - 500) / 10, (300 - y) / 10]);
    const x = d.players.find((p) => p.id === "X")!;
    expect(x.x).toBe(-30);
    expect(x.route!.name).toBe("slant");
    expect(x.route!.depth_yards).toBe(UNKNOWN);
    expect(x.route!.path!.at(-1)).toEqual([6, 8]);
    expect(d.field_confidence["formation.name"]).toBe("low");
  });
});
