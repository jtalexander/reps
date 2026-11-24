/**
 * A team's naming rules: what each position letter means, the words that
 * build a formation and a play call, and the order they're said in. Reps
 * drafts them from the playbook; the coach corrects and confirms them.
 * Used to name players and plays when Reps turns drawings into plays.
 */
import { z } from "zod";

export const WordSchema = z.object({
  word: z.string().describe("the word or number exactly as the playbook writes it, e.g. 'TRIPS', 'ZIP', 'JET', '7'"),
  means: z.string().describe("what it tells the players, in the coach's words, one or two short sentences"),
  pages: z.array(z.number().int()).describe("playbook pages that show or explain it"),
});
export type Word = z.infer<typeof WordSchema>;

export const RouteTreeWordSchema = z.object({
  number: z.string().describe("the route's number as the playbook writes it, e.g. '2'"),
  route: z.string().describe("the route name as the playbook writes it, e.g. 'Slant'"),
});

export const NamingSchema = z.object({
  positions: z
    .array(
      z.object({
        letter: z.string().describe("the letter on the diagrams: X, Z, Y, H, F, Q..."),
        name: z.string().describe("what the playbook calls the position, e.g. 'Split end', 'Slot', 'Running back'"),
        role: z.enum(["QB", "RB", "WR", "TE", "OL", "flex"]),
        notes: z.string().describe("where he usually lines up, in a few words; empty if the playbook doesn't say"),
      }),
    )
    .describe("every position letter used, skill players first, then the line"),
  direction: z.object({
    words: z.array(z.object({ word: z.string(), side: z.enum(["left", "right"]) })).describe("RIGHT/LEFT and any code words for a side"),
    rule: z.string().describe("what the direction word moves, e.g. 'RIGHT puts Y and Z on the right'"),
  }),
  call_order: z.array(z.string()).describe("the parts of a full play call in the order they're said, e.g. Formation, Formation tag, Motion, Play, Direction, Play tag"),
  formations: z.array(WordSchema).describe("base formation words"),
  formation_tags: z.array(WordSchema).describe("words added to a formation that move players (ZIP, ZOOT, STACK, BUNCH...)"),
  backfields: z.array(WordSchema).describe("backfield set words"),
  motions: z.array(WordSchema).describe("motion and shift words or numbers"),
  plays: z.array(WordSchema).describe("run, pass, screen and gadget play names, with what each one is"),
  other: z.array(WordSchema).describe("protections, tempos, cadence and audible words, and other calls"),
  /** older drafts don't have it */
  route_tree: z.array(RouteTreeWordSchema).optional(),
});
export type Naming = z.infer<typeof NamingSchema>;

/** What the model fills in: the same, with the route tree always answered (empty when there's none). */
export const NamingDraftSchema = NamingSchema.extend({
  route_tree: z
    .array(RouteTreeWordSchema)
    .describe("the numbered route tree if the playbook shows one: each number and the route it calls, e.g. 2 = Slant; empty if the playbook doesn't number routes"),
});

export const NAMING_LISTS = ["formations", "formation_tags", "backfields", "motions", "plays", "other"] as const;
export type NamingList = (typeof NAMING_LISTS)[number];
export const NAMING_LIST_LABEL: Record<NamingList, string> = {
  formations: "Formations",
  formation_tags: "Formation tags",
  backfields: "Backfield sets",
  motions: "Motions and shifts",
  plays: "Plays",
  other: "Protections, tempos and other calls",
};

/** The rules as short text, for the drawing reader. */
export function namingBrief(n: Naming | null): string {
  if (!n) return "";
  const pos = n.positions.map((p) => `${p.letter} = ${p.name} (${p.role})${p.notes ? `, ${p.notes}` : ""}`).join("; ");
  const words = (list: Word[]) => list.map((w) => w.word).join(", ");
  return [
    `Position letters: ${pos}.`,
    `Direction: ${n.direction.rule}`,
    `Formations: ${words(n.formations)}. Tags: ${words(n.formation_tags)}. Backfields: ${words(n.backfields)}. Motions: ${words(n.motions)}.`,
  ].join("\n");
}
