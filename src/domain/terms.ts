/**
 * The coach's terminology. Every label a player sees goes through `term()`,
 * so quizzes always use the coach's words for positions, routes, concepts,
 * coverages and read keys.
 */
import { z } from "zod";
import { LIBRARY_BY_KEY } from "./concepts";
import { COVERAGE_LABEL, READ_KEY_BY_KEY, REACTIONS } from "./defense";
import type { Coverage } from "./play";
import { ROUTE_BY_KEY, normalizeRouteName } from "./routes";

export const TermsSchema = z.object({
  positions: z.record(z.string(), z.string()).default({}),
  routes: z.record(z.string(), z.string()).default({}),
  concepts: z.record(z.string(), z.string()).default({}),
  coverages: z.record(z.string(), z.string()).default({}),
  read_keys: z.record(z.string(), z.string()).default({}),
});
export type Terms = z.infer<typeof TermsSchema>;
export const EMPTY_TERMS: Terms = TermsSchema.parse({});

export type TermKind = keyof Terms;

const BLOCK_LABEL: Record<string, string> = {
  zone: "Zone block",
  down: "Down block",
  kick_out: "Kick out",
  pull: "Pull",
  pass_pro: "Pass protect",
  reach: "Reach block",
  combo: "Combo block",
  double: "Double team",
  base: "Base block",
  cut: "Cut block",
  seal: "Seal block",
  arc: "Arc block",
  climb: "Climb to the linebacker",
};

const ASSIGNMENT_LABEL: Record<string, string> = {
  carry: "Carry the ball",
  fake: "Fake",
  mesh: "Mesh / fake handoff",
  pass_pro: "Pass protect",
  lead: "Lead block",
  block: "Block",
  route: "Run a route",
};

export function term(terms: Terms, kind: TermKind, key: string): string {
  const custom = terms[kind][key];
  if (custom) return custom;
  switch (kind) {
    case "routes": {
      const k = normalizeRouteName(key);
      return terms.routes[k] ?? ROUTE_BY_KEY.get(k)?.label ?? title(key);
    }
    case "concepts":
      return LIBRARY_BY_KEY.get(key)?.name ?? title(key);
    case "coverages":
      return COVERAGE_LABEL[key as Coverage] ?? title(key);
    case "read_keys":
      return READ_KEY_BY_KEY.get(key)?.label ?? title(key);
    case "positions":
      return key;
  }
}

export function blockLabel(type: string): string {
  if (!type || type === "unknown") return "Block";
  return BLOCK_LABEL[type] ?? title(type);
}
export function assignmentLabel(type: string): string {
  return ASSIGNMENT_LABEL[type] ?? title(type);
}
export function reactionLabel(key: string): string {
  return REACTIONS.find((r) => r.key === key)?.label ?? title(key);
}

export function title(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
