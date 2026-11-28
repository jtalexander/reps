/**
 * Reading a formation from where the offense stands before the snap.
 * Plain geometry on play-frame yards (ball at 0,0; x to the offense's right;
 * y downfield, so the backfield is negative). The players are anonymous
 * points: on film nobody has a letter.
 *
 * Every answer carries a confidence from 0 to 1: how far the closest call
 * was from going the other way. A player a foot from a cut-off gives a low
 * number; one three yards clear gives a high one.
 */
import type { PlayPoint } from "@/shared/field";

/** Every cut-off the rules use, in yards. One place, so the noise test can say which ones are fragile. */
export const FORMATION_RULES = {
  /** a player this close to the line of scrimmage is on it */
  onLineDepth: 1.25,
  /** the center is within this of the ball */
  centerReach: 2,
  /** a guard or tackle is within this of the center's depth */
  lineDepthSlack: 1.5,
  /** linemen stand shoulder to shoulder: the next man in the row is within this */
  lineGap: 3,
  /** a tight end is on the line within this of the tackle */
  tightEndGap: 2.5,
  /** a wing is off the line within this of the end of the line */
  wingGap: 2.5,
  /** a wing is no deeper than this */
  wingDepth: 3,
  /** the quarterback is within this of the center, side to side */
  qbReach: 1.25,
  /** under center when no deeper than this */
  underCenterDepth: 2,
  /** the quarterback is no deeper than this */
  qbMaxDepth: 8,
  /** a back is at least this deep, inside the box */
  backDepth: 1.5,
  /** the box reaches this far outside the end of the line */
  boxPad: 1,
  /** a back within this of the quarterback, side to side, is behind him */
  behindReach: 0.75,
} as const;
export type FormationRules = { [K in keyof typeof FORMATION_RULES]: number };

export type Role = "center" | "line" | "tight_end" | "wing" | "split" | "slot" | "qb" | "back";
export type Strength = "left" | "right" | "balanced";
export type QbSpot = "under_center" | "pistol" | "gun" | "none";
export const QB_LABEL: Record<QbSpot, string> = { under_center: "Under center", pistol: "Pistol", gun: "Gun", none: "No quarterback behind the center" };

/** How the backs are set, apart from where the quarterback is. */
export const BACK_SETS = ["empty", "behind", "left", "right", "i", "split", "offset_i_left", "offset_i_right", "two_left", "two_right", "three"] as const;
export type BackSet = (typeof BACK_SETS)[number];
export const BACK_SET_LABEL: Record<BackSet, string> = {
  empty: "Empty",
  behind: "One back, behind the QB",
  left: "One back, left of the QB",
  right: "One back, right of the QB",
  i: "Two backs, both behind (I)",
  split: "Two backs, one each side",
  offset_i_left: "Two backs, one behind and one left",
  offset_i_right: "Two backs, one behind and one right",
  two_left: "Two backs, both left",
  two_right: "Two backs, both right",
  three: "Three backs",
};

export interface RoledPlayer extends PlayPoint {
  role: Role;
  /** which side of the center he is on */
  side: "left" | "right" | "middle";
}

export interface FormationRead {
  players: RoledPlayer[];
  /** receivers on each side: tight ends, wings, split ends and slots */
  receivers: { left: number; right: number };
  /** the bigger side first: "3x1", "2x2" */
  shape: string;
  strength: Strength;
  qb: QbSpot;
  backs: BackSet;
  /** backs then tight ends, the usual way: "11" is one back, one tight end. Null when it can't tell. */
  personnel: string | null;
  confidence: { shape: number; strength: number; qb: number; backs: number; personnel: number };
  /** anything that looked wrong: not eleven players, no center found, more than four off the line */
  notes: string[];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Read a formation from the offense's pre-snap spots. */
export function readFormation(offense: PlayPoint[], rules: FormationRules = FORMATION_RULES): FormationRead {
  const notes: string[] = [];
  const role = new Map<PlayPoint, Role>();
  // closest calls, in yards, for each answer
  const calls = { receivers: [] as number[], qb: [] as number[], backs: [] as number[], ends: [] as number[] };
  const depth = (p: PlayPoint) => -p.y;
  const onLine = (p: PlayPoint) => depth(p) <= rules.onLineDepth;

  if (offense.length !== 11) notes.push(`${offense.length} offensive players marked, not 11.`);

  // the man nearest the ball anchors the line (he is the center or, if the marks are rough, the man beside him)
  const nearest = [...offense].sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
  const anchor = nearest && Math.hypot(nearest.x, nearest.y) <= rules.centerReach ? nearest : null;
  if (!anchor) notes.push("No one is over the ball.");

  // the row: everyone shoulder to shoulder with him, level with him, no gap bigger than a line split
  // (a man straight behind him is the quarterback under center, never part of the row)
  const row: PlayPoint[] = anchor ? [anchor] : [];
  if (anchor) {
    const underCenter = (p: PlayPoint) => Math.abs(p.x - anchor.x) <= rules.behindReach && anchor.y - p.y > 0.5;
    const level = offense.filter((p) => p !== anchor && !underCenter(p) && Math.abs(p.y - anchor.y) <= rules.lineDepthSlack);
    for (const sign of [-1, 1]) {
      let edge = anchor.x;
      for (const p of level.filter((q) => (q.x - anchor.x) * sign > 0).sort((q, w) => (q.x - w.x) * sign)) {
        if (Math.abs(p.x - edge) > rules.lineGap) break;
        if (sign < 0) row.unshift(p);
        else row.push(p);
        edge = p.x;
      }
    }
  }
  // the five interior linemen: the five in a row centered best on the ball. Using all five, not one man, is what
  // keeps a rough mark on the center from shifting the whole line over.
  let line = row;
  if (row.length > 5) {
    const windows = Array.from({ length: row.length - 4 }, (_, i) => row.slice(i, i + 5));
    line = windows.sort((a, b) => Math.abs(a.reduce((t, p) => t + p.x, 0)) - Math.abs(b.reduce((t, p) => t + p.x, 0)))[0]!;
  }
  const linemen = line.length;
  const center = line.length === 5 ? line[2]! : anchor;
  const cx = line.length === 5 ? line.reduce((t, p) => t + p.x, 0) / 5 : (anchor?.x ?? 0);
  for (const p of line) role.set(p, p === center ? "center" : "line");

  // tight ends: on the line, tight to the tackle
  const lineEnd = { left: line[0]?.x ?? cx, right: line[line.length - 1]?.x ?? cx };
  for (const side of ["left", "right"] as const) {
    const sign = side === "left" ? -1 : 1;
    let edge = lineEnd[side];
    for (let k = 0; k < 2; k++) {
      const next = offense.filter((p) => !role.has(p) && onLine(p) && (p.x - edge) * sign > 0).sort((a, b) => (a.x - edge) * sign - (b.x - edge) * sign)[0];
      if (!next) break;
      const gap = Math.abs(next.x - edge);
      calls.ends.push(Math.abs(gap - rules.tightEndGap));
      if (gap > rules.tightEndGap) break;
      role.set(next, "tight_end");
      edge = next.x;
    }
    lineEnd[side] = edge;
  }
  if (linemen !== 5) notes.push(`Found ${linemen} interior linemen, not 5.`);

  // the quarterback: the first man straight behind the center
  const cy = center?.y ?? 0;
  const qb =
    offense
      .filter((p) => !role.has(p) && Math.abs(p.x - cx) <= rules.qbReach && cy - p.y > 0.4 && cy - p.y <= rules.qbMaxDepth)
      .sort((a, b) => b.y - a.y)[0] ?? null;
  if (qb) {
    role.set(qb, "qb");
    calls.qb.push(rules.qbReach - Math.abs(qb.x - cx));
  } else notes.push("No one is straight behind the center.");

  // everyone else: a back (deep, inside the box), a wing (off the line, tight to its end), or a receiver
  for (const p of offense) {
    if (role.has(p)) continue;
    const inBox = p.x >= lineEnd.left - rules.boxPad && p.x <= lineEnd.right + rules.boxPad;
    const boxEdge = Math.min(Math.abs(p.x - (lineEnd.left - rules.boxPad)), Math.abs(p.x - (lineEnd.right + rules.boxPad)));
    const deep = depth(p) >= rules.backDepth;
    if (inBox && deep) {
      role.set(p, "back");
      calls.receivers.push(Math.min(boxEdge, depth(p) - rules.backDepth));
      continue;
    }
    const outside = p.x < cx ? lineEnd.left - p.x : p.x - lineEnd.right;
    if (!onLine(p) && outside > 0 && outside <= rules.wingGap && depth(p) <= rules.wingDepth) {
      role.set(p, "wing");
      calls.ends.push(Math.min(rules.wingGap - outside, rules.wingDepth - depth(p)));
    } else {
      role.set(p, onLine(p) ? "split" : "slot");
      if (outside > 0) calls.ends.push(Math.abs(outside - rules.wingGap));
    }
    // how close he was to counting as a back instead
    calls.receivers.push(inBox ? rules.backDepth - depth(p) : boxEdge);
  }

  const players: RoledPlayer[] = offense.map((p) => ({ x: p.x, y: p.y, role: role.get(p)!, side: Math.abs(p.x - cx) < 0.5 ? "middle" : p.x < cx ? "left" : "right" }));
  const isReceiver = (r: Role) => r === "tight_end" || r === "wing" || r === "split" || r === "slot";
  const count = (side: "left" | "right", pick: (r: Role) => boolean) => players.filter((p) => pick(p.role) && (p.x < cx ? "left" : "right") === side).length;
  const receivers = { left: count("left", isReceiver), right: count("right", isReceiver) };
  const shape = `${Math.max(receivers.left, receivers.right)}x${Math.min(receivers.left, receivers.right)}`;

  // strength: more receivers; a tie goes to the tight end's side, then the wing's
  const tie = (pick: (r: Role) => boolean): Strength => {
    const [l, r] = [count("left", pick), count("right", pick)];
    return l === r ? "balanced" : l > r ? "left" : "right";
  };
  let strength = tie(isReceiver);
  if (strength === "balanced") strength = tie((r) => r === "tight_end");
  if (strength === "balanced") strength = tie((r) => r === "wing");

  // the backfield
  const backs = players.filter((p) => p.role === "back").sort((a, b) => b.y - a.y);
  const ref = qb?.x ?? cx;
  const where = (b: PlayPoint): "left" | "right" | "behind" => {
    const dx = b.x - ref;
    calls.backs.push(Math.abs(Math.abs(dx) - rules.behindReach));
    return Math.abs(dx) <= rules.behindReach ? "behind" : dx < 0 ? "left" : "right";
  };
  const spots = backs.map(where);
  const n = (w: string) => spots.filter((s) => s === w).length;
  let backSet: BackSet;
  if (backs.length === 0) backSet = "empty";
  else if (backs.length === 1) backSet = spots[0]!;
  else if (backs.length === 2) {
    if (n("behind") === 2) backSet = "i";
    else if (n("behind") === 1) backSet = n("left") ? "offset_i_left" : "offset_i_right";
    else if (n("left") === 2) backSet = "two_left";
    else if (n("right") === 2) backSet = "two_right";
    else backSet = "split";
  } else backSet = "three";

  let qbSpot: QbSpot = "none";
  if (qb) {
    const d = cy - qb.y;
    calls.qb.push(Math.abs(d - rules.underCenterDepth));
    if (d <= rules.underCenterDepth) qbSpot = "under_center";
    else {
      // pistol: off the center with a back straight behind him
      const stacked = backs.some((b) => Math.abs(b.x - qb.x) <= rules.behindReach && b.y < qb.y);
      qbSpot = stacked ? "pistol" : "gun";
    }
  }

  const tightEnds = players.filter((p) => p.role === "tight_end" || p.role === "wing").length;
  const personnel = offense.length === 11 && linemen === 5 && qb && backs.length <= 3 && tightEnds <= 3 ? `${backs.length}${tightEnds}` : null;

  // more than four off the line can't be legal: somebody's depth is off
  const offLine = offense.filter((p) => !onLine(p)).length;
  if (offense.length === 11 && offLine > 4) notes.push(`${offLine} players are off the line; at most 4 can be.`);

  // confidence: the closest call that could change the answer, a full yard clear counts as sure
  const penalty = (offense.length === 11 ? 1 : 0.6) * (linemen === 5 ? 1 : 0.5) * (center ? 1 : 0.5);
  const sure = (...margins: number[][]) => {
    const all = margins.flat();
    return clamp01((all.length ? Math.min(...all) : 1) * penalty);
  };
  const receiverCalls = sure(calls.receivers);
  const confidence = {
    shape: receiverCalls,
    strength: receiverCalls,
    qb: qb ? sure(calls.qb, qbSpot === "under_center" ? [] : calls.backs) : clamp01(0.3 * penalty),
    backs: sure(calls.receivers, calls.backs),
    personnel: personnel ? sure(calls.receivers, calls.ends) : 0,
  };

  return { players, receivers, shape, strength, qb: qbSpot, backs: backSet, personnel, confidence, notes };
}
