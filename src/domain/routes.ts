/**
 * The route tree: standard route shapes, drawn from a name and a depth.
 * Shapes are written in an "outside-positive" frame (dx > 0 = toward the
 * receiver's sideline, dy > 0 = downfield) and turned into field yards for
 * the receiver's side of the ball.
 */
import type { Player, Point, Route } from "./play";

export interface RouteDef {
  key: string;
  label: string;
  /** default break depth in yards */
  depth: number;
  /** which way the break goes, for the default shape */
  breaks: "in" | "out" | "none";
  /** shape at depth d in the outside-positive frame, starting at [0, 0] */
  shape: (d: number) => Point[];
  /** one-line description used in explanations */
  describe: string;
  /** youth-friendly: shown at every level */
  basic?: boolean;
}

export const ROUTES: RouteDef[] = [
  { key: "go", label: "Go", depth: 20, breaks: "none", basic: true, shape: (d) => [[0, 0], [0, d]], describe: "straight upfield, run past the defender" },
  { key: "fade", label: "Fade", depth: 18, breaks: "out", shape: (d) => [[0, 0], [1, d * 0.4], [2.5, d]], describe: "release outside and drift toward the sideline deep" },
  { key: "slant", label: "Slant", depth: 2, breaks: "in", basic: true, shape: (d) => [[0, 0], [0, d], [-5, d + 5]], describe: "two or three steps up, then cut hard inside at 45 degrees" },
  { key: "quick_out", label: "Quick out", depth: 5, breaks: "out", basic: true, shape: (d) => [[0, 0], [0, d], [4, d]], describe: "five yards up, square cut to the sideline" },
  { key: "speed_out", label: "Speed out", depth: 5, breaks: "out", shape: (d) => [[0, 0], [0, d - 1], [1, d], [5, d]], describe: "rounded break to the sideline at five yards, no stopping" },
  { key: "out", label: "Out", depth: 10, breaks: "out", shape: (d) => [[0, 0], [0, d], [5, d - 0.5]], describe: "push to ten, plant, break flat to the sideline" },
  { key: "hitch", label: "Hitch", depth: 5, breaks: "in", basic: true, shape: (d) => [[0, 0], [0, d + 1], [-0.6, d]], describe: "sprint to six, stop, turn back to the quarterback" },
  { key: "curl", label: "Curl", depth: 12, breaks: "in", shape: (d) => [[0, 0], [0, d], [-1.5, d - 2]], describe: "push to twelve, curl back inside toward the quarterback" },
  { key: "comeback", label: "Comeback", depth: 14, breaks: "out", shape: (d) => [[0, 0], [0, d], [2, d - 3]], describe: "push deep, break back toward the sideline" },
  { key: "stick", label: "Stick", depth: 5, breaks: "none", shape: (d) => [[0, 0], [0, d], [-0.3, d]], describe: "five yards and sit in the open window" },
  { key: "dig", label: "Dig", depth: 12, breaks: "in", shape: (d) => [[0, 0], [0, d], [-10, d]], describe: "push to twelve, break flat across the middle" },
  { key: "in", label: "In", depth: 8, breaks: "in", basic: true, shape: (d) => [[0, 0], [0, d], [-8, d]], describe: "up to depth, square in across the field" },
  { key: "drag", label: "Drag", depth: 2, breaks: "in", basic: true, shape: (d) => [[0, 0], [-2, d], [-14, d + 2]], describe: "shallow across the formation under the linebackers" },
  { key: "post", label: "Post", depth: 12, breaks: "in", basic: true, shape: (d) => [[0, 0], [0, d], [-6, d + 12]], describe: "push to twelve, break to the goal posts" },
  { key: "corner", label: "Corner", depth: 10, breaks: "out", basic: true, shape: (d) => [[0, 0], [0, d], [6, d + 8]], describe: "push to ten, break to the back corner of the end zone" },
  { key: "flag", label: "Flag", depth: 8, breaks: "out", shape: (d) => [[0, 0], [0, d], [5, d + 6]], describe: "a shorter corner, breaking out and up" },
  { key: "seam", label: "Seam", depth: 20, breaks: "none", shape: (d) => [[0, 0], [-0.5, d * 0.3], [-1, d]], describe: "straight up the seam between the safeties" },
  { key: "flat", label: "Flat", depth: 2, breaks: "out", basic: true, shape: (d) => [[0, 0], [2, d * 0.5], [7, d]], describe: "release to the flat, get width toward the sideline" },
  { key: "arrow", label: "Arrow", depth: 4, breaks: "out", shape: (d) => [[0, 0], [5, d]], describe: "angle straight to the flat at four yards" },
  { key: "swing", label: "Swing", depth: 0, breaks: "out", basic: true, shape: () => [[0, 0], [2, -1], [6, 0], [8, 1.5]], describe: "belly back and swing wide to the sideline" },
  { key: "bubble", label: "Bubble", depth: 0, breaks: "out", shape: () => [[0, 0], [1.5, -1.5], [4, -1]], describe: "bubble back and outside to catch behind the line" },
  { key: "wheel", label: "Wheel", depth: 18, breaks: "out", shape: (d) => [[0, 0], [4, 1], [6, 4], [6.5, d]], describe: "run to the flat, then turn it up the sideline" },
  { key: "angle", label: "Angle", depth: 4, breaks: "in", shape: (d) => [[0, 0], [3, 2], [-1, d + 1]], describe: "fake to the flat, break back inside" },
  { key: "out_and_up", label: "Out and up", depth: 6, breaks: "out", shape: (d) => [[0, 0], [0, d], [2, d], [2.5, d + 14]], describe: "sell the out, then go deep" },
  { key: "post_corner", label: "Post corner", depth: 10, breaks: "out", shape: (d) => [[0, 0], [0, d], [-2, d + 3], [4, d + 10]], describe: "sell the post, break to the corner" },
  { key: "sluggo", label: "Slant and go", depth: 2, breaks: "none", shape: (d) => [[0, 0], [0, d], [-2, d + 2], [-2, d + 16]], describe: "sell the slant, then go deep" },
  { key: "whip", label: "Whip", depth: 4, breaks: "out", shape: (d) => [[0, 0], [-1.5, d], [2, d]], describe: "fake inside, whip back out" },
  { key: "screen", label: "Screen", depth: 0, breaks: "none", shape: () => [[0, 0], [0, -1], [-1, -1.5]], describe: "set up behind the line for the screen" },
];

export const ROUTE_BY_KEY = new Map(ROUTES.map((r) => [r.key, r]));

/** Common spellings and team shorthand that mean a standard route. */
const ALIASES: Record<string, string> = {
  fly: "go",
  streak: "go",
  vert: "go",
  vertical: "go",
  "9": "go",
  hook: "curl",
  "out route": "out",
  square_out: "out",
  "quick out": "quick_out",
  "speed out": "speed_out",
  shallow: "drag",
  cross: "drag",
  crosser: "drag",
  sit: "stick",
  "flat route": "flat",
  "out & up": "out_and_up",
  "out and up": "out_and_up",
  "slant & go": "sluggo",
  "slant and go": "sluggo",
  "post corner": "post_corner",
  "post-corner": "post_corner",
  bench: "out",
  quick_hitch: "hitch",
  spot: "stick",
  "6": "hitch",
};

export function normalizeRouteName(name: string | null | undefined): string {
  if (!name) return "unknown";
  const n = name.trim().toLowerCase();
  if (ROUTE_BY_KEY.has(n)) return n;
  const snake = n.replace(/[\s-]+/g, "_");
  if (ROUTE_BY_KEY.has(snake)) return snake;
  return ALIASES[n] ?? ALIASES[snake] ?? (n === "unknown" ? "unknown" : n);
}

/** Which way is "outside" for this player: +1 right, -1 left. */
export function outsideSign(p: Pick<Player, "x" | "side">, strength?: string): number {
  if (p.side === "right" || p.x > 0.5) return 1;
  if (p.side === "left" || p.x < -0.5) return -1;
  return strength === "left" ? -1 : 1;
}

/**
 * The route's path in field yards relative to the player, or null when the
 * route is unknown and has no drawn path.
 */
export function routePath(route: Route, player: Pick<Player, "x" | "side">, strength?: string): Point[] | null {
  if (route.path && route.path.length >= 2) return route.path;
  const def = ROUTE_BY_KEY.get(normalizeRouteName(route.name));
  if (!def) return null;
  const depth = typeof route.depth_yards === "number" ? route.depth_yards : def.depth;
  let shape = def.shape(depth);
  // A coach can flip the break of any route ("in" vs "out" variants).
  if (
    route.break_direction !== "unknown" &&
    route.break_direction !== "none" &&
    def.breaks !== "none" &&
    route.break_direction !== def.breaks
  ) {
    shape = shape.map(([x, y]) => [-x, y]);
  }
  const s = outsideSign(player, strength);
  return shape.map(([x, y]) => [x * s, y]);
}

export function routeLabel(key: string, terms?: Record<string, string>): string {
  const k = normalizeRouteName(key);
  return terms?.[k] ?? ROUTE_BY_KEY.get(k)?.label ?? key;
}
