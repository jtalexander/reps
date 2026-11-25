/**
 * Blocking schemes: most runs are defined by how they're blocked, not by
 * where the back runs. A scheme is a rule for each blocker ("play-side tackle:
 * block down", "back-side guard: pull and wrap for the linebacker"). Pick a
 * defensive front and Reps lines that front up against the play's own
 * offense, by technique, and turns every rule into a block on a named
 * defender. The coach can fix any block for any front; the fix is kept.
 *
 * Geometry matches play.ts: yards from the ball, x to the right, y > 0 is
 * the defense's side.
 */
import { isLineman, type PlayData, type Player, type Point } from "./play";

// ---------- fronts ----------

export const BLOCK_FRONTS = ["4-3", "4-3 Under", "3-4", "5-2", "5-3", "6-2", "4-4", "4-2-5", "3-3 Stack"] as const;
export type BlockFront = (typeof BLOCK_FRONTS)[number];
export const DEFAULT_FRONTS: BlockFront[] = ["4-3", "3-4", "5-2", "5-3", "6-2", "4-4"];

export interface Defender {
  id: string;
  /** what a player calls him: "3 technique", "Mike", "corner" */
  label: string;
  /** DL: technique ("3", "2i"); LB: alignment ("30") */
  tech: string | null;
  level: "line" | "backer" | "back";
  x: number;
  y: number;
}

/** Where each defender lines up: side (strong / weak / middle), technique and level. */
type Spot = { id: string; name?: string; side: "str" | "weak" | "mid"; tech: string; level: "line" | "backer" };
const L = (id: string, side: Spot["side"], tech: string, name?: string): Spot => ({ id, side, tech, level: "line", name });
const B = (id: string, side: Spot["side"], tech: string, name: string): Spot => ({ id, side, tech, level: "backer", name });

const FRONT_SPOTS: Record<BlockFront, { spots: Spot[]; safeties: 1 | 2 }> = {
  "4-3": { spots: [L("E", "weak", "5"), L("N", "weak", "1"), L("T", "str", "3"), L("R", "str", "9"), B("W", "weak", "30", "Will"), B("M", "str", "10", "Mike"), B("S", "str", "apex", "Sam")], safeties: 2 },
  "4-3 Under": { spots: [L("E", "weak", "5"), L("T", "weak", "3"), L("N", "str", "1"), L("R", "str", "5"), L("S", "str", "9", "Sam"), B("M", "str", "30", "Mike"), B("W", "weak", "40", "Will")], safeties: 2 },
  "3-4": { spots: [L("W", "weak", "9", "Will"), L("E", "weak", "4"), L("N", "mid", "0"), L("T", "str", "4"), L("S", "str", "9", "Sam"), B("B", "weak", "30", "Buck"), B("M", "str", "30", "Mike")], safeties: 2 },
  "5-2": { spots: [L("E", "weak", "9"), L("T", "weak", "4"), L("N", "mid", "0"), L("G", "str", "4"), L("R", "str", "9"), B("W", "weak", "20", "Will"), B("M", "str", "20", "Mike")], safeties: 2 },
  "5-3": { spots: [L("E", "weak", "9"), L("T", "weak", "4"), L("N", "mid", "0"), L("G", "str", "4"), L("R", "str", "9"), B("W", "weak", "50", "Will"), B("M", "mid", "00", "Mike"), B("S", "str", "50", "Sam")], safeties: 1 },
  "6-2": { spots: [L("E", "weak", "9"), L("T", "weak", "5"), L("N", "weak", "1"), L("G", "str", "1"), L("D", "str", "5"), L("R", "str", "9"), B("W", "weak", "30", "Will"), B("M", "str", "30", "Mike")], safeties: 1 },
  "4-4": { spots: [L("E", "weak", "5"), L("T", "weak", "3"), L("N", "str", "3"), L("R", "str", "5"), B("W", "weak", "apex", "Will"), B("B", "weak", "20", "Buck"), B("M", "str", "20", "Mike"), B("S", "str", "apex", "Sam")], safeties: 1 },
  "4-2-5": { spots: [L("E", "weak", "5"), L("N", "weak", "1"), L("T", "str", "3"), L("R", "str", "9"), B("W", "weak", "30", "Will"), B("M", "str", "10", "Mike"), B("$", "str", "apex", "Nickel")], safeties: 2 },
  "3-3 Stack": { spots: [L("E", "weak", "5"), L("N", "mid", "0"), L("T", "str", "5"), B("W", "weak", "50", "Will"), B("M", "mid", "00", "Mike"), B("S", "str", "50", "Sam")], safeties: 2 },
};

export const frontOk = (f: string): f is BlockFront => (BLOCK_FRONTS as readonly string[]).includes(f);

/** The offense's blockers, found by where they line up. */
export interface OffenseShape {
  /** linemen left to right */
  line: Player[];
  center: Player | null;
  /** tight ends on the line, by side (-1 left, +1 right) */
  te: Record<"-1" | "1", Player | null>;
  wings: Record<"-1" | "1", Player | null>;
  /** receivers outside-in, by side */
  wide: Record<"-1" | "1", Player[]>;
  backs: Player[];
}

export function offenseShape(players: Player[]): OffenseShape {
  const line = players.filter((p) => isLineman(p.id)).sort((a, b) => a.x - b.x);
  const center = [...line].sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0] ?? null;
  const edge = (t: 1 | -1) => (line.length ? (t === 1 ? line[line.length - 1]!.x : line[0]!.x) : t * 2.6);
  const others = players.filter((p) => !isLineman(p.id) && p.id !== "QB");
  const te = (t: 1 | -1) =>
    others.filter((p) => Math.abs(p.y) < 0.8 && Math.sign(p.x) === t && Math.abs(p.x - edge(t)) <= 2.2).sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0] ?? null;
  const teL = te(-1);
  const teR = te(1);
  const outer = (t: 1 | -1) => (t === 1 ? (teR?.x ?? edge(1)) : (teL?.x ?? edge(-1)));
  const wing = (t: 1 | -1) =>
    others.filter((p) => p !== teL && p !== teR && p.y <= -0.5 && p.y >= -2.2 && Math.sign(p.x) === t && Math.abs(p.x - outer(t)) <= 2.2)[0] ?? null;
  const wL = wing(-1);
  const wR = wing(1);
  const used = new Set([teL, teR, wL, wR].filter(Boolean));
  const wide = (t: 1 | -1) => others.filter((p) => !used.has(p) && Math.sign(p.x) === t && Math.abs(p.x) > Math.abs(outer(t)) + 2).sort((a, b) => Math.abs(b.x) - Math.abs(a.x));
  const backs = players.filter((p) => !isLineman(p.id) && !used.has(p) && p.y < -1.2 && Math.abs(p.x) <= 5);
  return { line, center, te: { "-1": teL, "1": teR }, wings: { "-1": wL, "1": wR }, wide: { "-1": wide(-1), "1": wide(1) }, backs };
}

/** The strong side: the tight end's side, else more receivers, else right. */
export function strongSide(shape: OffenseShape, play?: Pick<PlayData, "formation">): 1 | -1 {
  const r = (shape.te["1"] ? 2 : 0) + (shape.wings["1"] ? 1 : 0) + shape.wide["1"].length * 0.5;
  const l = (shape.te["-1"] ? 2 : 0) + (shape.wings["-1"] ? 1 : 0) + shape.wide["-1"].length * 0.5;
  if (r !== l) return r > l ? 1 : -1;
  if (play?.formation.strength === "left") return -1;
  return 1;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Line a front up against this offense, technique by technique. */
export function frontVs(front: BlockFront, players: Player[], play?: Pick<PlayData, "formation">): Defender[] {
  const shape = offenseShape(players);
  const s = strongSide(shape, play);
  const line = shape.line;
  const c = shape.center?.x ?? 0;
  // guard and tackle on a side (when the line is short, spread the usual splits)
  const nth = (t: 1 | -1, k: number) => {
    const onSide = line.filter((p) => (p.x - c) * t > 0.2).sort((a, b) => Math.abs(a.x - c) - Math.abs(b.x - c));
    return onSide[k]?.x ?? c + t * 1.3 * (k + 1);
  };
  const techX = (t: 1 | -1, tech: string): number => {
    const g = nth(t, 0);
    const tk = nth(t, 1);
    const te = shape.te[String(t) as "1" | "-1"];
    const wing = shape.wings[String(t) as "1" | "-1"];
    const end = te?.x ?? tk + t * 1.8;
    switch (tech) {
      case "0":
      case "00":
        return c;
      case "1":
      case "10":
        return c + t * 0.6;
      case "2i":
        return g - t * 0.35;
      case "2":
      case "20":
        return g;
      case "3":
        return g + t * 0.5;
      case "30":
        return g + t * 0.65;
      case "4i":
        return tk - t * 0.35;
      case "4":
      case "40":
        return tk;
      case "5":
      case "50":
        return tk + t * 0.5;
      case "7":
        return te ? te.x - t * 0.35 : tk + t * 1.3;
      case "6":
      case "60":
        return end;
      case "9":
        return (wing?.x ?? end) + t * 1;
      case "apex": {
        const slot = shape.wide[String(t) as "1" | "-1"].slice(-1)[0];
        return slot ? r1((slot.x + end) / 2) : end + t * 2.5;
      }
      default:
        return tk + t * 2;
    }
  };
  const { spots, safeties } = FRONT_SPOTS[front];
  const out: Defender[] = spots.map((sp) => {
    const t = (sp.side === "weak" ? -s : s) as 1 | -1;
    const x = r1(techX(t, sp.tech));
    const standUp = sp.level === "line" && sp.tech === "9";
    const label = sp.level === "backer" ? sp.name! : sp.tech === "0" ? "nose (0 technique)" : `${sp.tech} technique`;
    return { id: sp.id, label: sp.name && sp.level === "line" ? `${sp.name} (${sp.tech} technique)` : label, tech: sp.tech, level: sp.level, x, y: sp.level === "backer" ? (sp.tech === "apex" ? 4 : 4.5) : standUp ? 1.2 : 1 };
  });
  // corners on the widest receivers, safeties deep
  for (const t of [-1, 1] as const) {
    const wr = shape.wide[String(t) as "1" | "-1"][0];
    out.push({ id: t === -1 ? "LC" : "RC", label: "corner", tech: null, level: "back", x: r1(wr ? wr.x : t * 12), y: 6 });
  }
  if (safeties === 1) out.push({ id: "FS", label: "free safety", tech: null, level: "back", x: 0, y: 11 });
  else out.push({ id: "FS", label: "free safety", tech: null, level: "back", x: -s * 6, y: 11 }, { id: "SS", label: "strong safety", tech: null, level: "back", x: s * 6, y: 10 });
  return out;
}

// ---------- rules ----------

export const ROLES = ["PSTE", "PST", "PSG", "C", "BSG", "BST", "BSTE", "PSW", "BSW", "FB"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = {
  PSTE: "Play-side tight end",
  PST: "Play-side tackle",
  PSG: "Play-side guard",
  C: "Center",
  BSG: "Back-side guard",
  BST: "Back-side tackle",
  BSTE: "Back-side tight end",
  PSW: "Play-side wing",
  BSW: "Back-side wing",
  FB: "Fullback / H-back",
};

export const RULES = [
  "down",
  "base",
  "back",
  "hinge",
  "double",
  "climb",
  "zone",
  "reach",
  "cutoff",
  "pull_kick",
  "pull_wrap",
  "trap",
  "kick",
  "lead",
  "arc",
  "seal",
  "wedge",
  "release",
] as const;
export type Rule = (typeof RULES)[number];
export const RULE_LABEL: Record<Rule, string> = {
  down: "Block down (gap, down, backer)",
  base: "Base: the man on you",
  back: "Block back",
  hinge: "Hinge: protect the back side",
  double: "Double team, then climb",
  climb: "Climb to the linebacker",
  zone: "Zone: covered, block him; uncovered, climb",
  reach: "Reach the man on or outside you",
  cutoff: "Cut off the back side",
  pull_kick: "Pull and kick out",
  pull_wrap: "Pull and wrap up for the linebacker",
  trap: "Pull and trap the first man past the center",
  kick: "Kick out the end man",
  lead: "Lead through the hole on the linebacker",
  arc: "Arc to the force player",
  seal: "Seal the linebacker inside",
  wedge: "Wedge: drive to the aiming point",
  release: "Release (no block)",
};
/** How each rule reads to the blocker in a quiz explanation. */
const RULE_WHY: Record<Rule, string> = {
  down: "you block down: the first man inside you, or the backer if no one is there",
  base: "you base the man on you",
  back: "you block back for the pulling guard",
  hinge: "you hinge and protect the back side",
  double: "you double team and climb to the backer",
  climb: "you climb to the linebacker",
  zone: "you zone your play-side gap: block him if he's covering you, climb if not",
  reach: "you reach the man on or outside you",
  cutoff: "you cut off the back side",
  pull_kick: "you pull and kick out the end man",
  pull_wrap: "you pull and wrap up through the hole for the linebacker",
  trap: "you pull and trap the first man past the center",
  kick: "you kick out the end man on the line",
  lead: "you lead through the hole on the linebacker",
  arc: "you arc to the force player",
  seal: "you seal the linebacker inside",
  wedge: "you wedge to the aiming point",
  release: "you release",
};
export const ruleWhy = (r: Rule) => RULE_WHY[r];

/** Which hole the back aims at, play side. */
export const HOLES = ["A", "B", "C", "D", "edge"] as const;
export type Hole = (typeof HOLES)[number];

export interface Scheme {
  key: string;
  name: string;
  rules: Partial<Record<Role, Rule>>;
  hole: Hole;
}

/** Reps' usual rules for the runs most teams run. Every team can change them. */
export const SCHEME_LIBRARY: Scheme[] = [
  { key: "power", name: "Power", hole: "C", rules: { PSTE: "down", PST: "down", PSG: "down", C: "back", BSG: "pull_wrap", BST: "hinge", BSTE: "hinge", PSW: "down", BSW: "hinge", FB: "kick" } },
  { key: "counter", name: "Counter", hole: "C", rules: { PSTE: "down", PST: "down", PSG: "down", C: "back", BSG: "pull_kick", BST: "pull_wrap", BSTE: "hinge", PSW: "down", BSW: "hinge", FB: "hinge" } },
  { key: "inside_zone", name: "Inside zone", hole: "B", rules: { PSTE: "zone", PST: "zone", PSG: "zone", C: "zone", BSG: "zone", BST: "zone", BSTE: "cutoff", PSW: "zone", BSW: "cutoff", FB: "lead" } },
  { key: "outside_zone", name: "Outside zone", hole: "D", rules: { PSTE: "reach", PST: "reach", PSG: "reach", C: "reach", BSG: "reach", BST: "cutoff", BSTE: "cutoff", PSW: "reach", BSW: "cutoff", FB: "lead" } },
  { key: "zone_read", name: "Zone read", hole: "B", rules: { PSTE: "zone", PST: "zone", PSG: "zone", C: "zone", BSG: "zone", BST: "climb", BSTE: "release", PSW: "zone", BSW: "release", FB: "lead" } },
  { key: "trap", name: "Trap", hole: "A", rules: { PSTE: "climb", PST: "climb", PSG: "climb", C: "back", BSG: "trap", BST: "hinge", BSTE: "hinge", PSW: "down", BSW: "hinge", FB: "lead" } },
  { key: "iso", name: "Iso", hole: "B", rules: { PSTE: "base", PST: "base", PSG: "base", C: "base", BSG: "base", BST: "base", BSTE: "base", PSW: "base", BSW: "cutoff", FB: "lead" } },
  { key: "dive", name: "Dive", hole: "A", rules: { PSTE: "base", PST: "base", PSG: "base", C: "base", BSG: "base", BST: "base", BSTE: "base", PSW: "base", BSW: "cutoff", FB: "lead" } },
  { key: "wedge", name: "Wedge", hole: "A", rules: { PSTE: "wedge", PST: "wedge", PSG: "wedge", C: "wedge", BSG: "wedge", BST: "wedge", BSTE: "wedge", PSW: "wedge", BSW: "wedge", FB: "lead" } },
  { key: "buck_sweep", name: "Buck sweep", hole: "D", rules: { PSTE: "down", PST: "down", PSG: "pull_kick", C: "back", BSG: "pull_wrap", BST: "hinge", BSTE: "hinge", PSW: "down", BSW: "hinge", FB: "hinge" } },
  { key: "sweep", name: "Sweep / toss", hole: "edge", rules: { PSTE: "reach", PST: "reach", PSG: "reach", C: "reach", BSG: "cutoff", BST: "cutoff", BSTE: "cutoff", PSW: "arc", BSW: "cutoff", FB: "lead" } },
];

/** A library scheme that a play word or concept points to ("24 POWER" -> power). */
export function schemeForWords(text: string, schemes: Array<Pick<Scheme, "key" | "name"> & { words?: string[] }> = SCHEME_LIBRARY): string | null {
  const t = ` ${text.toUpperCase().replace(/[^A-Z0-9]+/g, " ")} `;
  for (const s of schemes) for (const w of s.words ?? []) if (w.trim() && t.includes(` ${w.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()} `)) return s.key;
  const usual: Array<[RegExp, string]> = [
    [/ (OUTSIDE ZONE|STRETCH|WIDE ZONE) /, "outside_zone"],
    [/ ZONE READ /, "zone_read"],
    [/ (INSIDE ZONE|ZONE|IZ) /, "inside_zone"],
    [/ (COUNTER|GT|CTR) /, "counter"],
    [/ POWER /, "power"],
    [/ TRAP /, "trap"],
    [/ (ISO|ISOLATION|LEAD) /, "iso"],
    [/ BUCK /, "buck_sweep"],
    [/ (SWEEP|TOSS|PITCH|JET) /, "sweep"],
    [/ WEDGE /, "wedge"],
    [/ DIVE /, "dive"],
  ];
  for (const [re, key] of usual) if (re.test(t) && schemes.some((s) => s.key === key)) return key;
  return null;
}

// ---------- resolving rules into blocks ----------

export interface ResolvedBlock {
  id: string;
  role: Role;
  rule: Rule;
  /** defender id, or null for no one */
  target: string | null;
  /** the coach fixed this one for this front */
  fixed: boolean;
  type: string;
  /** relative to the blocker */
  path: Point[];
}

export interface Resolved {
  front: BlockFront;
  side: 1 | -1;
  defenders: Defender[];
  blocks: ResolvedBlock[];
  carrier: { id: string; path: Point[] } | null;
}

/** Each blocker's role for a play going to side `t`. */
export function roles(shape: OffenseShape, t: 1 | -1, carrier: string | null): Array<{ p: Player; role: Role }> {
  const out: Array<{ p: Player; role: Role }> = [];
  const c = shape.center;
  if (c) out.push({ p: c, role: "C" });
  const side = (u: 1 | -1) => shape.line.filter((p) => p !== c && (p.x - (c?.x ?? 0)) * u > 0).sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
  const ps = side(t);
  const bs = side(-t as 1 | -1);
  if (ps[0]) out.push({ p: ps[0], role: "PSG" });
  if (ps[1]) out.push({ p: ps[1], role: "PST" });
  if (bs[0]) out.push({ p: bs[0], role: "BSG" });
  if (bs[1]) out.push({ p: bs[1], role: "BST" });
  const k = (u: 1 | -1) => String(u) as "1" | "-1";
  const pte = shape.te[k(t)];
  const bte = shape.te[k(-t as 1 | -1)];
  if (pte) out.push({ p: pte, role: "PSTE" });
  if (bte) out.push({ p: bte, role: "BSTE" });
  const pw = shape.wings[k(t)];
  const bw = shape.wings[k(-t as 1 | -1)];
  if (pw && pw.id !== carrier) out.push({ p: pw, role: "PSW" });
  if (bw && bw.id !== carrier) out.push({ p: bw, role: "BSW" });
  // the lead back: the back nearest the line who isn't carrying it
  const lead = shape.backs.filter((p) => p.id !== carrier && p.id !== "QB" && !isLineman(p.id)).sort((a, b) => b.y - a.y)[0];
  if (lead && Math.abs(lead.y) < 6) out.push({ p: lead, role: "FB" });
  return out;
}

/** Who carries it: the run's ball carrier, a back already given the carry, else the deepest back. */
export function carrierOf(data: PlayData, shape = offenseShape(data.players)): Player | null {
  const id = data.run_details?.ball_carrier;
  const named = id ? data.players.find((p) => p.id === id) : undefined;
  if (named) return named;
  const carrying = data.players.find((p) => p.assignment_type === "carry");
  if (carrying) return carrying;
  const backs = shape.backs.filter((p) => p.id !== "QB");
  return backs.sort((a, b) => a.y - b.y)[0] ?? data.players.find((p) => p.id === "QB") ?? null;
}

const TYPE: Record<Rule, string> = {
  down: "down",
  base: "base",
  back: "down",
  hinge: "base",
  double: "double",
  climb: "climb",
  zone: "zone",
  reach: "reach",
  cutoff: "zone",
  pull_kick: "kick_out",
  pull_wrap: "pull",
  trap: "kick_out",
  kick: "kick_out",
  lead: "lead",
  arc: "arc",
  seal: "seal",
  wedge: "base",
  release: "release",
};

/** A play's blocking, as stored on the play (PlayData.blocking). */
export type Blocking = NonNullable<PlayData["blocking"]>;

/**
 * Every blocker's block against a front: play side outside-in, then the
 * center and back side, then pullers and kickers, then whoever is left climbs.
 */
export function resolveBlocking(data: PlayData, blocking: Pick<Blocking, "rules" | "hole" | "side" | "fixes">, front: BlockFront): Resolved {
  const t: 1 | -1 = blocking.side === "left" ? -1 : 1;
  const shape = offenseShape(data.players);
  const defenders = frontVs(front, data.players, data);
  const carrier = carrierOf(data, shape);
  const who = roles(shape, t, carrier?.id ?? null);
  const fixes = blocking.fixes[front] ?? {};
  const ruleOf = (r: Role) => (RULES as readonly string[]).includes(blocking.rules[r] ?? "") ? (blocking.rules[r] as Rule) : undefined;
  const taken = new Map<string, number>();
  const take = (d: Defender | undefined | null) => {
    if (d) taken.set(d.id, (taken.get(d.id) ?? 0) + 1);
    return d ?? null;
  };
  const free = (d: Defender) => !taken.has(d.id);
  const dl = defenders.filter((d) => d.level === "line");
  const lbs = defenders.filter((d) => d.level === "backer");
  const ps = (x: number) => x * t; // how far play side
  const near = (p: Player, list: Defender[]) => [...list].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  const at = (r: Role) => who.find((w) => w.role === r)?.p;

  // the hole: between the play-side blockers the scheme names
  const g = at("PSG")?.x ?? t * 1.3;
  const tk = at("PST")?.x ?? t * 2.6;
  const te = at("PSTE")?.x ?? tk + t * 1.5;
  const holeX = { A: (shape.center?.x ?? 0) + t * 0.65, B: (g + tk) / 2, C: (tk + te) / 2, D: te + t * 1.2, edge: te + t * 4 }[blocking.hole];

  const out = new Map<string, ResolvedBlock>();
  const set = (p: Player, role: Role, rule: Rule, d: Defender | null, path?: Point[]) => {
    const target = d?.id ?? null;
    const to = d ? ([d.x - p.x - Math.sign(d.x - p.x) * 0.4, d.y - p.y - 0.7] as Point) : ([0, 1.2] as Point);
    out.set(p.id, { id: p.id, role, rule, target, fixed: false, type: TYPE[rule], path: path ?? [[0, 0], to] });
  };
  const pull = (p: Player, d: Defender | null, through: number): Point[] => {
    const end: Point = d ? [d.x - p.x - Math.sign(d.x - through || t) * 0.5, d.y - p.y - 0.7] : [through - p.x, 2];
    return [[0, 0], [0, -1], [through - p.x - t * 0.3, -1], end];
  };
  const climbPath = (p: Player, d: Defender | null): Point[] => (d ? [[0, 0], [t * 0.3, 0.8], [d.x - p.x, d.y - p.y - 0.8]] : [[0, 0], [t * 0.3, 2]]);
  const endMan = () => {
    const lineEdge = Math.max(...who.filter((w) => ["PST", "PSTE", "PSW"].includes(w.role)).map((w) => ps(w.p.x)), ps(tk));
    const onLine = dl.filter((d) => free(d) && ps(d.x) > 0).sort((a, b) => ps(b.x) - ps(a.x))[0];
    if (onLine && ps(onLine.x) >= lineEdge - 1) return onLine;
    return onLine ?? lbs.filter((d) => free(d) && ps(d.x) >= ps(tk) - 0.5).sort((a, b) => ps(b.x) - ps(a.x))[0] ?? null;
  };
  const playSideBacker = () => lbs.filter(free).sort((a, b) => Math.abs(a.x - holeX) - Math.abs(b.x - holeX))[0] ?? null;
  // the coach's fixes come first: their men are taken, and everyone else works around them
  const fixedIds = new Set(Object.keys(fixes).filter((id) => who.some((w) => w.p.id === id)));
  for (const id of fixedIds) {
    const d = fixes[id] ? defenders.find((x) => x.id === fixes[id]) : undefined;
    if (d) take(d);
  }
  const later: Array<() => void> = [];
  const climbs: Array<{ p: Player; role: Role; rule: Rule }> = [];

  const order: Role[] = ["PSW", "PSTE", "PST", "PSG", "C", "BSG", "BST", "BSTE", "BSW", "FB"];
  const pass1 = who.filter((w) => ruleOf(w.role) && !fixedIds.has(w.p.id)).sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  for (const { p, role } of pass1) {
    const rule = ruleOf(role)!;
    // toward the center from where he stands
    const inward = role.startsWith("B") ? -t : t;
    // the first man inside him: no further in than the next blocker inside, and never across the center
    const nextIn = Math.min(...who.filter((w) => w.p !== p && Math.abs(w.p.y) < 0.8 && (w.p.x - p.x) * inward < -0.2).map((w) => Math.abs(w.p.x - p.x)), 1.6);
    const cx = shape.center?.x ?? 0;
    const inside = (d: Defender) => {
      const dx = (d.x - p.x) * inward;
      return dx <= -0.15 && dx >= -(nextIn + 0.4) && (d.x - cx) * inward >= -0.3;
    };
    // up to a linebacker: matched nearest-first across the whole line once the line blocks are set
    const climb = () => climbs.push({ p, role, rule });
    switch (rule) {
      case "down": {
        const d = near(p, dl.filter((x) => free(x) && inside(x)))[0];
        if (d) set(p, role, rule, take(d));
        else climb();
        break;
      }
      case "back": {
        const d = near(p, dl.filter((x) => free(x) && (x.x - p.x) * -t >= -0.3 && (x.x - p.x) * -t <= 1.8))[0];
        if (d) set(p, role, rule, take(d));
        else climb();
        break;
      }
      case "base":
      case "wedge": {
        const d = near(p, dl.filter((x) => free(x) && Math.abs(x.x - p.x) <= 0.8))[0];
        if (d) set(p, role, rule, take(d), rule === "wedge" ? [[0, 0], [(holeX - p.x) * 0.3, 1]] : undefined);
        else climb();
        break;
      }
      case "hinge":
      case "cutoff": {
        // the man on him or in his play-side gap; else the one outside him
        const d =
          near(p, dl.filter((x) => free(x) && ps(x.x - p.x) >= -0.4 && ps(x.x - p.x) <= 1.6))[0] ??
          near(p, dl.filter((x) => free(x) && Math.abs(x.x - p.x) <= 1.6))[0] ??
          // a back filling for a puller: the first man left on the back side
          (role === "FB" ? near(p, dl.filter((x) => free(x) && ps(x.x) < 0 && Math.abs(x.x - p.x) <= 4))[0] : undefined);
        set(p, role, rule, take(d ?? null), d ? [[0, 0], [d.x - p.x - t * 0.2, d.y - p.y - 0.7]] : [[0, 0], [t * 0.4, -0.6]]);
        break;
      }
      case "zone":
      case "reach": {
        const outside = rule === "reach" ? 1.8 : 1;
        const d = near(p, dl.filter((x) => free(x) && ps(x.x - p.x) >= -0.2 && ps(x.x - p.x) <= outside))[0];
        if (d) set(p, role, rule, take(d), [[0, 0], [t * 0.5, 0.4], [d.x - p.x + t * 0.3, d.y - p.y - 0.7]]);
        else climb();
        break;
      }
      case "double": {
        const d = near(p, dl.filter((x) => Math.abs(x.x - p.x) <= 1.4))[0] ?? null;
        take(d);
        later.push(() => {
          const b = near(p, lbs.filter(free))[0] ?? null;
          take(b);
          set(p, role, rule, d ?? b, d && b ? [[0, 0], [d.x - p.x, d.y - p.y - 0.7], [b.x - p.x, b.y - p.y - 0.8]] : undefined);
        });
        break;
      }
      case "climb":
        climb();
        break;
      default:
        break;
    }
  }
  // kick-outs and traps take the end man / first man past the center
  for (const { p, role } of who) {
    const rule = fixedIds.has(p.id) ? undefined : ruleOf(role);
    if (rule === "pull_kick" || rule === "kick") {
      const d = take(endMan());
      set(p, role, rule, d, rule === "pull_kick" ? pull(p, d, d ? d.x - t * 0.8 : holeX) : undefined);
    } else if (rule === "trap") {
      const d = take(dl.filter((x) => free(x) && ps(x.x - (shape.center?.x ?? 0)) > 0).sort((a, b) => ps(a.x) - ps(b.x))[0] ?? null);
      set(p, role, rule, d, pull(p, d, d ? d.x - t * 0.6 : holeX));
    }
  }
  // through the hole for a linebacker
  for (const { p, role } of who) {
    const rule = fixedIds.has(p.id) ? undefined : ruleOf(role);
    if (rule === "pull_wrap") {
      const d = take(playSideBacker());
      set(p, role, rule, d, pull(p, d, holeX));
    } else if (rule === "lead" || rule === "seal") {
      const d = take(rule === "seal" ? (lbs.filter((x) => free(x) && ps(x.x) <= ps(holeX)).sort((a, b) => ps(b.x) - ps(a.x))[0] ?? null) : playSideBacker());
      set(p, role, rule, d, d ? [[0, 0], [holeX - p.x, -p.y], [d.x - p.x, d.y - p.y - 0.8]] : undefined);
    } else if (rule === "arc") {
      const d = take(defenders.filter((x) => free(x) && x.level !== "line" && ps(x.x) > ps(te)).sort((a, b) => a.y - b.y || ps(a.x) - ps(b.x))[0] ?? null);
      set(p, role, rule, d, d ? [[0, 0], [t * 1.5, 1], [d.x - p.x, d.y - p.y - 0.8]] : undefined);
    }
  }
  // climbers: the closest blocker and backer pair first, so the center takes the backer over him and the tackle doesn't run across the field
  while (climbs.length) {
    let best: { i: number; d: Defender; dist: number } | null = null;
    climbs.forEach((c, i) =>
      lbs.filter(free).forEach((d) => {
        const dist = Math.hypot(d.x - c.p.x, d.y - c.p.y);
        if (!best || dist < best.dist) best = { i, d, dist };
      }),
    );
    if (!best) break;
    const { i, d } = best as { i: number; d: Defender };
    const c = climbs.splice(i, 1)[0]!;
    take(d);
    set(c.p, c.role, c.rule, d, climbPath(c.p, d));
  }
  for (const c of climbs) set(c.p, c.role, c.rule, null, climbPath(c.p, null));
  for (const f of later) f();
  for (const { p, role } of who) {
    const rule = ruleOf(role);
    if (rule === "release" || !rule) continue;
    if (!out.has(p.id)) set(p, role, rule, null);
  }

  // the coach's fixes for this front win
  for (const [id, target] of Object.entries(fixes)) {
    const b = out.get(id);
    const p = data.players.find((x) => x.id === id);
    if (!b || !p) continue;
    const d = target ? defenders.find((x) => x.id === target) ?? null : null;
    const pulling = b.rule === "pull_kick" || b.rule === "pull_wrap" || b.rule === "trap";
    out.set(id, {
      ...b,
      target: d?.id ?? null,
      fixed: true,
      path: d ? (pulling ? pull(p, d, holeX) : [[0, 0], [d.x - p.x - Math.sign(d.x - p.x) * 0.4, d.y - p.y - 0.7]]) : [[0, 0], [0, 1.2]],
    });
  }

  let carry: Resolved["carrier"] = null;
  if (carrier) {
    const step: Point | null = carrier.y < -3 && carrier.id !== "QB" ? [r1((holeX - carrier.x) * 0.25), r1(-carrier.y * 0.35)] : null;
    const path: Point[] = [[0, 0]];
    if (step) path.push(step);
    path.push([r1(holeX - carrier.x), r1(-carrier.y)], [r1(holeX - carrier.x + (blocking.hole === "edge" || blocking.hole === "D" ? t * 2 : 0)), r1(-carrier.y + 5)]);
    carry = { id: carrier.id, path };
  }
  const blocks = who.map((w) => out.get(w.p.id)).filter((b): b is ResolvedBlock => Boolean(b));
  return { front, side: t, defenders, blocks, carrier: carry };
}

/** The play's players with every blocker's block (and the carrier's path) for one front. */
export function applyBlocking(data: PlayData, blocking: Blocking, front: BlockFront): Player[] {
  const r = resolveBlocking(data, blocking, front);
  return data.players.map((p) => {
    const b = r.blocks.find((x) => x.id === p.id);
    if (b) return { ...p, assignment_type: "block" as const, route: null, path: null, line: null, block: { type: b.type, target: b.target, path: b.path } };
    if (r.carrier && r.carrier.id === p.id) return { ...p, assignment_type: "carry" as const, route: null, block: null, line: null, path: r.carrier.path };
    return p;
  });
}

/** A new blocking for a play from a scheme. */
export function newBlocking(scheme: Scheme, side: "left" | "right", front: string = "4-3"): Blocking {
  return { scheme: scheme.key, name: scheme.name, rules: { ...scheme.rules } as Record<string, string>, hole: scheme.hole, side, front, fixes: {}, checked: [] };
}

/** The fronts a play is checked against (its main front first). */
export const blockingFronts = (b: Pick<Blocking, "front" | "checked">): BlockFront[] => [...new Set([b.front, ...b.checked])].filter(frontOk);

// ---------- the team's own schemes ----------

export interface TeamScheme extends Scheme {
  /** play words that use this scheme ("POWER", "24/25") */
  words: string[];
}
/** Stored on the team: schemes the coach changed or added, and the fronts the team sees. */
export interface TeamBlocking {
  schemes?: TeamScheme[];
  fronts?: string[];
}

/** Reps' schemes with the coach's changes, plus any he added. */
export function teamSchemes(tb: TeamBlocking | null | undefined): TeamScheme[] {
  const own = tb?.schemes ?? [];
  const base = SCHEME_LIBRARY.map((s) => own.find((o) => o.key === s.key) ?? { ...s, words: [] });
  return [...base, ...own.filter((o) => !SCHEME_LIBRARY.some((s) => s.key === o.key))];
}

export const teamFronts = (tb: TeamBlocking | null | undefined): BlockFront[] => {
  const f = (tb?.fronts ?? []).filter(frontOk);
  return f.length ? f : DEFAULT_FRONTS;
};

/** A scheme's rules copied onto a play's blocking (fixes and checked fronts kept). */
export function withScheme(b: Blocking, s: Scheme): Blocking {
  return { ...b, scheme: s.key, name: s.name, rules: { ...s.rules } as Record<string, string>, hole: s.hole };
}
