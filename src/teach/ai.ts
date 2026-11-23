/**
 * The AI steps of Teach. Each one is a single structured-output call to
 * Claude with the coach's own pages attached as images.
 *
 *   decodePage   page image + text  -> topic, facts (coach's words), diagram regions
 *   findGaps     a topic's facts    -> questions for the coach (with suggestions)
 *   writeTopic   facts + answers    -> lessons by position + a small question set
 *   gradeOpen    an answer in the player's words -> score + feedback
 *   askPlaybook  a player's question -> answer from approved content only
 *
 * Pixel boxes from the model are converted to page points by the caller.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { NamingSchema } from "@/domain/naming";
import { checkAi, recordUsage } from "./usage";

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
type Effort = "low" | "medium" | "high";

export interface PageImage {
  pageNo: number;
  png: Uint8Array;
  width: number;
  height: number;
  text?: string;
}

function imageBlocks(pages: PageImage[]): Anthropic.ContentBlockParam[] {
  return pages.flatMap((p) => [
    { type: "text" as const, text: `Page ${p.pageNo} (image is ${p.width} x ${p.height} pixels):` },
    { type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: Buffer.from(p.png).toString("base64") } },
    ...(p.text ? [{ type: "text" as const, text: `Text layer of page ${p.pageNo} (may be out of order):\n${p.text}` }] : []),
  ]);
}

async function structured<T extends z.ZodType>(
  schema: T,
  system: string,
  content: Anthropic.ContentBlockParam[],
  effort: Effort,
  maxTokens: number,
  step = "other",
): Promise<z.infer<T>> {
  await checkAi();
  const client = new Anthropic({ timeout: 10 * 60 * 1000, maxRetries: 2 });
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await client.messages.parse({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        output_config: { effort, format: zodOutputFormat(schema) },
        messages: [{ role: "user", content }],
      });
      await recordUsage(MODEL, res.usage, step);
      if (res.stop_reason === "refusal") throw new Error("The model declined this request.");
      if (res.stop_reason === "max_tokens") throw new Error("The answer was too long to finish. Try fewer pages at once.");
      if (!res.parsed_output) throw new Error("The model returned nothing usable.");
      return res.parsed_output as z.infer<T>;
    } catch (err) {
      last = err;
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.BadRequestError || err instanceof Anthropic.PermissionDeniedError) break;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

const VOICE = `You are helping a football coach turn his playbook into lessons and quizzes for his players. Treat the coach's playbook as the authority: use his words, his names and his terms. Never invent football content the playbook doesn't support; when something isn't there, say so or ask.`;

// ---------------- decode ----------------

export const DecodedPageSchema = z.object({
  is_playbook_content: z.boolean().describe("false for covers, blank pages, section dividers with only a title"),
  section: z.string().nullable().describe("the section heading printed on the page, if any"),
  topic: z
    .string()
    .describe("short name of the topic this page teaches, reusing a known topic name when the page continues it (e.g. 'Snap count', 'How we call plays', 'Base formations', 'Formation tags', 'Motions', 'Veer', 'Smash')"),
  summary: z.string().describe("one or two sentences: what this page teaches"),
  facts: z
    .array(
      z.object({
        text: z.string().describe("one teachable point in the coach's words; quote rules and assignments verbatim; for drawn-only content, describe what the drawing shows plainly"),
        applies_to: z.array(z.string()).describe("who needs it: position letters as the playbook uses them (QB, F, X, Y, Z, H, OL, LT...), receiver numbers (#1, #2, #3), or ALL"),
        kind: z.string().describe("rule, alignment, read, progression, cadence, signal, call, definition, blocking, or note"),
      }),
    )
    .describe("everything a player could learn from this page; one point per fact; do not skip table rows"),
  diagrams: z
    .array(z.object({ label: z.string().describe("the diagram's title, e.g. 'SPREAD RIGHT' or 'VEER RIGHT vs 4-4'"), x: z.number(), y: z.number(), w: z.number(), h: z.number() }))
    .describe("each separate diagram on the page: its bounding box in image pixels (x, y = top-left)"),
});
export type DecodedPage = z.infer<typeof DecodedPageSchema>;

const DECODE_SYSTEM = `${VOICE}

You are reading one page of the playbook. Write down everything on it that a player could learn, as separate facts:
- text: cadence and snap counts, tempos, how plays are called (wristbands, code words, signals, direction words), formation rules and tags, motions and shifts, alignments, assignments by position or receiver number, reads, progressions, protections, coaching points, hand signals, example play calls.
- drawings: if a diagram shows something the text doesn't say (where players line up, who blocks whom, a route), describe what is drawn as a fact, e.g. "In SPREAD RIGHT, H aligns as the slot on the right, off the line."
Copy the coach's wording for rules and assignments. Keep tables complete: one fact per row, keeping the position or receiver number. Mark who each fact applies to.
Also return the bounding box of each separate diagram on the page so it can be shown to players.`;

export async function decodePage(page: PageImage, knownTopics: string[]): Promise<DecodedPage> {
  return structured(
    DecodedPageSchema,
    DECODE_SYSTEM,
    [
      ...imageBlocks([page]),
      {
        type: "text",
        text: `Known topics so far (reuse one if this page continues it): ${knownTopics.length ? knownTopics.join(", ") : "none yet"}.\nDecode page ${page.pageNo}.`,
      },
    ],
    "high",
    16000,
    "decode",
  );
}

// ---------------- gaps ----------------

export const GapsSchema = z.object({
  gaps: z
    .array(
      z.object({
        question: z.string().describe("one question to the coach, short and specific, in football language"),
        why: z.string().describe("why a player needs this (one sentence)"),
        applies_to: z.array(z.string()),
        page_no: z.number().int().nullable(),
        suggestion: z
          .string()
          .nullable()
          .describe("a likely answer based on how this is commonly coached, ONLY when one is reasonable; null when only the coach can know (his terms, his signals, his rules)"),
      }),
    )
    .describe("the most important gaps first; at most 8"),
});
export type Gaps = z.infer<typeof GapsSchema>;

const GAPS_SYSTEM = `${VOICE}

Coaches put part of their offense in the playbook and keep the rest in their head. You are looking at one topic of the playbook (the pages and the facts already taken from them). List what a player at each position would still need in order to execute or understand it, but the playbook doesn't say. Examples: a pass play with no read or progression for the QB; a formation that doesn't say where a player aligns or how deep; a term used but never defined; rules for #1 and #2 but not #3; a cadence word whose meaning isn't explained; a contradiction between pages.
Ask only what matters for teaching this topic, most important first, at most 8. Don't ask about things the coach already answered, and don't ask about anything another topic of the playbook covers (you get the list of other topics with what each one covers); a gap is something the whole playbook leaves out. Offer a suggested answer only when one is reasonable and common; it will be shown to the coach as a suggestion to approve or correct.`;

export async function findGaps(topic: string, facts: string, pages: PageImage[], answered: string, otherTopics = "", shared = ""): Promise<Gaps> {
  return structured(
    GapsSchema,
    GAPS_SYSTEM,
    [
      ...imageBlocks(pages),
      {
        type: "text",
        text: `Topic: ${topic}\n\nFacts taken from these pages:\n${facts}\n\nAlready answered by the coach:\n${answered || "nothing yet"}\n\nOther topics in this playbook and what they cover (don't ask about these here):\n${otherTopics || "none"}\n\n${shared ? `How other coaches answered questions about the same football concept (use only to make your suggested answers better and more typical; the concept may be called something else here, so write every suggestion in THIS playbook's terms, and never mention other coaches or teams):\n${shared}\n\n` : ""}List the gaps.`,
      },
    ],
    "medium",
    8000,
    "gaps",
  );
}

export const TriageSchema = z.object({
  key: z.array(z.number().int()).describe("numbers of the open questions players most need answered, at most the per-topic limit for each topic"),
  same: z
    .array(
      z.object({
        keep: z.number().int().describe("the question to ask (or the one already answered)"),
        also: z.array(z.number().int()).describe("questions under OTHER topics that one answer would also settle"),
      }),
    )
    .describe("groups of questions that ask the same thing under different topics"),
});
export type Triage = z.infer<typeof TriageSchema>;

const TRIAGE_SYSTEM = `${VOICE}

Reps found questions to ask the coach about what his playbook leaves out, topic by topic. Answering hundreds is too much for a coach, so sort them.
1. For each topic, pick the open questions a player most needs answered to execute or understand that topic: at most the per-topic limit you're given, fewer when the rest are nice-to-know. Prefer questions about what a player must do (alignment, assignment, read, rule, cadence word) over background or philosophy.
2. Find questions under different topics that ask the same thing, so one answer settles all of them (for example the same term asked about under three plays, or the same alignment rule for one formation asked again under each play). Only group questions whose single answer would fully answer each one; similar wording about different plays is NOT the same question. Questions marked "already answered" can be the one kept in a group.
Use the question numbers as given.`;

export async function triageGaps(list: string, perTopic: number): Promise<Triage> {
  return structured(
    TriageSchema,
    TRIAGE_SYSTEM,
    [{ type: "text", text: `Per-topic limit: ${perTopic}\n\nQuestions, as [topic] question (why):\n${list}\n\nSort them.` }],
    "medium",
    16000,
    "triage",
  );
}

// ---------------- core questions ----------------

export const CoreSchema = z.object({
  core: z.array(z.number().int()).describe("numbers of the must-know questions, most important first, at most the limit"),
});

const CORE_SYSTEM = `${VOICE}

Reps wrote more quiz questions for one topic than a coach can review at once. Pick the core set: the few questions that check what every player in this topic must know to line up and do his job (alignment, assignment, read, rule, the call). The rest stay in reserve for later.
- Stay within the limit you're given.
- Cover each position group that has questions before giving any group a second one.
- Prefer questions about doing the job over background or terminology trivia, and skip near-duplicates.
- Mix formats when the choice is otherwise even (a tap-the-diagram question is a strong check of alignment).
Use the question numbers as given.`;

/** Pick up to `limit` must-know questions from a topic's numbered draft list. */
export async function pickCore(topic: string, list: string, limit: number, approved = ""): Promise<z.infer<typeof CoreSchema>> {
  const already = approved ? `Already approved and live on this topic (players have these; pick what adds to them):\n${approved}\n\n` : "";
  return structured(
    CoreSchema,
    CORE_SYSTEM,
    [{ type: "text", text: `Topic: ${topic}\nLimit: ${limit}\n\n${already}Draft questions, as number. [who it's for] (format) question -> answer:\n${list}\n\nPick the core set.` }],
    "low",
    4000,
    "core",
  );
}

// ---------------- write lessons and questions ----------------

export const WrittenTopicSchema = z.object({
  lessons: z
    .array(
      z.object({
        audience: z.enum(["ALL", "QB", "RB", "WR", "TE", "OL"]).describe("who it's for; write ALL lessons for what everyone needs (cadence, calls), position lessons for jobs"),
        title: z.string(),
        body: z.string().describe("a short lesson in plain words for a player, 80-250 words, using the coach's terms; short paragraphs or bullet lines starting with '- '"),
        source_pages: z.array(z.number().int()),
      }),
    )
    .describe("one lesson per audience that has something to learn in this topic"),
  questions: z
    .array(
      z.object({
        audience: z.array(z.enum(["ALL", "QB", "RB", "WR", "TE", "OL"])),
        format: z.enum(["choice", "tap", "order", "open"]),
        prompt: z.string(),
        choices: z.array(z.string()).describe("choice: 3-4 options, the first is correct (they are shuffled later); other formats: empty"),
        order_items: z.array(z.string()).describe("order: the steps or reads IN THE CORRECT ORDER; other formats: empty"),
        tap: z
          .object({
            page_no: z.number().int(),
            diagram_label: z.string().describe("which diagram to show (its label)"),
            target_label: z.string().describe("what the right spot is, e.g. 'H, the slot on the right'"),
            x: z.number(),
            y: z.number(),
            w: z.number(),
            h: z.number(),
          })
          .nullable()
          .describe("tap: the correct spot as a box in PAGE IMAGE pixels on that page (around the player marker, about 40-60 px); else null"),
        model_answer: z.string().nullable().describe("open: a model answer in the coach's words; else null"),
        key_points: z.array(z.string()).describe("open: what a right answer must include; else empty"),
        explanation: z.string().describe("why the answer is right, from the playbook or the coach's interview answers"),
        source_pages: z.array(z.number().int()),
        show_page: z.number().int().nullable().describe("a page whose diagram helps with this question (choice/order/open), or null"),
        show_diagram_label: z.string().nullable(),
      }),
    )
    .describe("a small set: about 3-5 questions per audience, mixing formats; every answer must come from the facts or the coach's answers"),
});
export type WrittenTopic = z.infer<typeof WrittenTopicSchema>;

const WRITE_SYSTEM = `${VOICE}

Write lessons and quiz questions for one topic of the playbook, for players by position. This is a teaching and assessment tool: lessons explain the topic for that player; questions check whether he knows it.
Use only the facts and the coach's interview answers you are given (the page images are there to see the drawings). If something is missing, leave it out; never fill it in from general football knowledge.
Question formats:
- choice: multiple choice, 3-4 options, plausible wrong answers taken from the same playbook (other routes, other formations, other rules).
- tap: show one diagram and ask the player to tap a spot (where he lines up, who he reads, who he blocks). Give the correct spot as a box in page-image pixels around the right marker.
- order: put steps in order (a progression, a cadence, the steps of a read).
- open: the player answers in his own words ("What's your rule on Smash as #2?"); give a model answer and the key points a right answer must include.
Keep questions short and phone-friendly. Each question needs an explanation the player sees after answering.`;

/** `approved`: what the coach already approved on this topic; write only what adds to it. */
export async function writeTopic(topic: string, facts: string, answered: string, diagrams: string, pages: PageImage[], approved = ""): Promise<WrittenTopic> {
  const already = approved
    ? `Already approved and live (do NOT repeat or rephrase these; write only lessons and questions that add something they don't cover, such as the coach's newer answers. Writing nothing is fine when they already cover it all):\n${approved}\n\n`
    : "";
  return structured(
    WrittenTopicSchema,
    WRITE_SYSTEM,
    [
      ...imageBlocks(pages),
      {
        type: "text",
        text: `Topic: ${topic}\n\nFacts from the playbook:\n${facts}\n\nThe coach's interview answers:\n${answered || "none"}\n\nDiagrams available (page: label):\n${diagrams || "none"}\n\n${already}Write the lessons and questions.`,
      },
    ],
    "high",
    20000,
    "write",
  );
}

// ---------------- grading and asking ----------------

export const GradeSchema = z.object({
  score: z.number().min(0).max(1).describe("1 = has every key point, 0 = wrong or empty; partial credit for some key points"),
  feedback: z.string().describe("one or two sentences to the player: what was right, what was missing"),
});

export async function gradeOpen(prompt: string, modelAnswer: string, keyPoints: string[], answer: string) {
  return structured(
    GradeSchema,
    `${VOICE}\n\nGrade a player's answer against the coach's model answer and key points. Judge meaning, not wording or spelling. Be fair and brief.`,
    [{ type: "text", text: `Question: ${prompt}\nModel answer: ${modelAnswer}\nKey points:\n- ${keyPoints.join("\n- ")}\n\nPlayer's answer: ${answer || "(blank)"}` }],
    "low",
    2000,
    "grade",
  );
}

export const AskSchema = z.object({
  answered: z.boolean().describe("false when the approved material doesn't cover the question"),
  answer: z.string().describe("the answer for the player, in the coach's words, 1-5 sentences; when not covered, say it isn't in the playbook yet and to ask the coach"),
  source_pages: z.array(z.number().int()),
});

export async function askPlaybook(question: string, position: string, material: string) {
  return structured(
    AskSchema,
    `${VOICE}\n\nA player is asking about his team's playbook. Answer ONLY from the approved material below (lessons, question explanations and the coach's own answers). If the material doesn't cover it, say so and tell him to ask his coach. Never answer from general football knowledge. Cite the playbook pages you used.`,
    [{ type: "text", text: `Approved material:\n${material}\n\nPlayer's position: ${position}\nQuestion: ${question}` }],
    "low",
    2000,
    "ask",
  );
}

// ---------------- drawings -> plays ----------------

const yd = z.object({ x: z.number().describe("yards from the ball, right +"), y: z.number().describe("yards from the line of scrimmage, downfield +, backfield -") });

/**
 * One drawing, kept small on purpose: where each offensive player really
 * lines up and the line drawn from him, in yards. Playbook drawings aren't to
 * scale, so the model places players by football norms, not by pixels.
 * Reads, rules and coaching points come from Teach's facts, not the picture.
 */
export const DrawingSchema = z.object({
  is_play: z.boolean().describe("false when the box isn't a field drawing with offensive players (a legend, a list, a logo)"),
  kind: z.enum(["formation", "run", "pass", "play_action", "screen", "option", "protection", "special", "unknown"]),
  formation_name: z.string().describe("the formation as written in the label or on the drawing, e.g. 'SPREAD RIGHT'; 'unknown' if none"),
  players: z
    .array(
      z.object({
        id: z.string().describe("the letter in the marker (X, Z, Y, H, F, Q...). Unlabeled linemen: LT, LG, C, RG, RT left to right"),
        at: yd,
        on_ball: z.boolean().describe("on the line of scrimmage"),
        does: z.enum(["route", "block", "carry", "fake", "mesh", "pass_pro", "lead", "motion_only", "nothing_drawn"]),
        route_name: z.string().nullable().describe("standard route name when it's a route (go, slant, hitch, out, curl, dig, post, corner, flat, wheel, drag, seam, swing, bubble...), else null"),
        path: z.array(yd).nullable().describe("the line drawn from this player, start to end, up to 6 points, in field yards; null when nothing is drawn"),
      }),
    )
    .describe("offensive players only, never defenders"),
  motion: z.object({ player: z.string(), end: yd.describe("where the motion ends, field yards") }).nullable(),
  front: z.string().nullable().describe("the defense it's drawn against when the label or drawing names one (e.g. '4-3 Under'), else null"),
});
export type Drawing = z.infer<typeof DrawingSchema>;

const DRAWING_SYSTEM = `${VOICE}

You turn one football diagram, cropped from the coach's playbook, into data: where each OFFENSIVE player really lines up and the line drawn from him, in yards.
- Coordinates are field yards with the ball at (0, 0): x to the right (+) as the offense faces up, y downfield (+) and into the backfield (-).
- Playbook drawings are NOT to scale. Keep the drawing's order (who is left/right of whom, who is on or off the ball, who is deeper) but place players where they really line up: linemen about 1.3 yards apart center to center; a tight end 1.3 yards outside the tackle; off-the-ball receivers and wings 1 yard back; a slot about 6-8 yards from the ball; a wide receiver about 12-16 yards from the ball (closer when the drawing shows him tight or the label says so); shotgun QB 5 yards deep, pistol 4, under center 1; backs as drawn relative to the QB (beside him in the gun, 5-7 yards deep in the I).
- Lines: follow the drawn shape and its turns; use realistic depths (a hitch or stick at 5-6 yards, a slant breaks at 2-3, an out or dig at 10-12, a corner or post breaks at 10-12 and keeps going, a go runs 20+). A block is a short line (1-3 yards) to its target. A carry follows the drawn path through the hole. Up to 6 points per line, starting at the player.
- Offensive players are circles, squares or letters on the offense's side. Ignore every defender (triangles, Vs, letters past the ball) and the throw line from QB to a receiver.
- Line endings: arrow = route or carry; a short bar (T) = block; a wavy or dashed line before the snap = motion.
- When one image shows two half-field rule drawings, use the one for the most receivers and put the others in their normal spots with nothing_drawn.
- Never invent a line that isn't drawn: use nothing_drawn and path null.
- A formation drawing with no lines is kind "formation"; a protection drawing is kind "protection".`;

export async function readDrawing(png: Uint8Array, width: number, height: number, label: string, notes: string, naming = ""): Promise<Drawing> {
  return structured(
    DrawingSchema,
    DRAWING_SYSTEM,
    [
      { type: "image", source: { type: "base64", media_type: "image/png", data: Buffer.from(png).toString("base64") } },
      {
        type: "text",
        text: `The image is ${width} by ${height} pixels.
The playbook labels this drawing: ${label}
${notes ? `What the page says around it:
${notes}
` : ""}${naming ? `The team's naming rules (use these letters for every player, including unlabeled markers: the passer is the QB letter, backs get their back letters):
${naming}
` : ""}Return the drawing as data.`,
      },
    ],
    "high",
    12000,
    "drawing",
  );
}

// ---------------- naming rules ----------------

const NAMING_SYSTEM = `${VOICE}

From what Reps read on every page of the playbook, write down the team's naming rules: what each position letter is, the words that build a formation and a play call, and the order a call is said in.
- Use only what the playbook shows or says; keep the coach's exact words and spellings. Leave a list empty rather than invent.
- "means" is what the word tells players to do or where it puts them, in one or two short sentences.
- Formation tags are words added to a formation that move players (e.g. ZIP, ZOOT, STACK); list each once, not once per formation.
- Plays: every run, pass, screen and gadget name, with what it is in a few words.
- Leave out wristband codes (ALPHA, BRAVO..., pod colors and numbers) and team code names for plays; those are a separate system. "other" is for protections, tempos, cadence words, audible and check words.
- List the pages where each word is shown or explained.`;

export async function draftNaming(material: string) {
  return structured(
    NamingSchema,
    NAMING_SYSTEM,
    [{ type: "text", text: `${material}

Write the team's naming rules.` }],
    "high",
    24000,
    "naming",
  );
}
