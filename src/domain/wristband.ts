/**
 * Wristband inserts: the calls a team wears, by number. Numbers belong to the
 * play (team-wide, so a call keeps its number from week to week), the card is
 * sized to the coach's own band, and each position can get a card with only
 * his job on every number.
 */
import { z } from "zod";
import { BLOCK_FRONTS, resolveBlocking, type Rule } from "./blocking";
import { isDefense, isUnknown, type PlayData, type Player } from "./play";
import { assignmentText } from "./quiz";
import type { RouteTree } from "./route-tree";
import { normalizeRouteName } from "./routes";
import { EMPTY_TERMS, term, type Terms } from "./terms";

const word = z.string().trim().min(1).max(20);

/**
 * How plays are called with a band: what's said for the formation and the
 * play, dummy words, a live rule, and the coach's signals.
 */
export const CallingSchema = z.object({
  /** the formation: its name, a code word, or not said (the number covers it) */
  formation: z.enum(["name", "code", "none"]).default("name"),
  /** the play: its band number, or its word (concept systems) */
  play: z.enum(["number", "word"]).default("number"),
  /** formation (as named in the playbook) -> code words that mean it; any one of them is said */
  codeWords: z.record(z.string().max(60), z.array(word).max(8)).default({}),
  /** words that mean nothing, said to fool the other sideline */
  dummyWords: z.array(word).max(30).default([]),
  /** how many dummy words go on the end of a call */
  dummies: z.number().int().min(0).max(3).default(0),
  /** a live rule: only the number after a live word counts; a dead word and a fake number go first */
  live: z.array(word).max(6).default([]),
  dead: z.array(word).max(6).default([]),
  /** the coach's signals: "f:FORMATION", "d:0".."d:9", "w:WORD", "card:A" -> what the signal looks like */
  signals: z.record(z.string().max(70), z.string().trim().max(80)).default({}),
});
export type Calling = z.infer<typeof CallingSchema>;
export const DEFAULT_CALLING: Calling = CallingSchema.parse({});

/** One band setup: its size and look, the plays left off, its style and how plays are called with it. */
export const BandSchema = z.object({
  id: z.string().min(1).max(16),
  name: z.string().trim().min(1).max(40),
  windows: z.number().int().min(1).max(3).default(3),
  /** one window, inches */
  width: z.number().min(1.5).max(8).default(4.5),
  height: z.number().min(1).max(5).default(2.75),
  text: z.enum(["s", "m", "l"]).default("m"),
  columns: z.number().int().min(1).max(4).default(2),
  colorBy: z.enum(["none", "type", "formation"]).default("type"),
  /** drawings on player cards */
  drawings: z.boolean().default(false),
  /** drawings on the QB and coach card */
  qbDrawings: z.boolean().default(false),
  /** with drawings: how many calls per window (fewer = bigger pictures) */
  pictures: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6), z.literal(8)]).default(8),
  /** calls left off this band (still in the install or plan) */
  off: z.array(z.string()).default([]),
  /** list: number and call; grid: row word and column number ("BLUE 3"); cards: A/B/C with different numbers */
  style: z.enum(["list", "grid", "cards"]).default("list"),
  gridRows: z.array(word).min(1).max(10).default(["BLUE", "RED", "GREEN", "BLACK", "WHITE", "GOLD"]),
  gridCols: z.number().int().min(2).max(10).default(6),
  cards: z.number().int().min(2).max(3).default(3),
  /** change it to reshuffle cards B and C */
  cardSeed: z.number().int().min(0).max(1_000_000).default(1),
  calling: CallingSchema.default(DEFAULT_CALLING),
});
export type Band = z.infer<typeof BandSchema>;
export const newBand = (id: string, name: string): Band => BandSchema.parse({ id, name });

export const WristbandSchema = z.object({
  /** call key (a play id, or "c:" + the play part when numbering by concept) -> its number (team-wide, each number once) */
  numbers: z.record(z.string(), z.string().trim().min(1).max(6)).default({}),
  /** call key -> a short name for the band (the play's name when absent) */
  labels: z.record(z.string(), z.string().trim().max(40)).default({}),
  /** how new calls get numbers: 1, 2, 3... or 3-digit codes the other sideline can't read */
  numbering: z.enum(["order", "code"]).default("order"),
  /** a number for each play, or one per concept so it's the same number from any formation */
  numbersBy: z.enum(["play", "concept"]).default("play"),
  bands: z.array(BandSchema).max(12).default([]),
  /** the band whose calls players learn in their quizzes (the first when unset) */
  teachBand: z.string().nullable().default(null),
});
export type Wristband = z.infer<typeof WristbandSchema>;
export const DEFAULT_BAND: Band = newBand("main", "Main band");
export const DEFAULT_WRISTBAND: Wristband = { ...WristbandSchema.parse({}), bands: [DEFAULT_BAND] };

const BAND_KEYS = ["windows", "width", "height", "text", "columns", "colorBy", "drawings", "qbDrawings", "pictures", "off"] as const;

/** Read what's stored, keeping anything bad out (and a first-version band becomes "Main band"). */
export function wristbandFrom(raw: unknown): Wristband {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const top = WristbandSchema.omit({ bands: true }).safeParse(obj);
  const base = top.success ? top.data : { ...DEFAULT_WRISTBAND };
  let bands: Band[] = [];
  if (Array.isArray(obj.bands)) for (const b of obj.bands) {
    const r = BandSchema.safeParse(b);
    if (r.success && !bands.some((x) => x.id === r.data.id)) bands.push(r.data);
  }
  if (!bands.length) {
    // the first version kept one band's settings at the top
    const old: Record<string, unknown> = { id: "main", name: "Main band" };
    for (const k of BAND_KEYS) if (k in obj) old[k] = obj[k];
    const r = BandSchema.safeParse(old);
    bands = [r.success ? r.data : DEFAULT_BAND];
  }
  return { ...base, bands: bands.slice(0, 12) };
}

/** A band by id, else the first. */
export function bandOf(w: Wristband, id?: string | null): Band {
  return w.bands.find((b) => b.id === id) ?? w.bands[0] ?? DEFAULT_BAND;
}

export const TEXT_PT: Record<Band["text"], number> = { s: 6, m: 7.5, l: 9 };
const PAD = 0.06; // inches of padding inside a window

/** Number order: 1, 2, 10 (numbers as numbers), then anything else A to Z. */
export function byNumber(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  const ia = Number.isFinite(na) && /^\d+$/.test(a);
  const ib = Number.isFinite(nb) && /^\d+$/.test(b);
  if (ia && ib) return na - nb;
  if (ia !== ib) return ia ? -1 : 1;
  return a.localeCompare(b);
}

/**
 * Numbers for calls that don't have one yet. Calls that have one keep it.
 * "order" gives the next free numbers from 1; "code" gives unused 3-digit codes.
 */
export function assignNumbers(numbers: Record<string, string>, ids: string[], numbering: Wristband["numbering"], rand: () => number = Math.random): Record<string, string> {
  const out = { ...numbers };
  const used = new Set(Object.values(out));
  let next = 1;
  for (const id of ids) {
    if (out[id]) continue;
    let n: string;
    if (numbering === "code") {
      let tries = 0;
      do n = String(100 + Math.floor(rand() * 900));
      while (used.has(n) && ++tries < 2000);
      if (used.has(n)) for (let k = 100; k < 1000 && used.has(n); k++) n = String(k);
    } else {
      while (used.has(String(next))) next++;
      n = String(next);
    }
    out[id] = n;
    used.add(n);
  }
  return out;
}

/**
 * Give a call a number. A number belongs to one call: whoever had it loses it
 * (returned, so the coach can be told).
 */
export function setNumber(numbers: Record<string, string>, id: string, value: string): { numbers: Record<string, string>; bumped: string | null } {
  const v = value.trim();
  const out = { ...numbers };
  const bumped = Object.entries(out).find(([k, n]) => k !== id && n === v)?.[0] ?? null;
  if (bumped) delete out[bumped];
  if (v) out[id] = v;
  else delete out[id];
  return { numbers: out, bumped };
}

/** Swap two calls' numbers (moving a call up or down the band). */
export function swapNumbers(numbers: Record<string, string>, a: string, b: string): Record<string, string> {
  const out = { ...numbers };
  const na = out[a];
  const nb = out[b];
  if (nb) out[a] = nb;
  else delete out[a];
  if (na) out[b] = na;
  else delete out[b];
  return out;
}

/** Renumber these calls in this order, from the lowest number they use now (or 1). */
export function renumber(numbers: Record<string, string>, ids: string[], numbering: Wristband["numbering"], rand: () => number = Math.random): Record<string, string> {
  const out = { ...numbers };
  for (const id of ids) delete out[id];
  if (numbering === "code") {
    // fresh codes, then sorted so the band reads in this order
    const fresh = assignNumbers(out, ids, "code", rand);
    const codes = ids.map((id) => fresh[id]!).sort(byNumber);
    ids.forEach((id, i) => (out[id] = codes[i]!));
    return out;
  }
  const used = new Set(Object.values(out));
  let n = 1;
  for (const id of ids) {
    while (used.has(String(n))) n++;
    out[id] = String(n);
    used.add(String(n++));
  }
  return out;
}

// ---------- fitting the band ----------

/** The grid in one window: columns and rows of calls (drawings take bigger cells). */
export const PICTURE_GRID: Record<Band["pictures"], [number, number]> = { 1: [1, 1], 2: [2, 1], 4: [2, 2], 6: [3, 2], 8: [4, 2] };

export function gridOf(w: Pick<Band, "width" | "height" | "text" | "columns"> & { pictures?: Band["pictures"] }, drawings = false): { cols: number; rows: number } {
  const inner = { w: w.width - 2 * PAD, h: w.height - 2 * PAD };
  if (drawings) {
    // the coach's pick, narrowed when the window is too small for it
    const [c, r] = PICTURE_GRID[w.pictures ?? 8];
    return { cols: Math.max(1, Math.min(c, Math.floor(inner.w / 0.9))), rows: Math.max(1, Math.min(r, Math.floor((inner.h - 0.14) / 0.8))) };
  }
  const line = (TEXT_PT[w.text] * 1.25) / 72;
  return { cols: w.columns, rows: Math.max(1, Math.floor((inner.h - line) / line)) }; // one line for the header
}

/** How many calls fit in one window. */
export function perWindow(w: Pick<Band, "width" | "height" | "text" | "columns"> & { pictures?: Band["pictures"] }, drawings = false): number {
  const g = gridOf(w, drawings);
  return g.cols * g.rows;
}

/** Split the calls into windows; `over` is how many didn't fit. */
export function fitWindows<T>(calls: T[], w: Band, drawings = false): { windows: T[][]; over: number; per: number } {
  const per = perWindow(w, drawings);
  const windows: T[][] = [];
  for (let i = 0; i < w.windows; i++) windows.push(calls.slice(i * per, i * per + per));
  return { windows, over: Math.max(0, calls.length - per * w.windows), per };
}

/** How many copies of a set of windows fit on a letter page (0.4in margins, 0.1in between). */
export function copiesPerPage(w: Pick<Band, "width" | "height" | "windows">): number {
  const across = Math.max(1, Math.floor((7.7 + 0.1) / (w.width + 0.1)));
  const down = Math.max(1, Math.floor((10.2 + 0.1) / (w.height + 0.1)));
  return Math.max(1, Math.floor((across * down) / w.windows));
}

// ---------- colors ----------

/** Light fills that still read in black and white. */
export const GROUP_COLORS = ["#dbeafe", "#fde68a", "#dcfce7", "#fecaca", "#e9d5ff", "#fed7aa", "#cffafe", "#f5f5f4"];

export const TYPE_NAME: Record<string, string> = {
  run: "Run",
  pass: "Pass",
  play_action: "Play action",
  rpo: "RPO",
  screen: "Screen",
  option: "Option",
  special: "Special",
  defense: "Defense",
};

export function groupOf(data: PlayData, by: Band["colorBy"]): string | null {
  if (by === "none") return null;
  if (by === "formation") return !isUnknown(data.formation.name) && data.formation.name ? data.formation.name.toUpperCase() : "Other";
  if (isDefense(data)) return "Defense";
  return TYPE_NAME[String(data.play_type)] ?? "Other";
}

// ---------- each player's job ----------

const POSITION_ORDER = ["QB", "Q", "RB", "TB", "HB", "B", "FB", "F", "X", "Z", "H", "A", "SL", "Y", "TE", "WR", "LT", "LG", "C", "RG", "RT"];

/** Who gets a player card: every position letter on these calls, offense first in the usual order. */
export function positionsOf(plays: Array<{ data: PlayData }>): string[] {
  const seen = new Map<string, number>();
  for (const p of plays) for (const pl of p.data.players) seen.set(pl.id.toUpperCase(), (seen.get(pl.id.toUpperCase()) ?? 0) + 1);
  const rank = (id: string) => {
    const i = POSITION_ORDER.indexOf(id);
    return i < 0 ? POSITION_ORDER.length : i;
  };
  return [...seen.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Short rule words for a band. */
export const RULE_SHORT: Record<Rule, string> = {
  down: "Down",
  base: "Base",
  back: "Back",
  hinge: "Hinge",
  double: "Double",
  climb: "Climb",
  zone: "Zone",
  reach: "Reach",
  cutoff: "Cut off",
  pull_kick: "Pull, kick",
  pull_wrap: "Pull, wrap",
  trap: "Trap",
  kick: "Kick out",
  lead: "Lead",
  arc: "Arc",
  seal: "Seal",
  wedge: "Wedge",
  release: "Release",
};

const MOTION_WORD: Record<string, string> = { jet: "Jet", orbit: "Orbit", shift: "Shift", return: "Return", fly: "Fly", zoom: "Zoom", across: "Across" };

/**
 * A player's job on a call, in a few words: "5 Out", "Down", "Carry, B gap".
 * Blockers on a play with a blocking scheme get their rule; receivers get the
 * team's route number when the team numbers its routes.
 */
export function jobOnCall(data: PlayData, position: string, opts: { terms?: Terms; tree?: RouteTree | null } = {}): string | null {
  const terms = opts.terms ?? EMPTY_TERMS;
  const pos = position.toUpperCase();
  const p: Player | undefined = data.players.find((x) => x.id.toUpperCase() === pos) ?? data.players.find((x) => x.position.toUpperCase() === pos);
  if (!p) return null;
  const parts: string[] = [];
  if (data.motion?.player && data.motion.player.toUpperCase() === p.id.toUpperCase()) {
    const t = String(data.motion.type);
    parts.push(`${MOTION_WORD[t] ?? "Motion"}${isUnknown(data.motion.direction) ? "" : ` ${data.motion.direction}`}`);
  }
  let job: string | null = null;
  if (!isDefense(data) && data.blocking && p.assignment_type !== "route") {
    try {
      const r = resolveBlocking(data, data.blocking, BLOCK_FRONTS[0]);
      const b = r.blocks.find((x) => x.id === p.id);
      if (b) job = RULE_SHORT[b.rule] ?? b.rule;
      if (!job && r.carrier?.id === p.id) job = `Carry, ${data.blocking.hole === "edge" ? "edge" : `${data.blocking.hole} gap`} ${data.blocking.side}`;
    } catch {
      // fall through to the drawn job
    }
  }
  if (!job && p.assignment_type === "route" && p.route) {
    const key = normalizeRouteName(p.route.name);
    const n = opts.tree?.numbered ? opts.tree.routes.find((r) => r.route === key)?.n : undefined;
    const name = term(terms, "routes", key);
    job = n ? `${n} ${name}` : name;
  }
  if (!job && data.run_details && data.run_details.ball_carrier?.toUpperCase() === p.id.toUpperCase()) {
    const poa = data.run_details.point_of_attack;
    job = isUnknown(poa) || !poa ? "Carry" : `Carry, ${poa}`;
  }
  if (!job) {
    const t = assignmentText(p, terms);
    job = t && !/^unknown$/i.test(t) ? t : null;
  }
  // nothing drawn for him: what his spot does on this kind of play
  if (!job && !isDefense(data)) {
    const passing = ["pass", "play_action", "screen", "rpo"].includes(String(data.play_type));
    const qb = /^(QB|Q)$/.test(p.id.toUpperCase());
    if (qb && passing) {
      const reads = data.pass_details?.progression.map((s) => s.player).filter(Boolean) ?? [];
      job = reads.length ? `Read ${reads.slice(0, 3).join("-")}` : "Pass";
    } else if (qb && data.play_type === "run") job = "Hand off";
    else if (passing && /^(LT|LG|C|RG|RT|OL|T|G)$/.test(p.id.toUpperCase())) job = "Pass pro";
  }
  if (job) parts.push(job);
  return parts.join(" ▸ ") || null;
}
