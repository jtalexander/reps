/**
 * The call system, checked against the examples printed in the
 * footballxos spread playbook's "How We Call Plays" pages.
 */
import { describe, expect, it } from "vitest";
import {
  CallSystemSchema,
  WristbandSchema,
  composeCall,
  decodeCodeName,
  decodeWristband,
  shuffledOrders,
  wristbandExamples,
} from "@/domain/calls";

const regular = WristbandSchema.parse({
  id: "r",
  name: "Regular",
  type: "play",
  formats: ["color_number", "digits"],
  pods: [
    { name: "WHITE", number: 1 },
    { name: "RED", number: 2 },
    { name: "YELLOW", number: 3 },
  ],
  live_digit: "second",
  live_pair: "last_two",
  odd: "left",
  even: "right",
  snap_by_last_digit: { odd: "Odd", even: "Even", "3": "Three" },
  entries: [
    { pod: "WHITE", code: "6", call: "DASH" },
    { pod: "YELLOW", code: "1", call: "MIDLINE" },
    { pod: "YELLOW", code: "3", call: "VEER" },
  ],
});

const formations = WristbandSchema.parse({
  id: "f",
  name: "Formations",
  type: "formation",
  flip_word: "OPPO",
  combine: true,
  entries: [
    { code: "ALPHA", call: "SPREAD RIGHT" },
    { code: "BRAVO", call: "SLOT RIGHT" },
    { code: "CHARLIE", call: "DOUBLES RIGHT" },
    { code: "ROMEO", call: "Z-5" },
  ],
});

const game = WristbandSchema.parse({
  id: "g",
  name: "Game",
  type: "play",
  formats: ["code"],
  pods: [{ name: "BROWN", number: 9 }],
  snap_by_last_digit: { odd: "Odd", even: "Even", "3": "Three" },
  entries: [{ pod: "BROWN", code: "6", call: "TRIPS RIGHT F, 900 VO, F-PIVOT" }],
});

describe("wristband decoding (the playbook's own examples)", () => {
  it('"WHITE 36" is Dash Right on an even count', () => {
    const d = decodeWristband(regular, "White 36")!;
    expect(d.call).toBe("DASH RIGHT");
    expect(d.snap).toBe("Even");
  });
  it('"431" is Midline Left', () => {
    const d = decodeWristband(regular, "431")!;
    expect(d.call).toBe("MIDLINE LEFT");
    expect(d.snap).toBe("Odd");
  });
  it("a last digit of 3 means snap count Three", () => {
    expect(decodeWristband(regular, "433")!.snap).toBe("Three");
  });
  it("formation codes: plain, OPPO, and combined", () => {
    expect(decodeWristband(formations, "Alpha")!.call).toBe("SPREAD RIGHT");
    expect(decodeWristband(formations, "Bravo Oppo")!.call).toBe("SLOT LEFT");
    expect(decodeWristband(formations, "Charlie Romeo")!.call).toBe("DOUBLES RIGHT, Z-5");
  });
  it('game card: "BROWN 6"', () => {
    expect(decodeWristband(game, "Brown 6")!.call).toBe("TRIPS RIGHT F, 900 VO, F-PIVOT");
  });
  it("unknown codes don't decode", () => {
    expect(decodeWristband(regular, "Green 36")).toBeNull();
    expect(decodeWristband(formations, "Zulu")).toBeNull();
  });
  it("generated examples all decode back", () => {
    for (const band of [regular, formations, game]) {
      const ex = wristbandExamples(band);
      expect(ex.length).toBeGreaterThan(0);
      for (const e of ex) expect(decodeWristband(band, e.spoken)?.call).toBe(e.decoded.call);
    }
  });
});

describe("code names and direction words", () => {
  const system = CallSystemSchema.parse({
    direction_words: [
      { word: "West", side: "left" },
      { word: "East", side: "right" },
      { word: "Moon", side: "left" },
      { word: "Sun", side: "right" },
    ],
  });
  it('"Vikings East" is Veer Right; "Titans Moon" is Trap Left', () => {
    const names = [
      { code: "Vikings", concept: "Veer" },
      { code: "Titans", concept: "Trap" },
    ];
    expect(decodeCodeName("Vikings East", system, names)!.call).toBe("VEER RIGHT");
    expect(decodeCodeName("Titans Moon", system, names)!.call).toBe("TRAP LEFT");
  });
});

describe("composing calls in a team's order", () => {
  it("formation group, comma, play group", () => {
    const order = ["formation", "formation_tag", "motion", "concept", "direction", "concept_tag"] as const;
    expect(composeCall({ formation: "Spread Right", formation_tag: "Zax", concept: "Smash", concept_tag: "Divide" }, [...order])).toBe("SPREAD RIGHT ZAX, SMASH DIVIDE");
    expect(composeCall({ formation: "Pro Right", concept: "Power", direction: "left" }, [...order])).toBe("PRO RIGHT, POWER LEFT");
  });
  it("a numbered huddle system works too", () => {
    expect(composeCall({ formation: "I Right", concept: "24 Power" }, ["formation", "concept"])).toBe("I RIGHT, 24 POWER");
  });
  it("wrong-order distractors differ from the right call", () => {
    const parts = { formation: "Spread Right", formation_tag: "Zax", concept: "Smash", concept_tag: "Divide" };
    const order = ["formation", "formation_tag", "concept", "concept_tag"] as const;
    const wrong = shuffledOrders(parts, [...order]);
    expect(wrong.length).toBeGreaterThan(2);
    expect(wrong).not.toContain("SPREAD RIGHT ZAX, SMASH DIVIDE");
  });
});
