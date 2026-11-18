/**
 * Page-level reading. Most playbooks are more than drawn plays: concept
 * pages with rules tables, formation sheets, tag/motion definitions and text
 * pages. The model first decides the page type, then fills only that
 * section. Pure: no SDK, no I/O.
 */
import { z } from "zod";
import { EXTRACTION_SYSTEM, ExtractedSchema } from "./extraction";
import {
  ConceptItemSchema,
  FormationItemSchema,
  ReadingItemSchema,
  TermItemSchema,
  formationToYards,
  type ConceptItem,
  type FormationItem,
  type ReadingItem,
  type TermItem,
} from "./library";

export const PAGE_TYPES = ["play", "concept", "formation_sheet", "definitions", "reading", "not_playbook"] as const;
export type PageType = (typeof PAGE_TYPES)[number];

const nullableStr = z.string().nullable();

export const ExtractedPageSchema = z.object({
  page_type: z.enum(PAGE_TYPES),
  play: ExtractedSchema.nullable().describe("only when page_type is play: one drawn play with players and paths"),
  concept: z
    .object({
      name: z.string().describe("the concept name as printed, e.g. SMASH, VEER, HITCH"),
      family: z.enum(["run", "pass", "screen", "gadget", "special", "unknown"]),
      code_name: nullableStr.describe("the code word used to call it at the line, if printed, e.g. 'Vikings' from 'Minnesota Vikings – Hug Self as if Cold'"),
      signal: nullableStr.describe("the hand signal if printed, e.g. 'Hug self as if cold'"),
      summary: nullableStr,
      qb_read: z.object({ read: nullableStr.describe("who or what the QB reads"), danger: nullableStr }),
      rules: z
        .array(
          z.object({
            who: z.string().describe("position letter as printed (QB, F, X, Y, Z, H, OL, LT, LG, C, RG, RT, FB, RB) or receiver number #1, #2, #3"),
            set: z.enum(["all", "2_receiver", "3_receiver"]).describe("2_receiver / 3_receiver when the table splits rules that way, else all"),
            assignment: z.string().describe("the assignment text, verbatim"),
            coaching_points: nullableStr.describe("coaching points for this row, verbatim"),
          }),
        )
        .describe("every row of the assignment table; empty if the page has no table"),
      tags: z.array(z.object({ name: z.string(), meaning: z.string() })).describe("tags or variations explained on the page, e.g. DUPE: tells #2 to duplicate #1's route"),
      example_calls: z.array(z.string()).describe("full play calls printed on the page, e.g. 'SPREAD RIGHT, SMASH DIVIDE'"),
      diagrams: z.array(z.string()).describe("title of each diagram on the page, e.g. 'VEER RIGHT vs 4-4', '2 Receiver Rules'"),
    })
    .nullable(),
  formations: z
    .array(
      z.object({
        name: z.string().describe("formation name exactly as printed above the diagram, e.g. SPREAD RIGHT INVERT"),
        family: nullableStr.describe("the section heading, e.g. '2 x 2 – No TE'"),
        players: z
          .array(z.object({ id: z.string(), x: z.number(), y: z.number() }))
          .describe("every offensive marker in this diagram, pixel centers. Letters as printed; the 5 linemen LT LG C RG RT left to right (C is the square); an unlabeled circle behind the line is QB"),
      }),
    )
    .describe("only for formation sheets: one entry per diagram"),
  definitions: z
    .array(
      z.object({
        name: z.string().describe("the term, e.g. ZAX, INVERT, RETURN, TRADE, RINGO"),
        category: z.enum(["formation_tag", "motion", "shift", "backfield", "other"]),
        meaning: z.string().describe("what it tells players to do, verbatim or nearly"),
        who: z.array(z.string()).describe("positions it affects, e.g. ['Z','X']"),
        example: nullableStr.describe("example call printed with it, e.g. 'SPREAD RIGHT ZAX'"),
      }),
    )
    .describe("for pages that define formation tags, motions, shifts or backfield sets"),
  reading: z
    .object({ title: z.string(), text: z.string() })
    .nullable()
    .describe("for text pages: philosophy, goals, tempo, cadence, how we call plays, audibles"),
  confidence: z.array(z.object({ path: z.string(), level: z.enum(["high", "medium", "low"]) })),
});
export type ExtractedPage = z.infer<typeof ExtractedPageSchema>;

const PLAY_RULES = EXTRACTION_SYSTEM.split("Rules\n")[1] ?? "";

export const PAGE_SYSTEM = `You read one page (or one boxed section of a page) from an American football offensive playbook and return its contents as data. Players will be quizzed on what you return, so never guess: copy text faithfully, use "unknown" or empty values when something isn't there, and list anything you're unsure of in "confidence".

First decide page_type:
- play: ONE drawn play (players with routes or blocks drawn) and little or no rules text. Fill "play" using the play rules below.
- concept: a page about one concept or play family (run, pass, screen, gadget). Usually has a title (SMASH, VEER, HITCH), an assignment table (POS / ASSIGNMENT / COACHING POINTS, often by receiver number #1 #2 #3 with "2 Receiver Rules" and "3 Receiver Rules"), maybe tags or variations, a hand signal, and one or more diagrams (sometimes the same play drawn against several defensive fronts). Fill "concept". Do not fill "play" for these.
- formation_sheet: many small formation diagrams, each with a name above it. Fill "formations" with every diagram.
- definitions: a page defining formation tags (INVERT, STACK, ZAX...), motions (numbered or named), shifts, or backfield sets. Fill "definitions" with every term on the page.
- reading: text to read (philosophy, goals, tempos, snap count or cadence, how we call plays, wristbands, audibles). Fill "reading" with a title and the text, keeping the coach's words.
- not_playbook: covers, section dividers with only a title, blank pages, logos.

Leave every section that doesn't match the page type null or empty.

Play rules (only when page_type is play):
${PLAY_RULES}`;

/** Library items read from one page, ready to store (formations converted to yards). */
export interface PageItems {
  pageType: PageType;
  concept: ConceptItem | null;
  formations: FormationItem[];
  terms: TermItem[];
  reading: ReadingItem | null;
}

const up = (s: string) => s.trim().toUpperCase();

export function toPageItems(e: ExtractedPage): PageItems {
  const concept =
    e.page_type === "concept" && e.concept && e.concept.name.trim()
      ? ConceptItemSchema.parse({
          ...e.concept,
          name: up(e.concept.name),
          rules: e.concept.rules
            .filter((r) => r.assignment.trim())
            .map((r) => ({ ...r, who: up(r.who).replace(/^NO\.?\s*/, "#") })),
        })
      : null;
  const formations =
    e.page_type === "formation_sheet"
      ? e.formations
          .filter((f) => f.name.trim() && f.players.length >= 5)
          .map((f) => {
            const name = up(f.name);
            const side = /\bLEFT\b/.test(name) ? "left" : /\bRIGHT\b/.test(name) ? "right" : null;
            const players = formationToYards(f.players.map((p) => ({ ...p, id: up(p.id).replace(/^Q$/, "QB") })));
            return FormationItemSchema.parse({ name, family: f.family, side, players });
          })
      : [];
  const terms =
    e.page_type === "definitions"
      ? e.definitions
          .filter((d) => d.name.trim() && d.meaning.trim())
          .map((d) => TermItemSchema.parse({ ...d, name: up(d.name), who: d.who.map(up) }))
      : [];
  const reading = e.page_type === "reading" && e.reading?.text.trim() ? ReadingItemSchema.parse(e.reading) : null;
  return { pageType: e.page_type, concept, formations, terms, reading };
}
