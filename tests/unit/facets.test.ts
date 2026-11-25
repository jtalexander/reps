import { describe, expect, it } from "vitest";
import { facetOptions, filterFrom, filterQuery, fits, personnelOf, toggle, type PlayFacets } from "@/domain/facets";
import type { Player } from "@/domain/play";

const p = (id: string, x: number, y: number): Player => ({ id, position: id, x, y, on_ball: Math.abs(y) < 0.8, side: x < -1 ? "left" : x > 1 ? "right" : "middle", split: null, assignment_type: "unknown", route: null, block: null, path: null, notes: null });
const OL = [p("LT", -2.6, 0), p("LG", -1.3, 0), p("C", 0, 0), p("RG", 1.3, 0), p("RT", 2.6, 0)];
const v = (value: string, label = value) => [{ value, label }];

const rows: Array<{ name: string; facets: PlayFacets }> = [
  { name: "PRO RIGHT, 26 POWER", facets: { formation: v("PRO"), personnel: v("21"), scheme: v("power", "Power"), type: v("run") } },
  { name: "ACE RIGHT, 26 POWER", facets: { formation: v("ACE"), personnel: v("12"), scheme: v("power", "Power"), type: v("run") } },
  { name: "TRIPS RIGHT JET, SMASH", facets: { formation: v("TRIPS"), personnel: v("10"), motion: v("JET"), concept: v("smash", "Smash"), type: v("pass") } },
  { name: "TRIPS RIGHT JET, JET SWEEP", facets: { formation: v("TRIPS"), personnel: v("10"), motion: v("JET"), scheme: v("sweep", "Sweep / toss"), type: v("run") } },
];

describe("finding plays", () => {
  it("works out personnel from who lines up where", () => {
    expect(personnelOf([...OL, p("Y", 4, 0), p("X", -14, 0), p("Z", 12, -1), p("QB", 0, -1), p("F", 0, -4), p("RB", 0, -6.5)])).toBe("21");
    expect(personnelOf([...OL, p("X", -14, 0), p("H", -8, -1), p("Y", 8, -1), p("Z", 14, 0), p("QB", 0, -5), p("RB", 1.5, -5)])).toBe("10");
    expect(personnelOf([p("X", -14, 0), p("QB", 0, -5)])).toBeNull(); // no line drawn
  });

  it("matches any pick in a row and every row picked, plus the search words", () => {
    const f = { formation: ["PRO", "TRIPS"], type: ["run"] };
    expect(rows.filter((r) => fits(r.facets, r.name, f)).map((r) => r.name)).toEqual(["PRO RIGHT, 26 POWER", "TRIPS RIGHT JET, JET SWEEP"]);
    expect(rows.filter((r) => fits(r.facets, r.name, {}, "26 power")).length).toBe(2);
    // search words also find tags ("sweep" is the scheme's name)
    expect(rows.filter((r) => fits(r.facets, r.name, {}, "toss")).map((r) => r.name)).toEqual(["TRIPS RIGHT JET, JET SWEEP"]);
  });

  it("counts what each pick would show, given the other picks", () => {
    const o = facetOptions(rows, { type: ["run"] });
    expect(o.formation.map((x) => [x.value, x.n])).toEqual([["ACE", 1], ["PRO", 1], ["TRIPS", 1]]);
    // the row being picked from doesn't narrow itself
    expect(o.type.find((x) => x.value === "pass")!.n).toBe(1);
    expect(o.type.find((x) => x.value === "run")!.on).toBe(true);
  });

  it("keeps the picks in the page address", () => {
    const f = toggle(toggle({}, "formation", "TRIPS"), "motion", "JET");
    const q = filterQuery(f, "smash");
    expect(q).toBe("formation=TRIPS&motion=JET&q=smash");
    expect(filterFrom(Object.fromEntries([...new URLSearchParams(q)].map(([k, x]) => [k, x])))).toEqual({ formation: ["TRIPS"], motion: ["JET"] });
    expect(filterFrom({ formation: ["PRO", "ACE"], nonsense: "x" })).toEqual({ formation: ["PRO", "ACE"] });
    expect(toggle(f, "formation", "TRIPS")).toEqual({ motion: ["JET"] });
  });
});
