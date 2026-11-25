/**
 * A team's route tree: which route each number calls. Teams number routes
 * differently (and some don't number them at all), so the coach sets it on
 * Settings, RepWon can draft it from the playbook, and Football basics teaches
 * the team's own tree.
 */
import { normalizeRouteName, ROUTE_BY_KEY } from "./routes";

export interface RouteTree {
  /** false: the team calls routes by name only */
  numbered: boolean;
  /** number (as the team says it: "0".."9") -> route key from ROUTES */
  routes: { n: string; route: string }[];
}

export const TREE_NUMBERS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** A common tree: odd numbers break out, even numbers break in, 9 goes straight. */
export const COMMON_TREE: RouteTree = {
  numbered: true,
  routes: [
    { n: "1", route: "flat" },
    { n: "2", route: "slant" },
    { n: "3", route: "comeback" },
    { n: "4", route: "curl" },
    { n: "5", route: "out" },
    { n: "6", route: "dig" },
    { n: "7", route: "corner" },
    { n: "8", route: "post" },
    { n: "9", route: "go" },
  ],
};

/** Keep only known routes and numbers, each number once, in number order. */
export function cleanTree(tree: RouteTree): RouteTree {
  const seen = new Set<string>();
  const routes = tree.routes
    .map((r) => ({ n: String(r.n).trim(), route: normalizeRouteName(r.route) }))
    .filter((r) => (TREE_NUMBERS as readonly string[]).includes(r.n) && ROUTE_BY_KEY.has(r.route) && !seen.has(r.n) && seen.add(r.n))
    .sort((a, b) => Number(a.n) - Number(b.n));
  return { numbered: tree.numbered, routes };
}

/**
 * A draft tree from what the playbook says (naming rules' route_tree words),
 * or null when it doesn't show one RepWon can match to known routes.
 */
export function treeFromPlaybook(words: { number: string; route: string }[] | undefined | null): RouteTree | null {
  if (!words?.length) return null;
  const tree = cleanTree({ numbered: true, routes: words.map((w) => ({ n: w.number.replace(/\D/g, ""), route: w.route })) });
  return tree.routes.length >= 3 ? tree : null;
}

/** Does every odd number break out and every even number break in (the common rule)? */
export function oddOutEvenIn(tree: RouteTree): boolean {
  const routes = tree.routes.filter((r) => ROUTE_BY_KEY.get(r.route)?.breaks !== "none");
  if (routes.length < 4) return false;
  return routes.every((r) => {
    const breaks = ROUTE_BY_KEY.get(r.route)!.breaks;
    return Number(r.n) % 2 === 1 ? breaks === "out" : breaks === "in";
  });
}
