/**
 * Grading a "draw your job" answer: the player draws his line on the play and
 * RepWon checks it like a coach would, not to the inch. A route has to be the
 * right route, breaking the right way, within about two yards of its depth; a
 * block has to be the right kind going the right way; a carry has to hit the
 * right hole; a fake has to be dotted and go the right way.
 */
import { isLineman, type Line, type PlayData, type Player, type Point } from "./play";
import { normalizeRouteName, ROUTE_BY_KEY, routePath } from "./routes";
import { applyStroke, matchRoute, simplify } from "./sketch";

/** What a drawn answer carries: field yards as shown on the screen, and the pen. */
export interface DrawnAnswer {
  pts: Point[];
  pen: Line;
}

export interface DrawGrade {
  correct: boolean;
  /** one line for the player: what he drew against what it is */
  note: string;
}

/** Routes with no break: depth doesn't matter, just the direction. */
const NO_BREAK = new Set(["go", "seam", "fade"]);
/** Routes that are the same shape at different depths: drawn as one, the depth decides. */
const FAMILY: Record<string, string> = { quick_out: "out", speed_out: "out", dig: "in", flag: "corner", curl: "hitch", stick: "hitch", seam: "go", fade: "go" };
const family = (k: string) => FAMILY[k] ?? k;

/** The players RepWon can ask to draw: a route, block, carry or fake with a line to compare to. */
export function drawable(p: Player, play: PlayData): boolean {
  const strength = play.formation.strength === "left" ? "left" : "right";
  if (p.route) return routePath(p.route, p, strength) !== null && normalizeRouteName(p.route.name) !== "screen";
  if (p.block) return (p.block.path?.length ?? 0) >= 2 || p.block.type === "pass_pro";
  if (p.assignment_type === "carry" || p.assignment_type === "fake") return (p.path?.length ?? 0) >= 2;
  return false;
}

/** Where a path (relative to `from`) crosses the line of scrimmage, or where it ends. */
function hole(from: Point, rel: Point[]): number {
  for (let i = 1; i < rel.length; i++) {
    const a: Point = [from[0] + rel[i - 1]![0], from[1] + rel[i - 1]![1]];
    const b: Point = [from[0] + rel[i]![0], from[1] + rel[i]![1]];
    if (a[1] < 0 && b[1] >= 0) return a[0] + ((b[0] - a[0]) * (0 - a[1])) / (b[1] - a[1] || 1);
  }
  return from[0] + rel[rel.length - 1]![0];
}

const lateral = (rel: Point[]) => rel[rel.length - 1]![0];
const side = (x: number) => (x > 0 ? "right" : "left");

export function gradeDrawing(play: PlayData, playerId: string, answer: DrawnAnswer, opts: { flip?: boolean; routeLabel?: (key: string) => string } = {}): DrawGrade {
  const label = opts.routeLabel ?? ((k: string) => ROUTE_BY_KEY.get(k)?.label ?? k);
  const p = play.players.find((x) => x.id === playerId);
  if (!p || answer.pts.length < 2) return { correct: false, note: "Draw your line from your spot." };
  // the answer was drawn on the screen's picture: put it back the way the play is stored
  const pts = opts.flip ? answer.pts.map(([x, y]) => [-x, y] as Point) : answer.pts;
  const clear = { ...play, players: play.players.map((x) => (x.id === playerId ? { ...x, route: null, block: null, path: null, assignment_type: "unknown" as const } : x)) };
  const drawn = applyStroke(clear, playerId, pts, answer.pen, label).data.players.find((x) => x.id === playerId)!;
  const from: Point = play.motion?.player === playerId && play.motion.end ? play.motion.end : [p.x, p.y];
  const rel = simplify(pts, 0.35).map(([x, y]) => [x - from[0], y - from[1]] as Point);
  const strength = play.formation.strength === "left" ? "left" : "right";

  if (p.route) {
    const key = normalizeRouteName(p.route.name);
    const want = routePath(p.route, p, strength)!;
    const def = ROUTE_BY_KEY.get(key);
    // the drawing matched against the route he runs (or, for a route the playbook draws its own way, what that drawing looks like)
    const guess = matchRoute(rel, p);
    const wantGuess = def ? null : matchRoute(want, p);
    const named = def ? key : wantGuess?.key ?? null;
    const depth = typeof p.route.depth_yards === "number" ? p.route.depth_yards : def?.depth ?? wantGuess?.depth ?? null;
    const is = named ? `${depth && !NO_BREAK.has(named) ? `a ${depth}-yard ` : "a "}${label(named).toLowerCase()}` : "the route drawn in your playbook";
    if (answer.pen.end === "t") return { correct: false, note: `That's a block. You run ${is}.` };
    const sameBreak = (() => {
      // which way the route ends up going, compared on the field
      const a = lateral(rel);
      const b = lateral(want);
      return Math.abs(b) < 1 || Math.sign(a) === Math.sign(b);
    })();
    if (guess && named && family(guess.key) === family(named) && sameBreak) {
      if (!depth || NO_BREAK.has(named) || Math.abs(guess.depth - depth) <= 2) return { correct: true, note: `Right: ${is}.` };
      return { correct: false, note: `Your ${label(named).toLowerCase()} was at ${guess.depth}; it's ${is}.` };
    }
    if (guess && named && family(guess.key) === family(named) && !sameBreak) return { correct: false, note: `Right route, wrong way. It's ${is} breaking to the ${side(lateral(want))}.` };
    // his own route (no standard name): close to the playbook's drawing
    if (!def) {
      const end = want[want.length - 1]!;
      const off = Math.hypot(end[0] - lateral(rel), end[1] - rel[rel.length - 1]![1]);
      if (off <= Math.max(2.5, Math.hypot(end[0], end[1]) * 0.25) && sameBreak) return { correct: true, note: "Right: that's your route." };
    }
    const drew = guess ? `${guess.depth && !NO_BREAK.has(guess.key) ? `a ${guess.depth}-yard ` : "a "}${label(guess.key).toLowerCase()}` : "something RepWon can't name";
    return { correct: false, note: `You drew ${drew}; you run ${is}.` };
  }

  if (p.block) {
    const want = p.block.path && p.block.path.length >= 2 ? p.block.path : ([[0, 0], [0, -1]] as Point[]);
    const type = p.block.type;
    const got = drawn.block?.type ?? null;
    const kind = type.replace("_", " ");
    if (!drawn.block) return { correct: false, note: `You block on this play: ${kind}. End your line in a T.` };
    if (type === "pass_pro") return got === "pass_pro" ? { correct: true, note: "Right: pass pro." } : { correct: false, note: "It's pass pro: set back and protect." };
    if (type === "pull") {
      if (got !== "pull") return { correct: false, note: `You pull on this play, to the ${side(lateral(want))}.` };
      return Math.sign(lateral(rel)) === Math.sign(lateral(want)) ? { correct: true, note: `Right: pull ${side(lateral(want))}.` } : { correct: false, note: `Right block, wrong way: pull to the ${side(lateral(want))}.` };
    }
    if (got === "pull") return { correct: false, note: `You don't pull here: ${kind} block.` };
    const wx = lateral(want);
    const dx = lateral(rel);
    const ok = Math.abs(wx) < 0.5 ? Math.abs(dx) < 1.5 : Math.sign(dx) === Math.sign(wx) && Math.abs(dx) >= 0.3;
    if (ok) return { correct: true, note: `Right: ${kind} block.` };
    return { correct: false, note: `${kind[0]!.toUpperCase()}${kind.slice(1)} block: ${Math.abs(wx) < 0.5 ? "straight ahead" : `step to the ${side(wx)}`}.` };
  }

  if (p.assignment_type === "carry" || p.assignment_type === "fake") {
    const want = p.path!;
    const isFake = p.assignment_type === "fake";
    if (answer.pen.end === "t") return { correct: false, note: isFake ? "Not a block: you fake, a dotted line." : "Not a block: you carry the ball." };
    if (isFake !== (answer.pen.style === "dotted")) return { correct: false, note: isFake ? "You fake on this play: draw it dotted." : "You carry the ball: a solid line, not a fake." };
    const wantHole = hole(from, want);
    const gotHole = hole(from, rel);
    const near = Math.abs(gotHole - wantHole) <= (isLineman(p.id) ? 1.5 : 2);
    const holeText = Math.abs(wantHole) < 1 ? "up the middle" : `${Math.abs(Math.round(wantHole))} yards to the ${side(wantHole)}`;
    if (near) return { correct: true, note: `Right: ${isFake ? "fake" : "hit it"} ${holeText}.` };
    return { correct: false, note: `You went ${Math.abs(gotHole) < 1 ? "up the middle" : `${Math.abs(Math.round(gotHole))} yards to the ${side(gotHole)}`}; it's ${holeText}.` };
  }
  return { correct: false, note: "RepWon can't grade this one." };
}

