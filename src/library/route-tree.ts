/**
 * "Your route tree": the one Basics topic built from the team's own setup.
 * A numbered team learns its numbers (from Settings, or a common tree with a
 * note until the coach sets one); a team that calls routes by name learns the
 * names and shapes only. Route names use the team's words (Settings terms).
 */
import { COMMON_TREE, oddOutEvenIn, type RouteTree } from "@/domain/route-tree";
import { ROUTE_BY_KEY, ROUTES } from "@/domain/routes";
import { EMPTY_TERMS, term, TermsSchema } from "@/domain/terms";
import { choice, lesson, trueFalse } from "./build";
import { arrow, diagram, note, o } from "./draw";
import type { Diagram, LibLesson, LibQuestion, LibTopic, TeamCtx } from "./types";

const WHO = ["QB", "WR", "TE", "RB"] as const;
const BASIC = ROUTES.filter((r) => r.basic && r.depth > 0).map((r) => r.key);

/** One receiver lined up on the right; outside is to the right. Routes drawn from him. */
function routePic(keys: { key: string; label?: string }[], hi = false): Diagram {
  const start: [number, number] = [0, -0.8];
  const lines = [];
  const notes = [];
  for (const { key, label } of keys) {
    const r = ROUTE_BY_KEY.get(key);
    if (!r) continue;
    const pts = r.shape(r.depth).map(([x, y]) => [start[0] + x, start[1] + y] as [number, number]);
    lines.push(arrow("route", ...pts));
    if (label) {
      const [ex, ey] = pts[pts.length - 1]!;
      const [px, py] = pts[pts.length - 2] ?? start;
      const len = Math.hypot(ex - px, ey - py) || 1;
      notes.push(note(label, ex + ((ex - px) / len) * 1.4, ey + ((ey - py) / len) * 1.4 - 0.2));
    }
  }
  return diagram({ dots: [o("WR", start[0], start[1], hi)], lines, notes, los: true });
}

/** Up to three other answers from a pool, skipping the right one and duplicates. */
function others<T>(pool: T[], right: T, n = 3): T[] {
  const out: T[] = [];
  for (const x of pool) if (x !== right && !out.includes(x) && out.length < n) out.push(x);
  return out;
}

export function buildRouteTree(team: TeamCtx): { lessons: LibLesson[]; questions: LibQuestion[] } {
  // teams that never saved Settings terms store {}: fill in the empty groups
  const terms = TermsSchema.parse(team.terms ?? {});
  const name = (key: string) => term(terms, "routes", key);
  const set = team.routeTree;

  if (set && !set.numbered) return namesOnly(name);

  const tree: RouteTree = set && set.routes.length >= 3 ? set : COMMON_TREE;
  const common = tree === COMMON_TREE;
  const rows = tree.routes.filter((r) => ROUTE_BY_KEY.has(r.route));
  const labels = rows.map((r) => name(r.route));
  const numbers = rows.map((r) => r.n);
  const pattern = oddOutEvenIn(tree);

  const lessons: LibLesson[] = [
    lesson(
      "ALL",
      common ? "The route tree" : "Our route tree",
      `${
        common
          ? "Many teams give their basic routes numbers, so a play call can tell every receiver his route in one word. Your coach hasn't set our team's tree in Reps yet, so here is a common one. If your playbook numbers routes differently, your playbook wins."
          : "We give our basic routes numbers, so a play call can tell every receiver his route in one word. Learn these cold: when you hear the number, you know the route."
      }
${rows.map((r) => `- ${r.n}: ${name(r.route)} (${ROUTE_BY_KEY.get(r.route)!.describe})`).join("\n")}${
        pattern ? "\n\nNotice the pattern: odd numbers break to the outside, toward the sideline, and even numbers break to the inside, toward the middle." : ""
      }`,
      { diagram: routePic(rows.map((r) => ({ key: r.route, label: r.n }))) },
    ),
  ];

  const questions: LibQuestion[] = [];
  rows.forEach((r, i) => {
    const label = name(r.route);
    if (i % 2 === 0)
      questions.push(
        choice([...WHO], `On ${common ? "this" : "our"} route tree, what is the ${r.n} route?`, label, others(labels.length >= 4 ? labels : [...labels, ...BASIC.map(name)], label), `${r.n} is the ${label}: ${ROUTE_BY_KEY.get(r.route)!.describe}.`, {
          core: i < 4,
        }),
      );
    else
      questions.push(
        choice([...WHO], `What number is the ${label} on ${common ? "this" : "our"} route tree?`, r.n, others(numbers, r.n), `The ${label} is ${r.n}.`, {
          core: i < 4,
        }),
      );
  });
  const pictured = rows.filter((r) => ROUTE_BY_KEY.get(r.route)!.depth >= 5).slice(0, 3);
  const asks = ["The receiver runs the route drawn here. What number is it?", "What number do we call the route in this picture?", "Here is one route from the tree. What's its number?"];
  pictured.forEach((r, i) =>
    questions.push(choice([...WHO], asks[i]!, r.n, others(numbers, r.n), `That's the ${name(r.route)}: ${r.n}.`, { diagram: routePic([{ key: r.route }], true) })),
  );
  if (pattern) questions.push(trueFalse([...WHO], `On ${common ? "this" : "our"} route tree, odd numbers break outside and even numbers break inside.`, true, "Odd out, even in: it helps you remember every number.", { core: true }));
  return { lessons, questions };
}

function namesOnly(name: (key: string) => string): { lessons: LibLesson[]; questions: LibQuestion[] } {
  const labels = BASIC.map(name);
  const lessons = [
    lesson(
      "ALL",
      "Our routes",
      `We call our routes by name. Know each one: how deep you go and which way you break.
${BASIC.map((k) => `- ${name(k)}: ${ROUTE_BY_KEY.get(k)!.describe}`).join("\n")}`,
      { diagram: routePic(BASIC.map((k) => ({ key: k, label: name(k) }))) },
    ),
  ];
  const asks = [
    "Name this route.",
    "What route is drawn here?",
    "The receiver runs this. What's the route called?",
    "Which route is this?",
    "What do we call this route?",
    "Look at the path. Which route is it?",
    "Name the route in this picture.",
    "What route is the receiver running here?",
    "Which of our routes is drawn here?",
    "Call it: which route is this?",
  ];
  const questions = BASIC.slice(0, asks.length).map((k, i) =>
    choice([...WHO], asks[i]!, name(k), others(labels, name(k)), `That's the ${name(k)}: ${ROUTE_BY_KEY.get(k)!.describe}.`, { core: i < 4, diagram: routePic([{ key: k }], true) }),
  );
  return { lessons, questions };
}

const DEFAULT = buildRouteTree({ routeTree: null, terms: EMPTY_TERMS });

export const ROUTE_TREE_TOPIC: LibTopic = {
  key: "off_route_tree",
  version: 1,
  side: "offense",
  category: "concepts",
  name: "Your route tree",
  summary: "The team's route numbers and names, built from the route tree on Settings (a common tree until the coach sets one).",
  level: "youth",
  for: ["QB", "WR", "TE", "RB"],
  lessons: DEFAULT.lessons,
  questions: DEFAULT.questions,
  build: buildRouteTree,
};
