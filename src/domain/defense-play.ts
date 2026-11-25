/**
 * Defensive calls as plays: the defenders (y > 0 is the defense's side), each
 * with a job (rush, gap, zone drop, man, blitz, contain, spy), drawn against
 * an offense shown faintly. Standard fronts line the defenders up; a coverage
 * fills in the back seven's jobs; every job has a line even when none was
 * drawn, so a call always reads on the field.
 */
import { BLOCK_FRONTS, frontVs } from "./blocking";
import { isLineman, type PlayData, type Player, type Point } from "./play";

export const DEF_FRONTS = ["4-3", "3-4", "4-4", "5-3", "4-2-5"] as const;
export type DefFront = (typeof DEF_FRONTS)[number];

export const DEF_COVERAGES = ["cover_0", "cover_1", "cover_2", "cover_3", "cover_4"] as const;

export const DEF_JOB_LABEL: Record<string, string> = {
  rush: "Rush",
  gap: "Gap",
  zone_drop: "Zone drop",
  man: "Man",
  blitz: "Blitz",
  contain: "Contain",
  spy: "Spy",
};

export const ZONE_LABEL: Record<string, string> = {
  deep_third: "Deep third",
  deep_half: "Deep half",
  deep_quarter: "Deep quarter",
  deep_middle: "Deep middle",
  flat: "Flat",
  curl: "Curl",
  hook: "Hook",
  middle_hole: "Middle hole",
};

export const GAPS = ["A", "B", "C", "D"] as const;

const d = (id: string, x: number, y: number): Player => ({
  id,
  position: id,
  x,
  y,
  on_ball: y < 1.5,
  side: x < -1 ? "left" : x > 1 ? "right" : "middle",
  split: null,
  assignment_type: "unknown",
  route: null,
  block: null,
  path: null,
  notes: null,
});

/** Where the defenders line up in a standard front, against a 2x2 offense. */
export function frontLineup(front: DefFront): Player[] {
  const corners = [d("LC", -13, 6), d("RC", 13, 6)];
  switch (front) {
    case "3-4":
      return [d("E", -2.6, 1), d("N", 0, 1), d("T", 2.6, 1), d("B", -5, 4), d("W", -1.8, 4.5), d("M", 1.8, 4.5), d("S", 5, 4), ...corners, d("FS", -5, 11), d("SS", 5, 11)];
    case "4-4":
      return [d("E", -3.5, 1), d("T", -1, 1), d("N", 1, 1), d("R", 3.5, 1), d("W", -6, 4), d("M", -1.8, 4.5), d("B", 1.8, 4.5), d("S", 6, 4), ...corners, d("FS", 0, 11)];
    case "5-3":
      return [d("E", -4, 1), d("T", -2, 1), d("N", 0, 1), d("G", 2, 1), d("R", 4, 1), d("W", -3, 4.5), d("M", 0, 4.5), d("S", 3, 4.5), ...corners, d("FS", 0, 11)];
    case "4-2-5":
      return [d("E", -3.5, 1), d("T", -1, 1), d("N", 1, 1), d("R", 3.5, 1), d("W", -1.8, 4.5), d("M", 1.8, 4.5), d("NB", -7, 4), ...corners, d("FS", -5, 11), d("SS", 5, 11)];
    default:
      return [d("E", -3.5, 1), d("T", -1, 1), d("N", 1, 1), d("R", 3.5, 1), d("W", -3, 4.5), d("M", 0, 4.5), d("S", 3, 4.5), ...corners, d("FS", -5, 11), d("SS", 5, 11)];
  }
}

/**
 * The front lined up by technique against this offense ("4-3 Over" against
 * Trips puts the 3 technique on the strong guard's outside shoulder), when
 * the words name a front RepWon knows. Null otherwise.
 */
export function frontAgainst(words: string, vs: Player[]): Player[] | null {
  const w = words.trim().toLowerCase();
  const f = [...BLOCK_FRONTS].sort((a, b) => b.length - a.length).find((x) => w === x.toLowerCase() || w.startsWith(`${x.toLowerCase()} `));
  if (!f || vs.filter((p) => isLineman(p.id)).length < 5) return null;
  return frontVs(f, vs).map((x) => ({ ...d(x.id, x.x, x.y), def: { gap: null, zone: null, man: null, technique: x.level === "line" ? x.tech : null } }));
}

/** The standard front a call's front words point to ("4-3 Over" -> 4-3), if any. */
export function frontOf(words: string): DefFront | null {
  const m = words.match(/\b([345])\s*-\s*([2345])(?:\s*-\s*5)?\b/);
  if (!m) return null;
  const f = `${m[1]}-${m[2]}${/4\s*-\s*2\s*-\s*5/.test(words) ? "-5" : ""}`;
  return (DEF_FRONTS as readonly string[]).includes(f) ? (f as DefFront) : null;
}

/** A coverage key from the coach's words ("Cover 3 Sky" -> cover_3). */
export function coverageOf(words: string): string | null {
  const m = words.toLowerCase().match(/cover(?:age)?[\s-]*([0-4])/);
  return m ? `cover_${m[1]}` : null;
}

const isDL = (p: Player) => p.y < 2;
const isDB = (p: Player) => p.y >= 8 || Math.abs(p.x) >= 9;

/** The line rushes its gap (inside out: A, B, C, D); with a coverage, the back seven get their jobs. */
export function applyCoverage(players: Player[], coverage: string | null, vs: Player[] = []): Player[] {
  const line = players.filter(isDL).sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
  const receivers = vs.filter((p) => !isLineman(p.id) && p.id !== "QB").sort((a, b) => Math.abs(b.x) - Math.abs(a.x));
  const nearest = (p: Player, taken: Set<string>) => receivers.filter((r) => !taken.has(r.id)).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  const taken = new Set<string>();
  const job = (p: Player, assignment_type: string, def: Partial<NonNullable<Player["def"]>>): Player => ({
    ...p,
    assignment_type: assignment_type as Player["assignment_type"],
    path: null,
    def: { gap: null, zone: null, man: null, technique: null, ...def },
  });
  return players.map((p) => {
    if (isDL(p)) {
      const i = line.indexOf(p);
      return job(p, "rush", { gap: GAPS[Math.min(3, Math.floor(i / 2))]! });
    }
    if (!coverage) return p;
    const out = Math.abs(p.x) >= 9;
    const deep = p.y >= 8;
    const mid = Math.abs(p.x) < 1;
    switch (coverage) {
      case "cover_0": {
        if (isDB(p)) {
          const r = nearest(p, taken);
          if (r) taken.add(r.id);
          return r ? job(p, "man", { man: r.id }) : job(p, "blitz", { gap: "B" });
        }
        return job(p, "blitz", { gap: Math.abs(p.x) < 2 ? "A" : "B" });
      }
      case "cover_1": {
        if (deep && (mid || p.id === "FS")) return job(p, "zone_drop", { zone: "deep_middle" });
        const r = nearest(p, taken);
        if (r && (isDB(p) || Math.abs(p.x) >= 4)) {
          taken.add(r.id);
          return job(p, "man", { man: r.id });
        }
        return job(p, "zone_drop", { zone: "middle_hole" });
      }
      case "cover_2":
        if (deep) return job(p, "zone_drop", { zone: "deep_half" });
        if (out) return job(p, "zone_drop", { zone: "flat" });
        return job(p, "zone_drop", { zone: Math.abs(p.x) < 1 ? "middle_hole" : "hook" });
      case "cover_3":
        if (out) return job(p, "zone_drop", { zone: "deep_third" });
        if (deep) return p.id === "FS" || mid || p.x < 0 ? job(p, "zone_drop", { zone: "deep_middle" }) : job(p, "zone_drop", { zone: "curl" });
        return job(p, "zone_drop", { zone: Math.abs(p.x) >= 2.5 ? "curl" : "hook" });
      case "cover_4":
        if (out || deep) return job(p, "zone_drop", { zone: "deep_quarter" });
        return job(p, "zone_drop", { zone: Math.abs(p.x) >= 2.5 ? "curl" : "hook" });
      default:
        return p;
    }
  });
}

/** Where a gap is on the line of scrimmage, on a side (A between center and guard, out to D past the tight end). */
export function gapX(gap: string, side: number, vs: Player[] = []): number {
  const at = (ids: string[], fb: number) => Math.abs(vs.find((p) => ids.includes(p.id))?.x ?? fb);
  const g = at(side < 0 ? ["LG", "BSG", "PSG"] : ["RG", "PSG", "BSG"], 1.3);
  const t = at(side < 0 ? ["LT", "BST", "PST"] : ["RT", "PST", "BST"], 2.6);
  const x = gap === "A" ? g / 2 : gap === "B" ? (g + t) / 2 : gap === "C" ? t + 0.9 : t + 2.2;
  return x * side;
}

/** Where a zone drop ends, for a defender on a side. */
export function zoneSpot(zone: string, p: Player): Point {
  const s = p.x < -0.5 ? -1 : p.x > 0.5 ? 1 : 0;
  switch (zone) {
    case "deep_third":
      return [s === 0 ? 0 : s * 11, 16];
    case "deep_half":
      return [(s || 1) * 9, 15];
    case "deep_quarter":
      return [Math.abs(p.x) >= 9 ? (s || 1) * 12 : (s || 1) * 5, 15];
    case "deep_middle":
      return [0, 15];
    case "flat":
      return [(s || 1) * 12, 4];
    case "curl":
      return [(s || 1) * 9, 9];
    case "hook":
      return [(s || 1) * 4, 7];
    case "middle_hole":
      return [0, 10];
    default:
      return [p.x, p.y + 6];
  }
}

export interface DefLine {
  /** field points, from the defender */
  pts: Point[];
  style: "solid" | "dashed" | "dotted";
  end: "arrow" | "none";
}

/** The line a defender's job draws: his own path when drawn, else the usual line for the job. */
export function defLine(p: Player, data: Pick<PlayData, "vs">): DefLine | null {
  const t = String(p.assignment_type);
  const style: DefLine["style"] = t === "zone_drop" ? "dashed" : t === "man" || t === "spy" ? "dotted" : "solid";
  const from: Point = [p.x, p.y];
  if (p.path && p.path.length >= 2) return { pts: p.path.map(([x, y]) => [p.x + x, p.y + y] as Point), style, end: t === "man" ? "none" : "arrow" };
  const side = p.x < 0 ? -1 : 1;
  const vs = data.vs ?? [];
  const gap = p.def?.gap;
  switch (t) {
    case "rush":
    case "gap":
      return { pts: [from, [gap ? gapX(gap, side, vs) : p.x, -0.8]], style, end: "arrow" };
    case "blitz":
      return { pts: [from, [gap ? gapX(gap, side, vs) : p.x * 0.4, 0], [gap ? gapX(gap, side, vs) * 0.6 : 0, -3]], style, end: "arrow" };
    case "contain":
      return { pts: [from, [p.x + side * 1.5, -0.5], [p.x + side * 0.5, -3]], style, end: "arrow" };
    case "zone_drop":
      return p.def?.zone ? { pts: [from, zoneSpot(p.def.zone, p)], style, end: "arrow" } : null;
    case "man": {
      const r = vs.find((o) => o.id === p.def?.man);
      return r ? { pts: [from, [r.x, r.y]], style, end: "none" } : null;
    }
    case "spy":
      return { pts: [from, [p.x * 0.5, p.y - 1]], style, end: "none" };
    default:
      return null;
  }
}

/** A defender's job in words: "B gap", "Deep third", "Man on H", "Blitz the A gap". */
export function defJobText(p: Player): string {
  const t = String(p.assignment_type);
  const def = p.def;
  switch (t) {
    case "rush":
      return def?.gap ? `Rush the ${def.gap} gap` : "Rush";
    case "gap":
      return def?.gap ? `${def.gap} gap` : "Gap";
    case "zone_drop":
      return def?.zone ? (ZONE_LABEL[def.zone] ?? def.zone.replace(/_/g, " ")) : "Zone drop";
    case "man":
      return def?.man ? `Man on ${def.man}` : "Man";
    case "blitz":
      return def?.gap ? `Blitz the ${def.gap} gap` : "Blitz";
    case "contain":
      return "Contain";
    case "spy":
      return "Spy the QB";
    default:
      return "No job yet";
  }
}

/** A defensive call's name from its parts: "4-3 OVER, COVER 3, SAM FIRE". */
export function callName(parts: { front?: string | null; coverage?: string | null; stunt?: string | null; pressure?: string | null }): string {
  return [parts.front, parts.coverage, parts.stunt, parts.pressure].map((x) => x?.trim()).filter(Boolean).join(", ");
}

/** A blank defensive call: a 4-3 against a 2x2 offense. */
export function blankDefense(vs: Player[]): PlayData {
  return {
    name: "unknown",
    play_type: "unknown",
    concept_key: null,
    formation: { name: "4-3", personnel: "unknown", strength: "unknown", backfield_alignment: "unknown" },
    motion: null,
    players: applyCoverage(frontLineup("4-3"), null, vs),
    run_details: null,
    option_details: null,
    pass_details: null,
    coaching_points: [],
    field_confidence: {},
    suggested: [],
    from_concept: [],
    side: "defense",
    defense: { front: "4-3", coverage: null, stunt: null, pressure: null },
    vs,
  };
}
