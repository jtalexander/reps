import { describe, expect, it } from "vitest";
import { newBlocking, SCHEME_LIBRARY } from "@/domain/blocking";
import { emptyPlay, type PlayData, type Player } from "@/domain/play";
import { COMMON_TREE } from "@/domain/route-tree";
import {
  assignNumbers,
  byNumber,
  copiesPerPage,
  DEFAULT_BAND,
  DEFAULT_WRISTBAND,
  fitWindows,
  jobOnCall,
  perWindow,
  positionsOf,
  renumber,
  setNumber,
  swapNumbers,
  wristbandFrom,
} from "@/domain/wristband";

const p = (id: string, x: number, y: number, more: Partial<Player> = {}): Player => ({
  id,
  position: id,
  x,
  y,
  on_ball: Math.abs(y) < 0.8,
  side: x < -1 ? "left" : x > 1 ? "right" : "middle",
  split: null,
  assignment_type: "unknown",
  route: null,
  block: null,
  path: null,
  notes: null,
  ...more,
});
const OL = [p("LT", -2.6, 0), p("LG", -1.3, 0), p("C", 0, 0), p("RG", 1.3, 0), p("RT", 2.6, 0)];
const proI = [...OL, p("Y", 4, 0), p("X", -14, 0), p("Z", 12, -1), p("QB", 0, -1), p("F", 0, -4), p("RB", 0, -6.5)];
const power: PlayData = { ...emptyPlay("PRO RIGHT, POWER RIGHT"), play_type: "run", players: proI, blocking: newBlocking(SCHEME_LIBRARY.find((s) => s.key === "power")!, "right") };
const route = (name: string) => ({ name, depth_yards: 5, break_direction: "out" as const, notes: null, path: null });
const pass: PlayData = {
  ...emptyPlay("SPREAD RIGHT, SMASH"),
  play_type: "pass",
  players: [...OL, p("QB", 0, -5), p("Z", 12, -1, { assignment_type: "route", route: route("out") }), p("X", -14, 0, { assignment_type: "route", route: route("post") })],
  motion: { player: "Z", type: "jet", direction: "left", timing: "at_snap", end: null },
};

describe("wristband numbers", () => {
  it("numbers new calls and never changes a call's number", () => {
    const a = assignNumbers({}, ["p1", "p2", "p3"], "order");
    expect(a).toEqual({ p1: "1", p2: "2", p3: "3" });
    // next week: p2 is gone from the band, p4 is new; p1 and p3 keep theirs, p4 doesn't take a used number
    const b = assignNumbers(a, ["p1", "p3", "p4"], "order");
    expect(b).toMatchObject({ p1: "1", p3: "3", p4: "4" });
    // 3-digit codes: unique, three digits
    let seed = 0;
    const codes = assignNumbers({}, Array.from({ length: 50 }, (_, i) => `c${i}`), "code", () => ((seed = (seed * 9301 + 49297) % 233280) / 233280));
    const vals = Object.values(codes);
    expect(new Set(vals).size).toBe(50);
    expect(vals.every((v) => /^\d{3}$/.test(v))).toBe(true);
  });

  it("gives a number to one call only, swaps, and renumbers in order", () => {
    const r = setNumber({ p1: "1", p2: "2" }, "p1", "2");
    expect(r).toEqual({ numbers: { p1: "2" }, bumped: "p2" });
    expect(setNumber({ p1: "1" }, "p1", "").numbers).toEqual({});
    expect(swapNumbers({ p1: "1", p2: "2" }, "p1", "p2")).toEqual({ p1: "2", p2: "1" });
    expect(renumber({ p1: "7", p2: "3", other: "1" }, ["p2", "p1"], "order")).toEqual({ other: "1", p2: "2", p1: "3" });
    // codes renumbered come out in rising order down the band
    const c = renumber({}, ["a", "b", "c"], "code");
    expect(byNumber(c.a!, c.b!)).toBeLessThan(0);
    expect(byNumber(c.b!, c.c!)).toBeLessThan(0);
    expect(["10", "9", "2", "A"].sort(byNumber)).toEqual(["2", "9", "10", "A"]);
  });
});

describe("fitting the band", () => {
  it("fits calls to the window and says how many don't fit", () => {
    const w = { ...DEFAULT_BAND, windows: 1, width: 4.5, height: 2.75, text: "m" as const, columns: 2 };
    const per = perWindow(w);
    expect(per).toBeGreaterThan(20);
    expect(perWindow({ ...w, text: "s" })).toBeGreaterThan(per);
    expect(perWindow(w, true)).toBe(8); // 4 drawings across, 2 down
    // youth: fewer, bigger pictures
    expect(perWindow({ ...w, pictures: 2 }, true)).toBe(2);
    expect(perWindow({ ...w, pictures: 1 }, true)).toBe(1);
    // a small window can't hold 8 drawings
    expect(perWindow({ ...w, width: 2.5, height: 1.5, pictures: 8 }, true)).toBeLessThan(8);
    const f = fitWindows(Array.from({ length: per + 3 }, (_, i) => i), w);
    expect(f.windows[0]).toHaveLength(per);
    expect(f.over).toBe(3);
    expect(fitWindows([1, 2, 3], { ...w, windows: 3 }).windows.map((x) => x.length)).toEqual([3, 0, 0]);
    expect(copiesPerPage({ width: 4.5, height: 2.75, windows: 1 })).toBe(3);
    expect(copiesPerPage({ width: 3.5, height: 2.25, windows: 1 })).toBe(8);
    // bad stored settings fall back to the defaults
    expect(wristbandFrom({ windows: 9 })).toEqual(DEFAULT_WRISTBAND);
    // the first version (one band's settings at the top) becomes "Main band"
    const old = wristbandFrom({ numbers: { p1: "4" }, windows: 2, width: 3 });
    expect(old.numbers).toEqual({ p1: "4" });
    expect(old.bands).toHaveLength(1);
    expect(old.bands[0]).toMatchObject({ id: "main", name: "Main band", windows: 2, width: 3 });
  });
});

describe("each player's job on a call", () => {
  it("gives blockers their rule, receivers their route (by number), and the carrier the hole", () => {
    expect(jobOnCall(power, "RT")).toBe("Down");
    expect(jobOnCall(power, "LG")).toBe("Pull, wrap");
    expect(jobOnCall(power, "F")).toBe("Kick out");
    expect(jobOnCall(power, "RB")).toMatch(/^Carry/);
    expect(jobOnCall(pass, "X", { tree: COMMON_TREE })).toBe("8 Post");
    expect(jobOnCall(pass, "X")).toBe("Post");
    expect(jobOnCall(pass, "Z", { tree: COMMON_TREE })).toBe("Jet left ▸ 5 Out");
    expect(jobOnCall(pass, "H")).toBeNull();
  });

  it("lists the positions on the band, offense in the usual order", () => {
    expect(positionsOf([{ data: power }, { data: pass }])).toEqual(["QB", "RB", "F", "X", "Z", "Y", "LT", "LG", "C", "RG", "RT"]);
  });
});
