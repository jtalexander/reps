/**
 * Drawing helpers for library diagrams (see Diagram in ./types). Yards with
 * the ball at (0, 0), x to the right as the offense faces up, defense at y > 0.
 * Offenses and fronts below are drawn with the strength (tight end) to the right.
 */
import type { Diagram, Dot, Line, Note, Zone } from "./types";

// ---------- single pieces ----------

export const o = (label: string, x: number, y: number, hi = false): Dot => ({ label, x, y, side: "o", ...(hi ? { hi } : {}) });
export const d = (label: string, x: number, y: number, hi = false): Dot => ({ label, x, y, side: "d", ...(hi ? { hi } : {}) });
export const arrow = (kind: Line["kind"], ...pts: [number, number][]): Line => ({ pts, kind });
export const darrow = (kind: Line["kind"], ...pts: [number, number][]): Line => ({ pts, kind, side: "d" });
export const zone = (label: string, x: number, y: number, rx: number, ry: number): Zone => ({ label, x, y, rx, ry });
export const note = (text: string, x: number, y: number): Note => ({ text, x, y });
export const diagram = (parts: Diagram): Diagram => parts;

// ---------- offense ----------

/** Offensive linemen's x (the center is over the ball). */
export const OL_X = { LT: -3, LG: -1.5, C: 0, RG: 1.5, RT: 3 } as const;
export const TE_X = 4.5;
const OL_Y = -0.8;

/** The five linemen, plus a tight end on the right, left, both or neither. */
export function oline(te: "right" | "left" | "both" | "none" = "right", hi: string[] = []): Dot[] {
  const dots = (Object.entries(OL_X) as [string, number][]).map(([l, x]) => o(l, x, OL_Y, hi.includes(l)));
  if (te === "right" || te === "both") dots.push(o("Y", TE_X, OL_Y, hi.includes("Y")));
  if (te === "left" || te === "both") dots.push(o(te === "both" ? "Y2" : "Y", -TE_X, OL_Y, hi.includes(te === "both" ? "Y2" : "Y")));
  return dots;
}

export const qb = (kind: "under" | "gun" | "pistol" = "under", hi = false) => o("QB", 0, kind === "under" ? -1.8 : kind === "pistol" ? -4 : -5, hi);

/** I-formation, 21 personnel: QB under center, FB and TB stacked, TE right, X left, Z right. */
export function proSet(hi: string[] = []): Dot[] {
  return [...oline("right", hi), qb("under", hi.includes("QB")), o("FB", 0, -4.2, hi.includes("FB")), o("TB", 0, -6.5, hi.includes("TB")), o("X", -14, OL_Y, hi.includes("X")), o("Z", 11, -1.8, hi.includes("Z"))];
}

/** Shotgun 2x2, 11 personnel: Y (attached) right, H in the left slot, X and Z wide, RB beside the QB. */
export function spread(hi: string[] = []): Dot[] {
  return [...oline("right", hi), qb("gun", hi.includes("QB")), o("RB", 1.5, -5, hi.includes("RB")), o("X", -15, OL_Y, hi.includes("X")), o("H", -8, -1.8, hi.includes("H")), o("Z", 14, -1.8, hi.includes("Z"))];
}

/** Gap letters between the linemen (A by the center, then B, C, D outside the tight end). */
export function gapNotes(te: "right" | "left" | "both" | "none" = "right"): Note[] {
  const y = -2.6;
  const n = [note("A", 0.75, y), note("A", -0.75, y), note("B", 2.25, y), note("B", -2.25, y), note("C", 3.75, y), note("C", -3.75, y)];
  if (te === "right" || te === "both") n.push(note("D", 5.3, y));
  if (te === "left" || te === "both") n.push(note("D", -5.3, y));
  return n;
}

// ---------- defense ----------

/**
 * Where a defensive lineman lines up by technique number, on the right side
 * (mirror it for the left). 0 = head up on the center, odd numbers = outside
 * shoulder, "i" = inside shoulder.
 */
export const TECH_X = { "0": 0, "1": 0.7, "2i": 1.1, "2": 1.5, "3": 2.1, "4i": 2.6, "4": 3, "5": 3.6, "7": 4.05, "6": 4.5, "9": 5.2, "8": 6 } as const;
export type Tech = keyof typeof TECH_X;
const DL_Y = 0.9;

/** A defender on the line at a technique, on the "right" (TE side) or "left". */
export const tech = (t: Tech, side: "right" | "left", label: string, hi = false) => d(label, side === "right" ? TECH_X[t] : -TECH_X[t], DL_Y, hi);

export type FrontName = "4-3 Over" | "4-3 Under" | "3-4" | "4-2-5" | "5-2" | "4-4" | "3-3 Stack";
export const FRONTS: FrontName[] = ["4-3 Over", "4-3 Under", "3-4", "4-2-5", "5-2", "4-4", "3-3 Stack"];

/** The front's linemen and linebackers against a TE-right offense (DBs: see shell()). */
export function front(name: FrontName, hi: string[] = []): Dot[] {
  const h = (l: string) => hi.includes(l);
  switch (name) {
    case "4-3 Over":
      return [tech("9", "right", "E", h("E")), tech("3", "right", "T", h("T")), tech("1", "left", "N", h("N")), tech("5", "left", "E", h("E")), d("S", 5.5, 4, h("S")), d("M", 0.5, 4.5, h("M")), d("W", -3.2, 4.5, h("W"))];
    case "4-3 Under":
      return [d("S", 5.3, 1.2, h("S")), tech("5", "right", "E", h("E")), tech("1", "right", "N", h("N")), tech("3", "left", "T", h("T")), tech("5", "left", "E", h("E")), d("M", 1.5, 4.5, h("M")), d("W", -2.2, 4.5, h("W"))];
    case "3-4":
      return [tech("0", "right", "N", h("N")), tech("5", "right", "E", h("E")), tech("5", "left", "E", h("E")), d("O", 6, 1.5, h("O")), d("O", -5.2, 1.5, h("O")), d("I", 1.6, 4.5, h("I")), d("I", -1.6, 4.5, h("I"))];
    case "4-2-5":
      return [tech("5", "right", "E", h("E")), tech("3", "right", "T", h("T")), tech("1", "left", "N", h("N")), tech("5", "left", "E", h("E")), d("M", 1.5, 4.5, h("M")), d("W", -1.5, 4.5, h("W"))];
    case "5-2":
      return [tech("0", "right", "N", h("N")), tech("4i", "right", "T", h("T")), tech("4i", "left", "T", h("T")), tech("9", "right", "E", h("E")), d("E", -5, 1.2, h("E")), d("L", 1.8, 4.5, h("L")), d("L", -1.8, 4.5, h("L"))];
    case "4-4":
      return [tech("7", "right", "E", h("E")), tech("3", "right", "T", h("T")), tech("3", "left", "T", h("T")), tech("5", "left", "E", h("E")), d("O", 6.5, 3, h("O")), d("I", 1.5, 4, h("I")), d("I", -1.5, 4, h("I")), d("O", -5.5, 3, h("O"))];
    case "3-3 Stack":
      return [tech("0", "right", "N", h("N")), tech("4", "right", "E", h("E")), tech("4", "left", "E", h("E")), d("M", 0, 4.5, h("M")), d("S", 3.2, 4.5, h("S")), d("W", -3.2, 4.5, h("W"))];
  }
}

/** The secondary: two deep safeties ("two") or one deep safety ("one"), corners over the wideouts. */
export function shell(kind: "two" | "one", wide: { left: number; right: number } = { left: -14, right: 11 }, hi: string[] = []): Dot[] {
  const corners = [d("C", wide.left, 6, hi.includes("C")), d("C", wide.right, 6, hi.includes("C"))];
  return kind === "two" ? [...corners, d("FS", -7, 11, hi.includes("FS")), d("SS", 7, 11, hi.includes("SS"))] : [...corners, d("FS", 0, 12, hi.includes("FS")), d("SS", 6, 7, hi.includes("SS"))];
}
