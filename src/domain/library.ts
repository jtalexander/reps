/**
 * The playbook library: everything in a playbook that isn't a single drawn
 * play. Concepts (with rules by position or receiver number, tags, signals),
 * formations, terms (formation tags, motions, shifts, backfield sets) and
 * reading pages. Each is a row in `plays` with a `kind` other than "play";
 * its data lives in `plays.item`.
 *
 * Several pages can describe one item (a run concept's rules page and its
 * diagrams-vs-fronts page). Items are keyed by kind + normalized name and
 * merged rather than duplicated.
 */
import { z } from "zod";
import type { PlayData, Point } from "./play";

export const LIBRARY_KINDS = ["concept", "formation", "term", "reading"] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export const LIBRARY_KIND_LABEL: Record<LibraryKind, string> = {
  concept: "Concepts",
  formation: "Formations",
  term: "Tags & motions",
  reading: "Reading",
};

export const CONCEPT_FAMILIES = ["run", "pass", "screen", "gadget", "special", "unknown"] as const;
export const TERM_CATEGORIES = ["formation_tag", "motion", "shift", "backfield", "other"] as const;
export type TermCategory = (typeof TERM_CATEGORIES)[number];
export const TERM_CATEGORY_LABEL: Record<TermCategory, string> = {
  formation_tag: "Formation tag",
  motion: "Motion",
  shift: "Shift",
  backfield: "Backfield set",
  other: "Other",
};

/** Which receiver set a rule applies to. */
export const RULE_SETS = ["all", "2_receiver", "3_receiver"] as const;
export type RuleSet = (typeof RULE_SETS)[number];
export const RULE_SET_LABEL: Record<RuleSet, string> = {
  all: "All sets",
  "2_receiver": "2-receiver side",
  "3_receiver": "3-receiver side",
};

export const RuleSchema = z.object({
  /** a position letter (QB, F, X, OL, LT...) or a receiver number (#1, #2, #3) */
  who: z.string(),
  set: z.enum(RULE_SETS).default("all"),
  assignment: z.string(),
  coaching_points: z.string().nullable().default(null),
});
export type Rule = z.infer<typeof RuleSchema>;

export const ConceptItemSchema = z.object({
  name: z.string(),
  family: z.enum(CONCEPT_FAMILIES).default("unknown"),
  /** the word used to call it at the line, e.g. "Vikings" for Veer */
  code_name: z.string().nullable().default(null),
  signal: z.string().nullable().default(null),
  summary: z.string().nullable().default(null),
  qb_read: z
    .object({ read: z.string().nullable().default(null), danger: z.string().nullable().default(null) })
    .default({ read: null, danger: null }),
  rules: z.array(RuleSchema).default([]),
  tags: z.array(z.object({ name: z.string(), meaning: z.string() })).default([]),
  example_calls: z.array(z.string()).default([]),
  /** titles of the diagrams drawn for it ("VEER RIGHT vs 4-4", "2 Receiver Rules") */
  diagrams: z.array(z.string()).default([]),
});
export type ConceptItem = z.infer<typeof ConceptItemSchema>;

export const FormationPlayerSchema = z.object({ id: z.string(), x: z.number(), y: z.number() });
export const FormationItemSchema = z.object({
  name: z.string(),
  family: z.string().nullable().default(null),
  side: z.enum(["left", "right"]).nullable().default(null),
  personnel: z.string().nullable().default(null),
  /** yards from the ball (x right, y downfield; backfield is negative) */
  players: z.array(FormationPlayerSchema).default([]),
});
export type FormationItem = z.infer<typeof FormationItemSchema>;

export const TermItemSchema = z.object({
  name: z.string(),
  category: z.enum(TERM_CATEGORIES).default("other"),
  meaning: z.string(),
  who: z.array(z.string()).default([]),
  example: z.string().nullable().default(null),
});
export type TermItem = z.infer<typeof TermItemSchema>;

export const ReadingItemSchema = z.object({
  title: z.string(),
  text: z.string(),
});
export type ReadingItem = z.infer<typeof ReadingItemSchema>;

export type LibraryItem =
  | { kind: "concept"; data: ConceptItem }
  | { kind: "formation"; data: FormationItem }
  | { kind: "term"; data: TermItem }
  | { kind: "reading"; data: ReadingItem };

export const ITEM_SCHEMA = {
  concept: ConceptItemSchema,
  formation: FormationItemSchema,
  term: TermItemSchema,
  reading: ReadingItemSchema,
} as const;

export function parseItem(kind: LibraryKind, raw: unknown): LibraryItem["data"] {
  return ITEM_SCHEMA[kind].parse(raw);
}

/** "Spread  Right " -> "SPREAD RIGHT"; used to find the same item across pages. */
export function nameKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/[’']/g, "'")
    .replace(/[^A-Z0-9#'&\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function itemName(item: LibraryItem): string {
  return item.kind === "reading" ? item.data.title : item.data.name;
}

// ---------------- readiness ----------------

export interface ItemReadiness {
  missing: string[];
  complete: boolean;
}

export function itemReadiness(item: LibraryItem): ItemReadiness {
  const missing: string[] = [];
  const blank = (s: string | null | undefined) => !s || !s.trim() || s.trim().toLowerCase() === "unknown";
  switch (item.kind) {
    case "concept": {
      const c = item.data;
      if (blank(c.name)) missing.push("Concept name");
      if (c.family === "unknown") missing.push("Run, pass, screen or gadget");
      if (c.rules.length === 0) missing.push("At least one assignment rule");
      if (c.rules.some((r) => blank(r.who) || blank(r.assignment))) missing.push("Every rule needs who and the assignment");
      break;
    }
    case "formation": {
      const f = item.data;
      if (blank(f.name)) missing.push("Formation name");
      if (f.players.length < 7) missing.push("At least 7 players placed");
      if (!f.players.some((p) => p.id === "C")) missing.push("The center (C)");
      break;
    }
    case "term": {
      const t = item.data;
      if (blank(t.name)) missing.push("Name");
      if (blank(t.meaning)) missing.push("What it tells players to do");
      break;
    }
    case "reading": {
      if (blank(item.data.title)) missing.push("Title");
      if (blank(item.data.text)) missing.push("Text");
      break;
    }
  }
  return { missing, complete: missing.length === 0 };
}

// ---------------- merging ----------------

const same = (a: string, b: string) => nameKey(a) === nameKey(b);

/** Merge a newly read piece of a concept into what's stored; never drops coach edits. */
export function mergeConcept(base: ConceptItem, add: ConceptItem): ConceptItem {
  const rules = [...base.rules];
  for (const r of add.rules) {
    const i = rules.findIndex((x) => same(x.who, r.who) && x.set === r.set);
    if (i < 0) rules.push(r);
    else if (!rules[i]!.coaching_points && r.coaching_points) rules[i] = { ...rules[i]!, coaching_points: r.coaching_points };
  }
  const tags = [...base.tags];
  for (const t of add.tags) if (!tags.some((x) => same(x.name, t.name))) tags.push(t);
  const uniq = (xs: string[]) => [...new Map(xs.map((x) => [nameKey(x), x])).values()];
  return {
    name: base.name,
    family: base.family !== "unknown" ? base.family : add.family,
    code_name: base.code_name ?? add.code_name,
    signal: base.signal ?? add.signal,
    summary: base.summary ?? add.summary,
    qb_read: { read: base.qb_read.read ?? add.qb_read.read, danger: base.qb_read.danger ?? add.qb_read.danger },
    rules,
    tags,
    example_calls: uniq([...base.example_calls, ...add.example_calls]),
    diagrams: uniq([...base.diagrams, ...add.diagrams]),
  };
}

export function mergeItem(base: LibraryItem, add: LibraryItem): LibraryItem {
  if (base.kind !== add.kind) return base;
  switch (base.kind) {
    case "concept":
      return { kind: "concept", data: mergeConcept(base.data, add.data as ConceptItem) };
    case "formation": {
      const a = add.data as FormationItem;
      return { kind: "formation", data: base.data.players.length >= a.players.length ? base.data : { ...a, name: base.data.name } };
    }
    case "term": {
      const a = add.data as TermItem;
      return { kind: "term", data: { ...base.data, meaning: base.data.meaning || a.meaning, example: base.data.example ?? a.example, who: [...new Set([...base.data.who, ...a.who])] } };
    }
    case "reading": {
      const a = add.data as ReadingItem;
      return { kind: "reading", data: { ...base.data, text: base.data.text.includes(a.text) ? base.data.text : `${base.data.text}\n\n${a.text}` } };
    }
  }
}

// ---------------- formations ----------------

/** Where a player lines up, in words a player would use. */
export function spotOf(p: { id: string; x: number; y: number }, all: { id: string; x: number; y: number }[]): string {
  if (p.id === "QB") return p.y < -3 ? "Shotgun" : "Under center";
  const ol = all.filter((o) => /^(LT|LG|C|RG|RT)$/.test(o.id));
  const edge = ol.length ? Math.max(...ol.map((o) => Math.abs(o.x))) : 2.6;
  const side = p.x < -0.5 ? "left" : p.x > 0.5 ? "right" : "middle";
  const ax = Math.abs(p.x);
  const off = p.y < -0.6;
  if (p.y < -2.5 && ax <= edge + 1.5) return side === "middle" ? "Backfield, behind the QB" : `Backfield ${side}`;
  if (ax <= edge + 2) return off ? `Wing ${side}` : `Tight end ${side}`;
  // how many eligible players line up outside this one on the same side
  const outside = all.filter((o) => Math.sign(o.x) === Math.sign(p.x) && Math.abs(o.x) > ax + 0.5 && !/^(LT|LG|C|RG|RT|QB)$/.test(o.id));
  if (outside.length === 0) return `Wide ${side}${off ? ", off the line" : ", on the line"}`;
  return `Slot ${side}${off ? "" : ", on the line"}`;
}

/** A formation as a PlayData the renderer can draw (no assignments). */
export function formationAsPlay(f: FormationItem): PlayData {
  const side = (x: number) => (x < -1 ? "left" : x > 1 ? "right" : "middle") as "left" | "right" | "middle";
  return {
    name: f.name,
    play_type: "unknown",
    concept_key: null,
    formation: { name: f.name, personnel: f.personnel ?? "unknown", strength: f.side ?? "unknown", backfield_alignment: "unknown" },
    motion: null,
    players: f.players.map((p) => ({
      id: p.id,
      position: p.id,
      x: p.x,
      y: p.y,
      on_ball: p.y > -0.6,
      side: side(p.x),
      split: null,
      assignment_type: "unknown",
      route: null,
      block: null,
      path: null,
      notes: null,
    })),
    run_details: null,
    option_details: null,
    pass_details: null,
    coaching_points: [],
    field_confidence: {},
    suggested: [],
    from_concept: [],
  };
}

/**
 * Pixels to yards for one small formation diagram: the offensive line sets
 * the scale (adjacent linemen ~1.3 yards apart), the center is the ball.
 */
export function formationToYards(players: Array<{ id: string; x: number; y: number }>): Array<{ id: string; x: number; y: number }> {
  const c = players.find((p) => p.id === "C");
  if (!c) return players;
  const ol = players.filter((p) => /^(LT|LG|C|RG|RT)$/.test(p.id)).sort((a, b) => a.x - b.x);
  const gaps = ol.slice(1).map((p, i) => p.x - ol[i]!.x).filter((g) => g > 1).sort((a, b) => a - b);
  const ppy = gaps.length ? gaps[Math.floor(gaps.length / 2)]! / 1.3 : 20;
  const round = (n: number) => Math.round(n * 10) / 10;
  return players.map((p) => ({ id: p.id, x: round((p.x - c.x) / ppy), y: Math.min(0, round((c.y - p.y) / ppy)) }));
}

export type { Point };
