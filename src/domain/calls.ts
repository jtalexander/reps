/**
 * How a team calls plays. Every team configures its own system; nothing is
 * hard-wired to one playbook. Pieces:
 *
 * - order: the slots of a full verbal call, in the order the team says them
 *   ("Spread Right Zax, Smash Divide" = formation, formation_tag, concept, concept_tag).
 * - direction words: words that mean left or right ("East", "Moon", "Red").
 * - audible word: what tells players an audible is coming ("Music, Music").
 * - code names / signals live on each concept (library) and are used here.
 * - cadences: named snap counts and when they're used.
 * - wristbands: cards that turn a short code into a call, with the team's
 *   decoding rules (live digit, odd/even direction, OPPO, combined codes,
 *   snap count from the last digit).
 *
 * Pure: decode/encode functions are unit-tested against real examples.
 */
import { z } from "zod";

export const CALL_SLOTS = [
  "formation",
  "formation_tag",
  "backfield",
  "motion",
  "protection",
  "concept",
  "direction",
  "concept_tag",
] as const;
export type CallSlot = (typeof CALL_SLOTS)[number];
export const CALL_SLOT_LABEL: Record<CallSlot, string> = {
  formation: "Formation",
  formation_tag: "Formation tag",
  backfield: "Backfield set",
  motion: "Motion / shift",
  protection: "Protection",
  concept: "Concept / play",
  direction: "Direction",
  concept_tag: "Play tag",
};

export const CALL_METHODS = ["verbal", "code_names", "signals", "wristband", "direction_words", "cadence"] as const;
export type CallMethod = (typeof CALL_METHODS)[number];
export const CALL_METHOD_LABEL: Record<CallMethod, string> = {
  verbal: "Full verbal call (huddle or line call)",
  code_names: "Code names (\"Vikings\" = Veer)",
  signals: "Hand signals",
  wristband: "Wristband cards",
  direction_words: "Direction words (\"East\" = right)",
  cadence: "Cadence / snap counts",
};

const Side = z.enum(["left", "right"]);

export const WristbandEntrySchema = z.object({
  /** pod (color or number) for play cards; null for a formation card */
  pod: z.string().nullable().default(null),
  /** what's called: "ALPHA", "6", "36" */
  code: z.string(),
  /** what it means: "SPREAD RIGHT", "DASH", "TRIPS RIGHT F, 900 VO, F-PIVOT" */
  call: z.string(),
});
export type WristbandEntry = z.infer<typeof WristbandEntrySchema>;

export const WristbandSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** formation card: alphabet-style codes; play card: pod + number codes */
  type: z.enum(["formation", "play"]),
  /** play cards: the ways a code can be spoken ("WHITE 36", "431", "BROWN 6") */
  formats: z.array(z.enum(["color_number", "digits", "code"])).default(["code"]),
  /** pods in order: name (a color or number) */
  pods: z.array(z.object({ name: z.string(), number: z.number().int() })).default([]),
  /** "COLOR ##": which of the two digits is live */
  live_digit: z.enum(["first", "second"]).default("second"),
  /** "###": which pair (pod digit + play digit) is live */
  live_pair: z.enum(["first_two", "last_two"]).default("last_two"),
  /** odd / even live digit sets the direction ("left"/"right"), or null to leave the call as is */
  odd: Side.nullable().default(null),
  even: Side.nullable().default(null),
  /** formation cards: word that flips the formation ("OPPO") */
  flip_word: z.string().nullable().default(null),
  /** formation cards: two codes in a row combine both calls */
  combine: z.boolean().default(false),
  /** last digit picks the snap count: e.g. { odd: "Odd", even: "Even", "3": "Three" } */
  snap_by_last_digit: z.record(z.string(), z.string()).default({}),
  entries: z.array(WristbandEntrySchema).default([]),
});
export type Wristband = z.infer<typeof WristbandSchema>;

export const CadenceSchema = z.object({
  name: z.string(),
  call: z.string(),
  when: z.string().nullable().default(null),
});
export type Cadence = z.infer<typeof CadenceSchema>;

export const CallSystemSchema = z.object({
  methods: z.array(z.enum(CALL_METHODS)).default(["verbal"]),
  order: z.array(z.enum(CALL_SLOTS)).default(["formation", "formation_tag", "motion", "concept", "direction", "concept_tag"]),
  /** separator spoken between the formation part and the play part, shown as ", " */
  direction_words: z.array(z.object({ word: z.string(), side: Side })).default([]),
  audible_word: z.string().nullable().default(null),
  /** word that cancels the first call and runs the second ("Kill") */
  kill_word: z.string().nullable().default(null),
  cadences: z.array(CadenceSchema).default([]),
  wristbands: z.array(WristbandSchema).default([]),
});
export type CallSystem = z.infer<typeof CallSystemSchema>;
export const DEFAULT_CALL_SYSTEM: CallSystem = CallSystemSchema.parse({});

export const MILITARY_ALPHABET = [
  "ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL", "INDIA", "JULIET", "KILO", "LIMA", "MIKE",
  "NOVEMBER", "OSCAR", "PAPA", "QUEBEC", "ROMEO", "SIERRA", "TANGO", "UNIFORM", "VICTOR", "WHISKEY", "XRAY", "YANKEE", "ZULU",
];

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Flip every LEFT/RIGHT in a call. */
export function flipCall(call: string): string {
  return call.replace(/\b(LEFT|RIGHT|Left|Right|left|right)\b/g, (m) =>
    ({ LEFT: "RIGHT", RIGHT: "LEFT", Left: "Right", Right: "Left", left: "right", right: "left" })[m]!,
  );
}

/** Put a direction on a base call that doesn't already name one. */
export function withDirection(call: string, side: "left" | "right" | null): string {
  if (!side || /\b(LEFT|RIGHT)\b/i.test(call)) return call;
  return `${call} ${side.toUpperCase()}`;
}

export interface Decoded {
  call: string;
  snap: string | null;
  steps: string[];
}

/** Decode a spoken wristband call. Returns null when it doesn't match the card. */
export function decodeWristband(band: Wristband, spoken: string): Decoded | null {
  const words = norm(spoken).split(" ").filter(Boolean);
  if (words.length === 0) return null;
  const steps: string[] = [];

  if (band.type === "formation") {
    const flip = band.flip_word ? norm(band.flip_word) : null;
    const codes = words.filter((w) => w !== flip);
    const flipped = flip ? words.includes(flip) : false;
    const found = codes.map((c) => band.entries.find((e) => norm(e.code) === c));
    if (found.length === 0 || found.some((f) => !f)) return null;
    if (found.length > 1 && !band.combine) return null;
    let call = found.map((f) => f!.call).join(", ");
    steps.push(...found.map((f) => `${f!.code} = ${f!.call}`));
    if (flipped) {
      call = flipCall(call);
      steps.push(`${band.flip_word} flips it: ${call}`);
    }
    return { call, snap: null, steps };
  }

  // play cards: try each way this card can be spoken
  const [first, second] = words;
  if (band.formats.includes("color_number") && words.length === 2 && /^\d{2}$/.test(second ?? "")) {
    const pod = band.pods.find((p) => norm(p.name) === first);
    if (pod) {
      const digits = second!;
      const live = band.live_digit === "first" ? digits[0]! : digits[1]!;
      const s = [`${pod.name} = pod ${pod.number}; the ${band.live_digit} digit is live: ${live}`];
      const r = finishPlay(band, pod, live, digits, s);
      if (r) return r;
    }
  }
  if (band.formats.includes("digits")) {
    const digits = words.join("");
    if (/^\d{3}$/.test(digits)) {
      const pair = band.live_pair === "first_two" ? digits.slice(0, 2) : digits.slice(1);
      const pod = band.pods.find((p) => p.number === Number(pair[0]));
      if (pod) {
        const s = [`The ${band.live_pair === "first_two" ? "first two" : "last two"} digits are live: ${pair} → pod ${pod.number} (${pod.name}), play ${pair[1]}`];
        const r = finishPlay(band, pod, pair[1]!, digits, s);
        if (r) return r;
      }
    }
  }
  if (band.formats.includes("code")) {
    // "BROWN 6" or "6"
    const pod = band.pods.find((p) => norm(p.name) === first);
    const code = pod ? second : first;
    const entry = band.entries.find((e) => norm(e.code) === code && (!pod || norm(e.pod ?? "") === norm(pod.name)));
    if (entry) {
      steps.push(`${spoken.trim()} = ${entry.call}`);
      return { call: entry.call, snap: snapFor(band, words.join(""), steps), steps };
    }
  }
  return null;
}

function finishPlay(band: Wristband, pod: Wristband["pods"][number], live: string, digits: string, steps: string[]): Decoded | null {
  const entry = band.entries.find((e) => norm(e.pod ?? "") === norm(pod.name) && norm(e.code) === live);
  if (!entry) return null;
  const n = Number(live);
  const side = n % 2 === 1 ? band.odd : band.even;
  const call = withDirection(entry.call, side);
  steps.push(`${pod.name} ${live} = ${entry.call}${side ? `; ${live} is ${n % 2 ? "odd" : "even"} → ${side}` : ""}`);
  return { call, snap: snapFor(band, digits, steps), steps };
}

function snapFor(band: Wristband, digits: string, steps: string[]): string | null {
  const last = digits.replace(/\D/g, "").slice(-1);
  if (!last || Object.keys(band.snap_by_last_digit).length === 0) return null;
  const rules = band.snap_by_last_digit;
  const snap = rules[last] ?? (Number(last) % 2 ? rules.odd : rules.even) ?? null;
  if (snap) steps.push(`Last digit ${last} → snap count ${snap}`);
  return snap;
}

/** Every code a wristband can produce, with what it decodes to (for quizzes). */
export function wristbandExamples(band: Wristband, max = 40): Array<{ spoken: string; decoded: Decoded }> {
  const out: Array<{ spoken: string; decoded: Decoded }> = [];
  for (const e of band.entries) {
    let spoken: string;
    if (band.type === "formation") spoken = e.code;
    else if (band.formats[0] === "color_number" && e.pod) {
      const filler = String((Number(e.code) * 3 + 1) % 10);
      spoken = band.live_digit === "first" ? `${e.pod} ${e.code}${filler}` : `${e.pod} ${filler}${e.code}`;
    } else if (band.formats[0] === "digits" && e.pod) {
      const pod = band.pods.find((p) => norm(p.name) === norm(e.pod!));
      if (!pod) continue;
      const filler = String((pod.number + Number(e.code) + 4) % 10);
      spoken = band.live_pair === "first_two" ? `${pod.number}${e.code}${filler}` : `${filler}${pod.number}${e.code}`;
    } else spoken = e.pod ? `${e.pod} ${e.code}` : e.code;
    const decoded = decodeWristband(band, spoken);
    if (decoded) out.push({ spoken, decoded });
    if (band.type === "formation" && band.flip_word) {
      const f = decodeWristband(band, `${e.code} ${band.flip_word}`);
      if (f) out.push({ spoken: `${e.code} ${band.flip_word}`, decoded: f });
    }
    if (out.length >= max) break;
  }
  return out;
}

/** "Vikings East" -> "VEER RIGHT" using code names and direction words. */
export function decodeCodeName(
  spoken: string,
  system: CallSystem,
  codeNames: Array<{ code: string; concept: string }>,
): Decoded | null {
  const words = norm(spoken).split(" ");
  const steps: string[] = [];
  const hit = codeNames.find((c) => words.includes(norm(c.code)));
  if (!hit) return null;
  steps.push(`${hit.code} = ${hit.concept}`);
  const dir = system.direction_words.find((d) => words.includes(norm(d.word)));
  if (dir) steps.push(`${dir.word} = ${dir.side}`);
  return { call: withDirection(hit.concept.toUpperCase(), dir?.side ?? null), snap: null, steps };
}

export interface CallParts {
  formation?: string;
  formation_tag?: string;
  backfield?: string;
  motion?: string;
  protection?: string;
  concept?: string;
  direction?: "left" | "right";
  concept_tag?: string;
}

/**
 * Build a verbal call in the team's order. The formation group and the play
 * group are separated by a comma, as most teams write them.
 */
export function composeCall(parts: CallParts, order: CallSlot[]): string {
  const formationSide: CallSlot[] = ["formation", "formation_tag", "backfield", "motion"];
  const words: Array<{ slot: CallSlot; text: string }> = [];
  for (const slot of order) {
    const v = slot === "direction" ? parts.direction?.toUpperCase() : parts[slot];
    if (v) words.push({ slot, text: String(v).toUpperCase() });
  }
  let out = "";
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const prev = words[i - 1];
    const sep = !prev ? "" : formationSide.includes(prev.slot) && !formationSide.includes(w.slot) ? ", " : " ";
    out += sep + w.text;
  }
  return out;
}

/** Wrong-order versions of a call, for "build the call" distractors. */
export function shuffledOrders(parts: CallParts, order: CallSlot[]): string[] {
  const right = composeCall(parts, order);
  const outs = new Set<string>();
  const used = order.filter((s) => (s === "direction" ? parts.direction : parts[s as keyof CallParts]));
  for (let i = 0; i < used.length; i++)
    for (let j = i + 1; j < used.length; j++) {
      const o = [...order];
      const a = o.indexOf(used[i]!);
      const b = o.indexOf(used[j]!);
      [o[a], o[b]] = [o[b]!, o[a]!];
      const s = composeCall(parts, o);
      if (s !== right) outs.add(s);
    }
  return [...outs];
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}
