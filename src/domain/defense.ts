/**
 * Defensive looks the app draws against a play: a front, a coverage shell,
 * zone drops or man matchups, and the named roles a QB reads (option keys,
 * RPO conflict defenders). Generated from the offense's alignment; nothing
 * here is extracted from the PDF.
 *
 * Geometry matches play.ts: yards from the ball, y > 0 is the defense's side.
 */
import type { Coverage, PlayData, Player } from "./play";

export const FRONTS = ["4-3", "4-2-5", "3-4", "5-3", "4-4"] as const;
export type Front = (typeof FRONTS)[number];

export interface Defender {
  id: string;
  /** read-key roles this defender fills (relative to the play side) */
  roles: string[];
  label: string;
  x: number;
  y: number;
}

export interface Zone {
  label: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export interface DefensiveLook {
  front: Front;
  coverage: Coverage;
  defenders: Defender[];
  zones: Zone[];
  /** man coverage: defender id -> offensive player id */
  man: Record<string, string>;
  blitzers: string[];
}

export interface ReadKeyDef {
  key: string;
  label: string;
  short: string;
}

export const READ_KEYS: ReadKeyDef[] = [
  { key: "backside_de", label: "Backside defensive end", short: "BS end" },
  { key: "playside_de", label: "Playside defensive end", short: "PS end" },
  { key: "playside_olb", label: "Playside outside linebacker / apex", short: "PS apex" },
  { key: "backside_olb", label: "Backside outside linebacker", short: "BS OLB" },
  { key: "mike", label: "Middle linebacker", short: "Mike" },
  { key: "playside_dt", label: "Playside defensive tackle (dive key)", short: "PS tackle" },
  { key: "playside_safety", label: "Playside safety", short: "PS safety" },
  { key: "playside_corner", label: "Playside corner", short: "PS corner" },
  { key: "flat_defender", label: "Flat defender", short: "Flat" },
];
export const READ_KEY_BY_KEY = new Map(READ_KEYS.map((k) => [k.key, k]));

/** How a read key can react at the snap, and what each looks like. */
export const REACTIONS = [
  { key: "crashes", label: "Crashes inside / chases the back" },
  { key: "stays_home", label: "Stays wide / sits on the edge" },
  { key: "attacks_qb", label: "Comes up the field at the QB" },
  { key: "takes_pitch", label: "Widens with the pitch man" },
  { key: "fits_run", label: "Fills the run gap" },
  { key: "drops", label: "Drops into coverage" },
  { key: "tackles_dive", label: "Closes on the dive" },
] as const;
export type ReactionKey = (typeof REACTIONS)[number]["key"];

/** Receivers per side, outside-in, for aligning corners and apex players. */
function receiversBySide(play: PlayData) {
  const skill = play.players.filter((p) => !/^(LT|LG|C|RG|RT|OL|T|G|QB)$/.test(p.id));
  const eligible = skill.filter((p) => Math.abs(p.x) > 3.5 || p.y > -0.6);
  const left = eligible.filter((p) => p.x < -3.5).sort((a, b) => a.x - b.x);
  const right = eligible.filter((p) => p.x > 3.5).sort((a, b) => b.x - a.x);
  return { left, right };
}

export function strengthSign(play: PlayData): 1 | -1 {
  if (play.formation.strength === "left") return -1;
  if (play.formation.strength === "right") return 1;
  const { left, right } = receiversBySide(play);
  return left.length > right.length ? -1 : 1;
}

/** Which way the play goes, +1 right / -1 left (run direction, else strength). */
export function playSideSign(play: PlayData): 1 | -1 {
  const carrierId = play.run_details?.ball_carrier;
  const carrier = carrierId ? play.players.find((p) => p.id === carrierId) : undefined;
  const path = carrier?.path;
  if (path && path.length >= 2) {
    const dx = path[path.length - 1]![0] - path[0]![0];
    if (Math.abs(dx) > 0.5) return dx > 0 ? 1 : -1;
  }
  const poa = play.run_details?.point_of_attack ?? "";
  const hole = Number.parseInt(poa, 10);
  // Common even/odd numbering: even holes right, odd holes left.
  if (Number.isFinite(hole)) return hole % 2 === 0 ? 1 : -1;
  if (/right|rt\b/i.test(poa)) return 1;
  if (/left|lt\b/i.test(poa)) return -1;
  return strengthSign(play);
}

export function buildLook(play: PlayData, coverage: Coverage, front: Front = "4-3"): DefensiveLook {
  const s = strengthSign(play);
  const ps = playSideSign(play);
  const { left, right } = receiversBySide(play);
  const strong = s === 1 ? right : left;
  const weak = s === 1 ? left : right;
  const d: Defender[] = [];
  const add = (id: string, label: string, x: number, y: number, roles: string[] = []) =>
    d.push({ id, label, x, y, roles });
  const sideRole = (x: number, base: string) => `${Math.sign(x) === ps ? "playside" : "backside"}_${base}`;

  // Front
  const lineWidth = 4.5;
  if (front === "3-4") {
    add("N", "N", 0, 1, []);
    add("DE1", "E", s * 3, 1, [sideRole(s * 3, "dt")]);
    add("DE2", "E", -s * 3, 1, []);
    add("OLB1", "S", s * 5.5, 1.5, [sideRole(s * 5.5, "de"), sideRole(s * 5.5, "olb")]);
    add("OLB2", "W", -s * 5.5, 1.5, [sideRole(-s * 5.5, "de"), sideRole(-s * 5.5, "olb")]);
    add("ILB1", "M", s * 1.5, 4.5, ["mike"]);
    add("ILB2", "B", -s * 1.5, 4.5, []);
  } else if (front === "5-3") {
    add("N", "N", 0, 1, []);
    add("DT1", "T", s * 2.5, 1, [sideRole(s * 2.5, "dt")]);
    add("DT2", "T", -s * 2.5, 1, []);
    add("DE1", "E", s * lineWidth, 1, [sideRole(s * lineWidth, "de")]);
    add("DE2", "E", -s * lineWidth, 1, [sideRole(-s * lineWidth, "de")]);
    add("S", "S", s * 4, 4.5, [sideRole(s * 4, "olb")]);
    add("M", "M", 0, 4.5, ["mike"]);
    add("W", "W", -s * 4, 4.5, [sideRole(-s * 4, "olb")]);
  } else {
    add("DT1", "T", s * 2.3, 1, [sideRole(s * 2.3, "dt")]);
    add("DT2", "N", -s * 0.7, 1, []);
    add("DE1", "E", s * lineWidth, 1, [sideRole(s * lineWidth, "de")]);
    add("DE2", "E", -s * lineWidth, 1, [sideRole(-s * lineWidth, "de")]);
    if (front === "4-2-5") {
      add("M", "M", s * 1, 4.5, ["mike"]);
      add("W", "W", -s * 2, 4.5, []);
      const slot = strong[1] ?? strong[0];
      const nx = slot ? (slot.x + s * 3) / 2 : s * 7;
      add("NB", "$", nx, 4, [sideRole(nx, "olb"), "flat_defender"]);
    } else if (front === "4-4") {
      add("S", "S", s * 6, 3.5, [sideRole(s * 6, "olb"), "flat_defender"]);
      add("M", "M", s * 1, 4.5, ["mike"]);
      add("B", "B", -s * 1.5, 4.5, []);
      add("W", "W", -s * 6, 3.5, [sideRole(-s * 6, "olb")]);
    } else {
      add("S", "S", s * 5.5, 4.5, [sideRole(s * 5.5, "olb"), "flat_defender"]);
      add("M", "M", 0, 4.5, ["mike"]);
      add("W", "W", -s * 3.5, 4.5, [sideRole(-s * 3.5, "olb")]);
    }
  }

  // Secondary
  const press = coverage === "cover_0" || coverage === "cover_1";
  const cbDepth = press ? 1.5 : coverage === "cover_2" ? 5 : 7;
  const cb1x = strong[0]?.x ?? s * 18;
  const cb2x = weak[0]?.x ?? -s * 18;
  add("CB1", "C", cb1x + (press ? 0 : s * 0.5), cbDepth, [Math.sign(cb1x) === ps ? "playside_corner" : "backside_corner"]);
  add("CB2", "C", cb2x + (press ? 0 : -s * 0.5), cbDepth, [Math.sign(cb2x) === ps ? "playside_corner" : "backside_corner"]);
  const safety = (id: string, x: number, y: number) =>
    add(id, id === "FS" ? "F" : "SS", x, y, [Math.sign(x) === ps ? "playside_safety" : "backside_safety"]);
  const zones: Zone[] = [];
  const man: Record<string, string> = {};
  const blitzers: string[] = [];

  switch (coverage) {
    case "cover_0":
      safety("SS", s * 4, 5);
      safety("FS", -s * 4, 6);
      blitzers.push("SS", d.find((x) => x.id === "M") ? "M" : "ILB1");
      break;
    case "cover_1":
      safety("FS", 0, 12);
      safety("SS", s * 5, 6);
      zones.push({ label: "Deep middle", x: 0, y: 15, rx: 9, ry: 4 });
      break;
    case "cover_2":
      safety("FS", -s * 10, 12);
      safety("SS", s * 10, 12);
      zones.push(
        { label: "Deep half", x: -13, y: 16, rx: 12, ry: 4 },
        { label: "Deep half", x: 13, y: 16, rx: 12, ry: 4 },
        { label: "Flat", x: -19, y: 4, rx: 6, ry: 3 },
        { label: "Flat", x: 19, y: 4, rx: 6, ry: 3 },
        { label: "Hook", x: -7, y: 7, rx: 5, ry: 3 },
        { label: "Middle", x: 0, y: 8, rx: 4, ry: 3 },
        { label: "Hook", x: 7, y: 7, rx: 5, ry: 3 },
      );
      break;
    case "cover_3":
      safety("FS", 0, 13);
      safety("SS", s * 7, 7);
      zones.push(
        { label: "Deep third", x: -18, y: 17, rx: 8, ry: 4 },
        { label: "Deep third", x: 0, y: 18, rx: 8, ry: 4 },
        { label: "Deep third", x: 18, y: 17, rx: 8, ry: 4 },
        { label: "Curl/flat", x: -15, y: 5, rx: 6, ry: 3 },
        { label: "Hook", x: -5, y: 7, rx: 4, ry: 3 },
        { label: "Hook", x: 5, y: 7, rx: 4, ry: 3 },
        { label: "Curl/flat", x: 15, y: 5, rx: 6, ry: 3 },
      );
      break;
    case "cover_4":
      safety("FS", -s * 8, 10);
      safety("SS", s * 8, 10);
      zones.push(
        { label: "Deep quarter", x: -20, y: 16, rx: 6, ry: 4 },
        { label: "Deep quarter", x: -7, y: 17, rx: 6, ry: 4 },
        { label: "Deep quarter", x: 7, y: 17, rx: 6, ry: 4 },
        { label: "Deep quarter", x: 20, y: 16, rx: 6, ry: 4 },
        { label: "Flat", x: -15, y: 4, rx: 5, ry: 3 },
        { label: "Hook", x: 0, y: 6, rx: 7, ry: 3 },
        { label: "Flat", x: 15, y: 4, rx: 5, ry: 3 },
      );
      break;
  }

  if (coverage === "cover_0" || coverage === "cover_1") {
    // Man: corners on the widest receivers, the rest to the nearest eligible.
    const targets = [...strong, ...weak];
    const coverers = d.filter((x) => !blitzers.includes(x.id) && x.id !== "FS" && x.y > 2);
    const taken = new Set<string>();
    for (const t of targets.sort((a, b) => Math.abs(b.x) - Math.abs(a.x))) {
      const best = coverers
        .filter((c) => !Object.keys(man).includes(c.id))
        .sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0];
      if (best && !taken.has(t.id)) {
        man[best.id] = t.id;
        taken.add(t.id);
      }
    }
  }

  return { front, coverage, defenders: d, zones, man, blitzers };
}

export function defenderForKey(look: DefensiveLook, key: string): Defender | undefined {
  return look.defenders.find((x) => x.roles.includes(key));
}

export const COVERAGE_LABEL: Record<Coverage, string> = {
  cover_0: "Cover 0",
  cover_1: "Cover 1",
  cover_2: "Cover 2",
  cover_3: "Cover 3",
  cover_4: "Cover 4",
};

export const COVERAGE_TELL: Record<Coverage, string> = {
  cover_0: "no deep safety, everyone is up — expect pressure and man",
  cover_1: "one high safety in the middle, corners pressed — man underneath",
  cover_2: "two high safeties split wide, corners squatting — the hole is between the corner and the safety",
  cover_3: "one high safety, corners off and bailing to deep thirds — the flats and hitches are open",
  cover_4: "two high safeties sitting at ten, corners deep — the short and intermediate middle is open",
};

/** Which offensive players this defender could be keyed on (for the "tap a defender" UI). */
export function nearestOffense(def: Defender, players: Player[]): Player | undefined {
  return [...players].sort(
    (a, b) => Math.hypot(a.x - def.x, a.y - def.y) - Math.hypot(b.x - def.x, b.y - def.y),
  )[0];
}
