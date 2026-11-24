/**
 * Shapes shared by the AI steps, the database and the screens.
 * Zod schemas double as the model's structured-output contracts.
 */
import { z } from "zod";

/** A region of a page image, in PDF points from the page's top-left. */
export const BoxSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export type Box = z.infer<typeof BoxSchema>;

/** Something a page teaches, in the coach's words. */
export const FactSchema = z.object({
  id: z.string(),
  text: z.string(),
  /** who it's for: position letters as the playbook uses them (QB, F, X, Y, Z, H, OL, LT...), receiver numbers (#1, #2, #3), or ALL */
  appliesTo: z.array(z.string()),
  /** the AI's label for organizing: rule, alignment, read, progression, cadence, signal, call, definition, note */
  kind: z.string(),
  /** "page" (decoded) or "coach" (from the interview) */
  source: z.enum(["page", "coach"]).default("page"),
  pageNo: z.number().int().nullable().default(null),
});
export type Fact = z.infer<typeof FactSchema>;

export const DiagramRegionSchema = z.object({
  id: z.string(),
  label: z.string(),
  box: BoxSchema,
});
export type DiagramRegion = z.infer<typeof DiagramRegionSchema>;

// ---------------- questions ----------------

export const ChoiceDataSchema = z.object({
  kind: z.literal("choice"),
  choices: z.array(z.object({ id: z.string(), text: z.string() })).min(2),
  answer: z.string(),
});
export const TapDataSchema = z.object({
  kind: z.literal("tap"),
  /** the correct spot on the shown image, in page points; a tap inside it is right */
  target: BoxSchema,
  /** what the right spot is, for the explanation ("H, slot right") */
  targetLabel: z.string(),
});
export const OrderDataSchema = z.object({
  kind: z.literal("order"),
  /** in the correct order */
  items: z.array(z.string()).min(2),
});
export const OpenDataSchema = z.object({
  kind: z.literal("open"),
  modelAnswer: z.string(),
  /** what a right answer must include */
  keyPoints: z.array(z.string()).min(1),
});
export const QuestionDataSchema = z.discriminatedUnion("kind", [ChoiceDataSchema, TapDataSchema, OrderDataSchema, OpenDataSchema]);
export type QuestionData = z.infer<typeof QuestionDataSchema>;

/** The page image shown with a question: the whole page, or a crop of it. */
export const QuestionImageSchema = z.object({ pageNo: z.number().int(), box: BoxSchema.nullable() });
export type QuestionImage = z.infer<typeof QuestionImageSchema>;

export const AUDIENCES = ["ALL", "QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "SP"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_LABEL: Record<Audience, string> = {
  ALL: "Everyone",
  QB: "Quarterbacks",
  RB: "Running backs",
  WR: "Receivers",
  TE: "Tight ends",
  OL: "Offensive line",
  DL: "Defensive line",
  LB: "Linebackers",
  DB: "Defensive backs",
  SP: "Kickers, punters & snappers",
};

/** Map a player's position (as the coach writes it) to an audience group. */
export function audienceOf(position: string, groups: Record<string, string[]>): Audience {
  const p = position.toUpperCase();
  for (const a of AUDIENCES) if (a === p || (groups[a] ?? []).includes(p)) return a;
  return "ALL";
}

/** Does content for these audiences reach a player in this group? */
export function reaches(audience: string[] | string, group: Audience): boolean {
  const list = Array.isArray(audience) ? audience : [audience];
  return list.includes("ALL") || list.includes(group);
}
