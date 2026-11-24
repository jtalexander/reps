/**
 * Reading a line the coach drew by hand in the play builder: a squiggly line
 * is the motion, a line ending in a T is a block, an arrow from a receiver is
 * a route (named from the route tree when it fits one), an arrow from a back
 * is his run path, a dotted one is a fake. The drawing itself is kept as is;
 * the job is Reps' best guess and the coach can change it.
 */
import { isLineman, type Line, type Motion, type PlayData, type Player, type Point } from "./play";
import { outsideSign, ROUTES } from "./routes";

export type Pen = Line;

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const round = (p: Point): Point => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];

export function length(pts: Point[]): number {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += dist(pts[i - 1]!, pts[i]!);
  return n;
}

/** Fewer points, same shape (Ramer–Douglas–Peucker). */
export function simplify(pts: Point[], eps: number): Point[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0]!, pts[pts.length - 1]!];
  const len = dist(a, b);
  let far = 0;
  let at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const d = len ? Math.abs((b[1] - a[1]) * p[0] - (b[0] - a[0]) * p[1] + b[0] * a[1] - b[1] * a[0]) / len : dist(p, a);
    if (d > far) [far, at] = [d, i];
  }
  if (far <= eps) return [a, b];
  return [...simplify(pts.slice(0, at + 1), eps).slice(0, -1), ...simplify(pts.slice(at), eps)];
}

/** `n` points spaced evenly along the line. */
function resample(pts: Point[], n: number): Point[] {
  const total = length(pts);
  if (!total) return Array.from({ length: n }, () => pts[0]!);
  const out: Point[] = [];
  let seg = 1;
  let walked = 0;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * total;
    while (seg < pts.length - 1 && walked + dist(pts[seg - 1]!, pts[seg]!) < t) {
      walked += dist(pts[seg - 1]!, pts[seg]!);
      seg++;
    }
    const a = pts[seg - 1]!;
    const b = pts[seg]!;
    const l = dist(a, b) || 1;
    const f = Math.min(1, Math.max(0, (t - walked) / l));
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

export interface RouteGuess {
  key: string;
  depth: number;
  break_direction: "in" | "out" | "unknown";
  /** average miss in yards; small = it looks just like that route */
  miss: number;
  /** average difference in direction along the line, radians */
  turn: number;
}

/** Direction of travel at each step of a resampled line. */
const headings = (pts: Point[]) => pts.slice(1).map((p, i) => Math.atan2(p[1] - pts[i]![1], p[0] - pts[i]![0]));
const angleGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
};

/**
 * The standard route a drawn line looks most like (null if none is close),
 * with the depth it was drawn at. `rel` starts at [0, 0], in field yards.
 */
export function matchRoute(rel: Point[], player: Pick<Player, "x" | "side">): RouteGuess | null {
  const s = outsideSign(player);
  const drawn = resample(rel.map(([x, y]) => [x * s, y] as Point), 24);
  const drawnDir = headings(drawn);
  const size = Math.max(4, length(rel));
  let best: RouteGuess | null = null;
  let bestScore = Infinity;
  for (const r of ROUTES) {
    if (r.key === "screen") continue;
    const depths = r.depth === 0 ? [0] : Array.from({ length: 26 }, (_, i) => i + 1);
    for (const d of depths)
      for (const other of r.breaks === "none" ? [false] : [false, true]) {
        const shape = r.shape(d).map(([x, y]) => [other ? -x : x, y] as Point);
        const tpl = resample(shape, 24);
        const miss = drawn.reduce((n, p, i) => n + dist(p, tpl[i]!), 0) / drawn.length;
        const tplDir = headings(tpl);
        const turn = drawnDir.reduce((n, h, i) => n + angleGap(h, tplDir[i]!), 0) / drawnDir.length;
        // where it goes and which way it breaks both count; nudges toward the usual depth and the usual break
        const score = miss / Math.sqrt(size) + turn * 1.5 + Math.abs(d - r.depth) * 0.01 + (other ? 0.1 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = { key: r.key, depth: d, break_direction: other ? (r.breaks === "in" ? "out" : "in") : "unknown", miss, turn };
        }
      }
  }
  return best && best.miss <= Math.max(1.2, size * 0.12) && best.turn <= 0.45 ? best : null;
}

const isBack = (p: Player) => !isLineman(p.id) && p.id !== "QB" && p.y <= -2.5 && Math.abs(p.x) < 4;

/** What a block line looks like it does. */
function blockType(rel: Point[], p: Player): string {
  const endX = rel[rel.length - 1]![0];
  const endY = rel[rel.length - 1]![1];
  const deepest = Math.min(...rel.map((q) => q[1]));
  if (deepest < -0.6 && Math.abs(endX) > 2) return "pull";
  if (endY < -0.3 && Math.abs(endX) < 1.5) return "pass_pro";
  if (!isLineman(p.id)) return isBack(p) ? "lead" : "base";
  if (endY > 3) return "climb";
  const inside = p.x === 0 ? 0 : -Math.sign(p.x);
  if (Math.abs(endX) < 0.5 || !inside) return "base";
  return Math.sign(endX) === inside ? "down" : "reach";
}

export interface StrokeResult {
  data: PlayData;
  /** what Reps made of it, e.g. "Z: 12-yard dig" */
  said: string;
}

/**
 * Put one hand-drawn line onto a play. `pts` are field yards from the
 * player's spot (or the end of his motion).
 */
export function applyStroke(data: PlayData, id: string, pts: Point[], pen: Pen, routeLabel: (key: string) => string = (k) => k): StrokeResult {
  const p = data.players.find((x) => x.id === id);
  if (!p || pts.length < 2) return { data, said: "" };

  if (pen.style === "squiggly") {
    // motion before the snap: smooth out the hand squiggle, keep the shape
    const from: Point = [p.x, p.y];
    const path = simplify(pts, 1.2).map((q) => round([q[0] - from[0], q[1] - from[1]]));
    path[0] = [0, 0];
    const last = path[path.length - 1]!;
    const end = round([p.x + last[0], Math.min(p.y + last[1], -0.5)]);
    const turns = path.length > 2 && Math.sign(path[1]![0]) !== Math.sign(last[0]) && Math.abs(path[1]![0]) > 1;
    const type: Motion["type"] = turns ? "orbit" : Math.abs(last[0]) >= 6 && Math.abs(end[0]) < Math.abs(p.x) ? (Math.abs(end[0]) < 4 ? "jet" : "across") : "unknown";
    const motion: Motion = { player: id, type, direction: last[0] > 0 ? "right" : "left", timing: "unknown", end, path };
    return { data: { ...data, motion }, said: `${id}: motion ${last[0] > 0 ? "right" : "left"}` };
  }

  const motionEnd = data.motion?.player === id && data.motion.end ? data.motion.end : null;
  const from: Point = motionEnd ?? [p.x, p.y];
  const rel = simplify(pts, 0.35).map((q) => round([q[0] - from[0], q[1] - from[1]]));
  rel[0] = [0, 0];
  const line: Line = { style: pen.style, end: pen.end };
  const clear = { route: null, block: null, path: null, line };
  let next: Player;
  let said: string;

  const throughLine = (() => {
    // does the line cross the line of scrimmage inside the box?
    for (let i = 1; i < rel.length; i++) {
      const a: Point = [from[0] + rel[i - 1]![0], from[1] + rel[i - 1]![1]];
      const b: Point = [from[0] + rel[i]![0], from[1] + rel[i]![1]];
      if (a[1] < 0 && b[1] >= 0) {
        const x = a[0] + ((b[0] - a[0]) * (0 - a[1])) / (b[1] - a[1] || 1);
        return Math.abs(x) < 5;
      }
    }
    return false;
  })();

  if (pen.end === "t" || isLineman(p.id)) {
    const type = blockType(rel, p);
    next = { ...p, ...clear, assignment_type: type === "pass_pro" ? "pass_pro" : type === "lead" ? "lead" : "block", block: { type, target: null, path: rel } };
    said = `${id}: ${type.replace("_", " ")} block`;
  } else if ((isBack(p) || p.id === "QB") && pen.style === "dotted") {
    next = { ...p, ...clear, assignment_type: "fake", path: rel };
    said = `${id}: fake`;
  } else if ((isBack(p) || p.id === "QB") && throughLine) {
    next = { ...p, ...clear, assignment_type: "carry", path: rel };
    said = `${id}: carries the ball`;
  } else {
    const r = matchRoute(rel, p);
    next = {
      ...p,
      ...clear,
      assignment_type: "route",
      route: { name: r?.key ?? "custom", depth_yards: r && r.depth > 0 ? r.depth : "unknown", break_direction: r?.break_direction ?? "unknown", notes: null, path: rel },
    };
    said = r ? `${id}: ${r.depth > 0 ? `${r.depth}-yard ` : ""}${routeLabel(r.key).toLowerCase()}` : `${id}: his own route`;
  }
  return { data: { ...data, players: data.players.map((x) => (x.id === id ? next : x)) }, said };
}
