import { describe, expect, it } from "vitest";
import { callKey, cardNumbers, explainCall, gridCell, saidText, sayCall, signalKey, splitCall } from "@/domain/calling";
import { emptyPlay, type PlayData, type Player } from "@/domain/play";
import { questionsFor, type QuizContext, type QuizPlay } from "@/domain/quiz";
import { EMPTY_TERMS } from "@/domain/terms";
import { DEFAULT_CALLING, newBand, type Band } from "@/domain/wristband";

let seed = 7;
const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
const band = (more: Partial<Band> = {}, calling: Partial<Band["calling"]> = {}): Band => ({ ...newBand("b1", "Main"), ...more, calling: { ...DEFAULT_CALLING, ...calling } });

describe("calling a play", () => {
  it("splits a call into formation and play", () => {
    expect(splitCall("SPREAD RIGHT, SMASH")).toEqual({ formation: "SPREAD RIGHT", play: "SMASH" });
    expect(splitCall("ALABAMA 37", "ALABAMA")).toEqual({ formation: "ALABAMA", play: "37" });
    expect(splitCall("POWER RIGHT vs 4-3")).toEqual({ formation: "", play: "POWER RIGHT" });
    expect(callKey("p1", "smash  divide", "concept")).toBe("c:SMASH DIVIDE");
    expect(callKey("p1", "SMASH", "play")).toBe("p1");
  });

  it("says ALABAMA 37 BLUE BINGO: a code word, the number and dummy words", () => {
    const b = band({}, { formation: "code", codeWords: { ACE: ["ALABAMA"] }, dummies: 2, dummyWords: ["BLUE", "BINGO"] });
    const parts = sayCall({ formation: "ACE", play: "POWER", number: "37" }, b, rand)!;
    expect(parts.map((p) => p.kind)).toEqual(["formation", "play", "dummy", "dummy"]);
    expect(parts.slice(0, 2).map((p) => p.text)).toEqual(["ALABAMA", "37"]);
    expect(new Set(parts.slice(2).map((p) => p.text))).toEqual(new Set(["BLUE", "BINGO"]));
    expect(saidText(parts)).toMatch(/^ALABAMA 37 (BLUE BINGO|BINGO BLUE)$/);
    expect(explainCall(parts)).toContain("ALABAMA = ACE (the formation)");
    expect(explainCall(parts)).toContain("dummy word");
    // no number yet: nothing to say
    expect(sayCall({ formation: "ACE", play: "POWER", number: null }, b, rand)).toBeNull();
    // concept words: no number needed
    expect(saidText(sayCall({ formation: "ACE", play: "DAGGER", number: null }, band({}, { play: "word" }), rand)!)).toBe("ACE DAGGER");
  });

  it("puts the live word right before the number that counts", () => {
    const b = band({}, { live: ["BLUE"], dead: ["RED"] });
    for (let i = 0; i < 10; i++) {
      const parts = sayCall({ formation: "", play: "POWER", number: "37" }, b, rand)!;
      const live = parts.findIndex((p) => p.kind === "live");
      expect(parts[live + 1]).toMatchObject({ kind: "play", text: "37" });
      expect(parts.filter((p) => p.kind === "dead").every((p) => /^RED \d+$/.test(p.text))).toBe(true);
    }
  });

  it("places numbers on a grid and shuffles cards B and C the same way every time", () => {
    const g = { gridRows: ["BLUE", "RED"], gridCols: 6 };
    expect(gridCell("1", g)).toEqual({ row: "BLUE", col: 1 });
    expect(gridCell("8", g)).toEqual({ row: "RED", col: 2 });
    expect(gridCell("13", g)).toBeNull();
    expect(saidText(sayCall({ formation: "", play: "POWER", number: "8" }, band({ style: "grid", ...g }), rand)!)).toBe("RED 2");
    // a dummy word that's also a grid row word is never used as a dummy
    for (let i = 0; i < 10; i++) expect(saidText(sayCall({ formation: "", play: "POWER", number: "8" }, band({ style: "grid", ...g }, { dummies: 1, dummyWords: ["BLUE", "BINGO"] }), rand)!)).toBe("RED 2 BINGO");

    const nums = Array.from({ length: 20 }, (_, i) => String(i + 1));
    const c1 = cardNumbers({ id: "b1", cards: 3, cardSeed: 1 }, nums);
    const c2 = cardNumbers({ id: "b1", cards: 3, cardSeed: 1 }, [...nums].reverse());
    expect(c1).toEqual(c2); // same cards whatever order the numbers come in
    expect(c1.A!["7"]).toBe("7");
    expect(new Set(Object.values(c1.B!))).toEqual(new Set(nums)); // same numbers, shuffled
    expect(Object.values(c1.B!)).not.toEqual(nums);
    expect(cardNumbers({ id: "b1", cards: 3, cardSeed: 2 }, nums).B).not.toEqual(c1.B);
    expect(Object.keys(cardNumbers({ id: "b1", cards: 2, cardSeed: 1 }, nums))).toEqual(["A", "B"]);
  });
});

describe("players learn the calls", () => {
  const p = (id: string, more: Partial<Player> = {}): Player => ({ id, position: id, x: 0, y: -1, on_ball: false, side: "middle", split: null, assignment_type: "unknown", route: null, block: null, path: null, notes: null, ...more });
  const route = (name: string) => ({ name, depth_yards: 5 as const, break_direction: "out" as const, notes: null, path: null });
  const play = (id: string, name: string, z: string): QuizPlay => ({
    id,
    data: { ...emptyPlay(name), play_type: "pass", formation: { ...emptyPlay(name).formation, name: "ACE" }, players: [p("QB"), p("Z", { assignment_type: "route", route: route(z) })] } as PlayData,
    qbReady: true,
    goodVs: [],
  });
  const plays = [play("p1", "ACE, SMASH", "corner"), play("p2", "ACE, MESH", "drag"), play("p3", "ACE, STICK", "flat")];
  const ctx = (calling: QuizContext["calling"]): QuizContext => ({ terms: EMPTY_TERMS, level: "high_school", positions: ["Z"], allowFlip: false, calling });
  const b = band({}, { formation: "code", codeWords: { ACE: ["ALABAMA"] }, dummies: 1, dummyWords: ["BINGO"], signals: { [signalKey.formation("ACE")]: "hand on helmet" } });
  const teach = { band: b, numbers: { p1: "37", p2: "38", p3: "39" }, labels: {}, numbersBy: "play" as const };

  it("asks what the call means, and the player's job on it", () => {
    const qs = questionsFor("call_decode", plays[0]!, plays, ctx(teach), 1);
    expect(qs).toHaveLength(2);
    expect(qs[0]!.prompt).toBe("The coach calls “ALABAMA 37 BINGO”. What's the play?");
    expect(qs[0]!.choices.find((c) => c.id === qs[0]!.answer)!.label).toBe("ACE, SMASH");
    expect(qs[0]!.explanation).toContain("BINGO = a dummy word");
    expect(qs[1]!.prompt).toContain("What's your job, Z?");
    // no calling set up, or the play is left off the band: no questions
    expect(questionsFor("call_decode", plays[0]!, plays, ctx(null), 1)).toEqual([]);
    expect(questionsFor("call_decode", plays[0]!, plays, ctx({ ...teach, band: { ...b, off: ["p1"] } }), 1)).toEqual([]);
  });

  it("asks what a signal means", () => {
    const qs = questionsFor("signal_id", plays[0]!, plays, ctx(teach), 1);
    // only one formation on the band: nothing to choose between
    expect(qs).toEqual([]);
    const more = [...plays, { ...play("p4", "TREY, SMASH", "corner") }];
    more[3]!.data.formation.name = "TREY";
    const qs2 = questionsFor("signal_id", plays[0]!, more, ctx(teach), 1);
    expect(qs2[0]!.prompt).toBe("The signal: hand on helmet. What formation?");
    expect(qs2[0]!.choices.find((c) => c.id === qs2[0]!.answer)!.label).toBe("ACE");
  });
});
