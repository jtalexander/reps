/**
 * Draw a motion from what the team says it means ("Motion to the opposite
 * guard and return to just outside the end man on the LOS"), laid onto the
 * coach's lineup. No AI: it reads the team's own definition for the usual
 * motions (numbered spots, return, trace, orbit, fly, trade, shuffle...) and
 * falls back to a plain motion across. Field yards: x left -/right +, the
 * line of scrimmage at y = 0, the backfield below it.
 */
import { isLineman, type Motion, type Player, type Point } from "./play";

export type MotionKind =
  | "spot"
  | "shift"
  | "crazy"
  | "trace"
  | "return"
  | "fly"
  | "orbit"
  | "army"
  | "shuffle"
  | "wide"
  | "trade"
  | "short"
  | "jet"
  | "across";

/** A numbered motion spot: "3 / 4", "3 or 4", "3-4". */
export const SPOT = /^\d+\s*(\/|OR|-|&|,)\s*\d+$/i;

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Which kind of motion the team's word and its meaning describe. */
export function motionKind(word: string, means: string): MotionKind {
  const w = word.toUpperCase().trim();
  const m = `${means}`.toLowerCase();
  if (SPOT.test(w)) return "spot";
  if (/\bshift/.test(m) && /formation/.test(m) && !/\bmotion\b/.test(m)) return "shift";
  if (/opposite guard.*near guard/.test(m) || w === "CRAZY") return "crazy";
  if (/opposite guard.*original/.test(m) || w === "TRACE") return "trace";
  if (/opposite guard.*return/.test(m) || w === "RETURN") return "return";
  if (/directly behind the qb/.test(m) || w === "FLY") return "fly";
  if ((/backfield/.test(m) && /same side/.test(m)) || w === "ORBIT") return "orbit";
  if (/(left to right|right to left).*backfield/.test(m)) return "army";
  if (/opposite tackle/.test(m)) return "shuffle";
  if (/wide backfield motion|backfield motion.*\b(right|left)\b/.test(m)) return "wide";
  if (/\btrade\b|opposite side of the formation/.test(m) || w === "TRADE") return "trade";
  if (/outside.?in|next receiver inside/.test(m) || w === "SHORT") return "short";
  if (/\b(jet|zoom)\b/.test(m) || w === "JET" || w === "ZOOM") return "jet";
  return "across";
}

/**
 * The motion, or null for a shift (the players line up in the called
 * formation; there's no motion line). `toward` is the side the play goes,
 * used when the motion itself doesn't say.
 */
export function drawMotion(word: string, means: string, moverId: string, lineup: Player[], toward?: "left" | "right"): { motion: Motion | null; kind: MotionKind } {
  const kind = motionKind(word, means);
  const p = lineup.find((x) => x.id === moverId);
  if (!p || kind === "shift") return { motion: null, kind };
  const s = p.x > 0.5 ? 1 : p.x < -0.5 ? -1 : toward === "left" ? 1 : -1; // his side
  const o = -s;
  const at = (id: string) => lineup.find((x) => x.id === id);
  const guard = (side: number) => Math.abs(at(side < 0 ? "LG" : "RG")?.x ?? 1.3) * side;
  const tackle = (side: number) => Math.abs(at(side < 0 ? "LT" : "RT")?.x ?? 2.6) * side;
  /** The end man on the line on that side: the widest player on the line near the core (a tight end or wing), else the tackle. */
  const endMan = (side: number) => {
    const core = lineup.filter((x) => x.id !== moverId && x.y > -1.6 && Math.sign(x.x) === side && Math.abs(x.x) <= 6);
    return Math.max(Math.abs(tackle(side)), ...core.map((x) => Math.abs(x.x))) * side;
  };
  const widest = (side: number) => Math.max(Math.abs(endMan(side)), ...lineup.filter((x) => x.id !== moverId && Math.sign(x.x) === side).map((x) => Math.abs(x.x))) * side;
  const qb = at("QB") ?? { x: 0, y: -5 };
  const line = -1; // just off the line, behind it

  let pts: Point[]; // field points, from where he stands
  const start: Point = [p.x, p.y];
  switch (kind) {
    case "spot": {
      // "3 / 4": odd numbers to the left, even to the right; bigger numbers wider. He goes across unless the play says otherwise.
      const n = Number(word.match(/\d+/)![0]);
      const side = p.x !== 0 ? o : toward === "left" ? -1 : 1;
      const depth = n <= 2 ? 1.5 : n <= 4 ? Math.abs(endMan(side)) + 1.5 : n <= 6 ? Math.abs(endMan(side)) + 4.5 : n <= 8 ? Math.abs(endMan(side)) + 8 : Math.abs(widest(side)) + 2;
      pts = [start, [side * depth, line]];
      break;
    }
    case "crazy":
      pts = [start, [guard(o), line], [guard(s), line], [endMan(o) + o * 1.5, line]];
      break;
    case "trace":
      pts = [start, [guard(o), line], start];
      break;
    case "return":
      pts = [start, [guard(o), line], [endMan(s) + s * 1.5, line]];
      break;
    case "fly":
      pts = [start, [qb.x + s * 1.5, qb.y - 1], [qb.x, qb.y - 2]];
      break;
    case "orbit":
      pts = [start, [s * Math.max(2, Math.abs(p.x) / 2), qb.y + 1], [s * 3, qb.y]];
      break;
    case "army": {
      const right = /left to right/.test(means.toLowerCase()) ? 1 : -1;
      pts = [start, [right * 1.5, line], [right * 3, qb.y]];
      break;
    }
    case "shuffle":
      pts = [start, [tackle(o), p.y]];
      break;
    case "wide": {
      const right = /\bright\b/.test(means.toLowerCase()) ? 1 : -1;
      pts = [start, [p.x + right * 5, p.y]];
      break;
    }
    case "trade":
      pts = [start, [guard(s), line], [tackle(o) + o * 1.3, 0]];
      break;
    case "short": {
      const inside = lineup.filter((x) => x.id !== moverId && !isLineman(x.id) && x.id !== "QB" && Math.sign(x.x) === s && Math.abs(x.x) < Math.abs(p.x));
      const next = inside.sort((a, b) => Math.abs(b.x) - Math.abs(a.x))[0];
      const to = next ? next.x + s * 2 : endMan(s) + s * 3;
      pts = [start, [to, p.y]];
      break;
    }
    case "jet":
      pts = [start, [o * 2, line]];
      break;
    default:
      pts = [start, [r1(p.x + o * Math.min(8, Math.abs(p.x) + 3)), p.y]];
  }
  pts = pts.map(([x, y]) => [r1(x), r1(y)] as Point);
  const end = pts[pts.length - 1]!;
  const dx = end[0] - p.x || pts[1]![0] - p.x;
  const motion: Motion = {
    player: p.id,
    type: kind === "fly" ? "fly" : kind === "orbit" ? "orbit" : kind === "return" || kind === "trace" ? "return" : kind === "jet" ? "jet" : "across",
    direction: dx < 0 ? "left" : "right",
    timing: kind === "jet" ? "at_snap" : "set",
    end,
    ...(pts.length > 2 ? { path: pts.map(([x, y]) => [r1(x - p.x), r1(y - p.y)] as Point) } : {}),
  };
  return { motion, kind };
}
