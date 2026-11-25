import { describe, expect, it } from "vitest";
import { applyCoverage, blankDefense, callName, coverageOf, defJobText, defLine, frontLineup, frontOf } from "@/domain/defense-play";
import { customLook, lookLabel, looksFromText, readLooks, setLook, suggestLooks } from "@/domain/matchups";
import { emptyPlay, flipPlay, type PlayData, type Player } from "@/domain/play";
import { candidates, questionsFor, type QuizPlay } from "@/domain/quiz";
import { EMPTY_TERMS } from "@/domain/terms";
import { defDrawingToPlay } from "@/teach/convert";

const p = (id: string, x: number, y: number, more: Partial<Player> = {}): Player => ({
  id,
  position: id,
  x,
  y,
  on_ball: Math.abs(y) < 0.75,
  side: x < -1 ? "left" : x > 1 ? "right" : "middle",
  split: null,
  assignment_type: "unknown",
  route: null,
  block: null,
  path: null,
  notes: null,
  ...more,
});
const offense2x2 = [p("X", -14, 0), p("H", -7, -1), p("LT", -2.6, 0), p("LG", -1.3, 0), p("C", 0, 0), p("RG", 1.3, 0), p("RT", 2.6, 0), p("Y", 7, -1), p("Z", 14, 0), p("QB", 0, -5), p("F", 1.5, -5)];

describe("what a play is good against", () => {
  it("reads only sentences that say a play is good against something", () => {
    expect(looksFromText(["Great vs Cover 3 and man.", "Drawn vs 4-3"], "offense").sort()).toEqual(["cover_3", "man"]);
    expect(looksFromText(["Use it against an 8-man box"], "offense")).toEqual(["loaded_box"]);
    expect(looksFromText(["Our best call vs Trips and the run"], "defense").sort()).toEqual(["run", "trips"]);
    expect(looksFromText(["Shown against a 2x2 look"], "defense")).toEqual([]); // just how it's drawn
    expect(readLooks("odd front, blitz", "offense").sort()).toEqual(["blitz", "odd"]);
  });

  it("suggests from the playbook first, then the concept or the coverage", () => {
    const smash: PlayData = { ...emptyPlay("SPREAD RIGHT, SMASH"), coaching_points: ["Good vs Cover 2"] };
    expect(suggestLooks(smash, "offense", [], "smash")).toEqual([
      { key: "cover_2", from: "playbook" },
      { key: "zone", from: "concept" },
    ]);
    const cover3: PlayData = { ...blankDefense(offense2x2), defense: { front: "4-3", coverage: "Cover 3 Sky", stunt: null, pressure: null } };
    expect(suggestLooks(cover3, "defense", [], null).map((s) => s.key)).toEqual(["run", "pass"]);
  });

  it("takes the coach's own words, using the shared tag when one fits", () => {
    expect(customLook("cover 2", "offense")).toBe("cover_2");
    expect(customLook("Cover 6", "offense")).toBe("x:Cover 6");
    expect(customLook("trips", "defense")).toBe("trips");
    expect(lookLabel("x:Cover 6")).toBe("Cover 6");
    expect(lookLabel("c:smash", [{ key: "smash", name: "Smash" }])).toBe("Smash");
    let g = setLook(null, "cover_2", true);
    g = setLook(g, "man", false);
    expect(g).toEqual({ yes: ["cover_2"], no: ["man"] });
    expect(setLook(g, "man", true)).toEqual({ yes: ["cover_2", "man"], no: [] });
  });
});

describe("defensive calls", () => {
  it("lines up eleven in every front and reads the front and coverage from the coach's words", () => {
    for (const f of ["4-3", "3-4", "4-4", "5-3", "4-2-5"] as const) {
      const l = frontLineup(f);
      expect(l).toHaveLength(11);
      expect(new Set(l.map((x) => x.id)).size).toBe(11);
      expect(l.every((x) => x.y > 0)).toBe(true); // the defense's side of the ball
    }
    expect(frontOf("4-3 Over")).toBe("4-3");
    expect(frontOf("4-2-5 Nickel")).toBe("4-2-5");
    expect(frontOf("Bear")).toBeNull();
    expect(coverageOf("Cover 3 Sky")).toBe("cover_3");
    expect(callName({ front: "4-3 OVER", coverage: "COVER 3", stunt: null, pressure: "SAM FIRE" })).toBe("4-3 OVER, COVER 3, SAM FIRE");
  });

  it("gives the back seven their jobs from the coverage, and every job draws a line", () => {
    const c3 = applyCoverage(frontLineup("4-3"), "cover_3", offense2x2);
    const job = (id: string) => defJobText(c3.find((x) => x.id === id)!);
    expect(job("LC")).toBe("Deep third");
    expect(job("FS")).toBe("Deep middle");
    expect(job("T")).toMatch(/^Rush the [AB] gap$/);
    const c1 = applyCoverage(frontLineup("4-3"), "cover_1", offense2x2);
    expect(c1.find((x) => x.id === "LC")!.def?.man).toBe("X");
    for (const x of c3) expect(defLine(x, { vs: offense2x2 })?.pts.length).toBeGreaterThanOrEqual(2);
    // a defender with no job draws nothing
    expect(defLine(frontLineup("4-3")[5]!, { vs: offense2x2 })).toBeNull();
    // flipping a call flips the offense it's drawn against too
    const flipped = flipPlay(blankDefense(offense2x2));
    expect(flipped.vs!.find((x) => x.id === "X")!.x).toBe(14);
  });

  it("turns a defensive drawing into a call", () => {
    const d = defDrawingToPlay(
      {
        is_play: true,
        front: "4-3 Over",
        coverage: "Cover 3",
        stunt: null,
        pressure: null,
        defenders: [
          { id: "M", at: { x: 0, y: 4.5 }, does: "blitz", gap: "A", zone: null, man: null, path: [{ x: 0, y: 4.5 }, { x: 0.6, y: 0 }] },
          { id: "C", at: { x: -13, y: 6 }, does: "zone_drop", gap: null, zone: "deep_third", man: null, path: null },
        ],
        offense: [{ id: "X", at: { x: -14, y: 0 } }],
      },
      "4-3 OVER, COVER 3, MIKE A",
    )!;
    expect(d.side).toBe("defense");
    expect(d.defense).toEqual({ front: "4-3 Over", coverage: "Cover 3", stunt: null, pressure: null });
    expect(d.players[0]).toMatchObject({ id: "M", assignment_type: "blitz", path: [[0, 0], [0.6, -4.5]] });
    expect(defJobText(d.players[1]!)).toBe("Deep third");
    expect(d.vs?.map((x) => x.id)).toEqual(["X"]);
  });
});

describe("matchup and defense quizzes", () => {
  const ctx = (positions: string[]) => ({ terms: EMPTY_TERMS, level: "youth" as const, positions, allowFlip: false });
  const off = (id: string, name: string, goodVs: string[]): QuizPlay => ({ id, data: { ...emptyPlay(name), players: offense2x2 }, qbReady: true, goodVs });
  const def = (id: string, name: string, coverage: string, goodVs: string[]): QuizPlay => ({
    id,
    data: { ...blankDefense(offense2x2), name, players: applyCoverage(frontLineup("4-3"), coverageOf(coverage), offense2x2), defense: { front: "4-3", coverage, stunt: null, pressure: null } },
    qbReady: false,
    goodVs,
  });
  const plays = [off("a", "SPREAD RIGHT, SMASH", ["cover_2"]), off("b", "SPREAD RIGHT, MESH", ["man"]), off("c", "TRIPS RIGHT, FLOOD", ["cover_3"]), def("d", "4-3, COVER 3", "Cover 3", ["run"]), def("e", "4-3, COVER 2", "Cover 2", ["pass"])];

  it("asks the QB what to call against a look, from the coach's tags", () => {
    const [q] = questionsFor("call_vs", plays[0]!, plays, ctx(["QB"]), 1);
    expect(q!.prompt).toBe("The defense shows Cover 2. Which of our plays is built to beat it?");
    expect(q!.choices.find((c) => c.id === q!.answer)!.label).toBe("SPREAD RIGHT, SMASH");
    expect(q!.choices.map((c) => c.label)).not.toContain("4-3, COVER 3"); // offense against offense only
    // a defender isn't asked about offensive plays
    expect(questionsFor("call_vs", plays[0]!, plays, ctx(["M"]), 1)).toEqual([]);
  });

  it("asks a defender to name the call, what to call, and his job", () => {
    const m = ctx(["M"]);
    expect(questionsFor("call_vs", plays[3]!, plays, m, 1)[0]!.prompt).toBe("The offense shows The run. Which of our calls is built for it?");
    const [name] = questionsFor("def_call_id", plays[3]!, plays, m, 1);
    expect(name!.choices.map((c) => c.label).sort()).toEqual(["4-3, COVER 2", "4-3, COVER 3"]);
    const [job] = questionsFor("assignment", plays[3]!, plays, m, 1);
    expect(job!.choices.find((c) => c.id === job!.answer)!.label).toBe("Hook");
    // an offensive player gets no defense questions
    const kinds = new Set(candidates(plays, ctx(["X"])).map((c) => c.type));
    expect(kinds.has("def_call_id")).toBe(false);
  });
});
