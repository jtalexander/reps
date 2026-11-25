/**
 * The play: the backbone of the app. One JSON document per play, validated
 * with zod everywhere it enters (model output, coach edits, seeds).
 *
 * Conventions
 * - `"unknown"` means "not read yet / not sure". `null` means "does not apply"
 *   (a run play has `pass_details: null`). The AI must use "unknown" rather
 *   than guess; the review screen lists every unknown as a to-do.
 * - Field geometry is in yards from the ball: x to the right (offense view,
 *   facing the defense), y downfield (+) / backfield (-). The line of
 *   scrimmage is y = 0.
 * - Player `id`s are the position letters the coach's diagram uses (X, Z, Y,
 *   H, F, QB, RB, LT...). Every reference to a player (progression, motion,
 *   ball carrier) uses that id.
 */
import { z } from "zod";

export const UNKNOWN = "unknown" as const;
export type Unknown = typeof UNKNOWN;

export const PLAY_TYPES = [
  "run",
  "pass",
  "play_action",
  "rpo",
  "screen",
  "option",
  "special",
] as const;
export type PlayType = (typeof PLAY_TYPES)[number];

export const CONFIDENCE = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export const MOTION_TYPES = ["jet", "orbit", "shift", "return", "fly", "zoom", "across"] as const;
export const ASSIGNMENT_TYPES = [
  "route",
  "block",
  "carry",
  "fake",
  "mesh",
  "pass_pro",
  "lead",
] as const;
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];
/** A defender's job on a defensive call. */
export const DEF_ASSIGNMENT_TYPES = ["rush", "gap", "zone_drop", "man", "blitz", "contain", "spy"] as const;
export type DefAssignmentType = (typeof DEF_ASSIGNMENT_TYPES)[number];
/** Zones a defender drops to. */
export const DEF_ZONES = ["deep_third", "deep_half", "deep_quarter", "flat", "curl", "hook", "middle_hole", "deep_middle"] as const;

export const BLOCK_TYPES = [
  "zone",
  "down",
  "kick_out",
  "pull",
  "pass_pro",
  "reach",
  "combo",
  "double",
  "base",
  "cut",
  "seal",
  "arc",
  "climb",
] as const;

export const QB_DROPS = ["shotgun_catch", "1_step", "3_step", "5_step", "play_action", "rollout", "sprint_out"] as const;
export const COVERAGES = ["cover_0", "cover_1", "cover_2", "cover_3", "cover_4"] as const;
export type Coverage = (typeof COVERAGES)[number];

export const OPTION_TYPES = ["read", "zone_read", "triple", "speed", "rpo", "midline", "power_read"] as const;
export const POSITIONS = [
  "QB",
  "RB",
  "FB",
  "X",
  "Z",
  "Y",
  "H",
  "F",
  "TE",
  "WR",
  "LT",
  "LG",
  "C",
  "RG",
  "RT",
] as const;

const str = z.string();
/** a value the AI may not know */
const maybe = <T extends z.ZodType>(t: T) => z.union([t, z.literal(UNKNOWN)]);
const point = z.tuple([z.number(), z.number()]);
export type Point = z.infer<typeof point>;

export const RouteSchema = z.object({
  name: str, // route vocabulary key (go, slant, ...) or "unknown" or "custom"
  depth_yards: maybe(z.number()),
  break_direction: maybe(z.enum(["in", "out", "none"])),
  notes: str.nullable().default(null),
  /** drawn path relative to the player, yards; only when the route is not a standard shape */
  path: z.array(point).nullable().default(null),
  /** option branches drawn dotted off the route (he reads it and picks one), each relative to the player like the route */
  options: z.array(z.array(point)).optional(),
});
export type Route = z.infer<typeof RouteSchema>;

export const BlockSchema = z.object({
  type: str,
  target: str.nullable().default(null),
  path: z.array(point).nullable().default(null),
});

/** How a coach drew a player's line by hand: solid, dotted or squiggly, ending in an arrow, a T or nothing. */
export const LineSchema = z.object({
  style: z.enum(["solid", "dotted", "squiggly"]),
  end: z.enum(["arrow", "t", "none"]),
});
export type Line = z.infer<typeof LineSchema>;

export const PlayerSchema = z.object({
  id: str,
  /** the player's position in the coach's system (often equal to id) */
  position: str,
  x: z.number(),
  y: z.number(),
  on_ball: z.boolean(),
  side: z.enum(["left", "right", "middle"]),
  split: str.nullable().default(null), // wide / slot / tight / wing / backfield
  assignment_type: maybe(z.enum([...ASSIGNMENT_TYPES, ...DEF_ASSIGNMENT_TYPES])),
  route: RouteSchema.nullable().default(null),
  block: BlockSchema.nullable().default(null),
  /** ball carrier path / fake path / lead path, relative to the player */
  path: z.array(point).nullable().default(null),
  notes: str.nullable().default(null),
  /** drawn by hand in the play builder: how the line looks (absent = Reps' usual look for the job) */
  line: LineSchema.nullable().optional(),
  /** a defender's job details: his gap ("B"), zone ("deep_third"), man (the offensive letter he covers), technique ("5") */
  def: z
    .object({ gap: str.nullable().default(null), zone: str.nullable().default(null), man: str.nullable().default(null), technique: str.nullable().default(null) })
    .nullable()
    .optional(),
});
export type Player = z.infer<typeof PlayerSchema>;

export const MotionSchema = z.object({
  player: str,
  type: maybe(z.enum(MOTION_TYPES)),
  direction: maybe(z.enum(["left", "right"])),
  timing: maybe(z.enum(["at_snap", "set"])),
  /** where the player ends up at the snap, yards from the ball */
  end: point.nullable().default(null),
  /** the motion's path as drawn, relative to the player (absent = straight to `end`) */
  path: z.array(point).nullable().optional(),
});
export type Motion = z.infer<typeof MotionSchema>;

export const ProgressionStepSchema = z.object({
  player: str,
  trigger: str, // when to go to this read / why it's open
});

export const CoverageAnswerSchema = z.object({
  target: str, // player id or "run" / "throw_away" / "unknown"
  why: str,
});

export const PassDetailsSchema = z.object({
  concept_key: str.nullable().default(null),
  concept_name: str,
  protection: str,
  qb_drop: maybe(z.enum(QB_DROPS)),
  presnap_read: str, // "unknown" when missing
  progression: z.array(ProgressionStepSchema),
  hot_or_sight_adjustment: str.nullable().default(null),
  vs_coverage: z.object({
    cover_0: CoverageAnswerSchema.nullable().default(null),
    cover_1: CoverageAnswerSchema.nullable().default(null),
    cover_2: CoverageAnswerSchema.nullable().default(null),
    cover_3: CoverageAnswerSchema.nullable().default(null),
    cover_4: CoverageAnswerSchema.nullable().default(null),
  }),
});
export type PassDetails = z.infer<typeof PassDetailsSchema>;

export const RunDetailsSchema = z.object({
  point_of_attack: str, // hole number or gap, "unknown" when missing
  scheme: str,
  ball_carrier: str,
});
export type RunDetails = z.infer<typeof RunDetailsSchema>;

export const OptionDetailsSchema = z.object({
  option_type: maybe(z.enum(OPTION_TYPES)),
  read_key: str, // defender role key from defense.ts, or "unknown"
  give_rule: str,
  keep_rule: str,
  pitch_or_pass_rule: str.nullable().default(null),
  /** what the QB does for each reaction of the read key (drives the decision quiz) */
  decisions: z
    .array(
      z.object({
        reaction: str, // defense.ts REACTIONS key
        action: z.enum(["give", "keep", "pitch", "throw"]),
      }),
    )
    .default([]),
});
export type OptionDetails = z.infer<typeof OptionDetailsSchema>;

export const FormationSchema = z.object({
  name: str,
  personnel: str, // "11", "21" ... or "unknown"
  strength: maybe(z.enum(["left", "right", "balanced"])),
  backfield_alignment: str,
});

export const PlayDataSchema = z.object({
  name: str,
  play_type: maybe(z.enum(PLAY_TYPES)),
  /** concept library key this play is linked to (any play type) */
  concept_key: str.nullable().default(null),
  formation: FormationSchema,
  motion: MotionSchema.nullable().default(null),
  players: z.array(PlayerSchema),
  run_details: RunDetailsSchema.nullable().default(null),
  option_details: OptionDetailsSchema.nullable().default(null),
  pass_details: PassDetailsSchema.nullable().default(null),
  coaching_points: z.array(str).default([]),
  /** dotted path -> confidence; absent means high (coach-entered or certain) */
  field_confidence: z.record(str, z.enum(CONFIDENCE)).default({}),
  /** dotted paths whose value came from the concept library and is not yet confirmed */
  suggested: z.array(str).default([]),
  /** dotted paths filled from the concept library; team concept edits flow into these */
  from_concept: z.array(str).default([]),
  /** a defensive call: players are the defenders (y > 0 is the defense's side) */
  side: z.enum(["offense", "defense"]).optional(),
  /** a defensive call's parts, in the coach's words */
  defense: z.object({ front: str.nullable(), coverage: str.nullable(), stunt: str.nullable(), pressure: str.nullable() }).nullable().optional(),
  /** a defensive call: the offense it's drawn against (shown faintly) */
  vs: z.array(PlayerSchema).optional(),
});
export type PlayData = z.infer<typeof PlayDataSchema>;
export const isDefense = (p: Pick<PlayData, "side">) => p.side === "defense";

export const PLAY_STATUSES = ["draft", "needs_coach_input", "approved"] as const;
export type PlayStatus = (typeof PLAY_STATUSES)[number];

export function isUnknown(v: unknown): boolean {
  return v === UNKNOWN || v === "" || v === undefined;
}

export function emptyPlay(name: string = UNKNOWN): PlayData {
  return PlayDataSchema.parse({
    name,
    play_type: UNKNOWN,
    formation: {
      name: UNKNOWN,
      personnel: UNKNOWN,
      strength: UNKNOWN,
      backfield_alignment: UNKNOWN,
    },
    players: [],
  });
}

/** Read a dotted path ("pass_details.presnap_read", "players.2.route.name"). */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Immutable set at a dotted path; creates objects along the way. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const parts = path.split(".");
  const clone = structuredClone(obj) as Record<string, unknown>;
  let cur: Record<string, unknown> = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]!;
    if (cur[k] == null || typeof cur[k] !== "object") cur[k] = /^\d+$/.test(parts[i + 1]!) ? [] : {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
  return clone as T;
}

export const isPassFamily = (t: PlayData["play_type"]) =>
  t === "pass" || t === "play_action" || t === "screen" || t === "rpo";
export const needsOptionRules = (t: PlayData["play_type"]) => t === "option" || t === "rpo";

/** Offensive linemen, by any common letters (LT..RT, or playside/backside PST, PSG, BSG, BST). */
export const isLineman = (id: string) => /^(LT|LG|C|RG|RT|OL|T|G|PST|PSG|BSG|BST|PT|PG|BT|BG)$/.test(id);

/** Players who catch, carry or read: the ones quizzes ask about. */
export function skillPlayers(play: PlayData): Player[] {
  return play.players.filter((p) => !isLineman(p.id));
}

export function playerById(play: PlayData, id: string): Player | undefined {
  return play.players.find((p) => p.id === id);
}

/** Mirror a play left/right (players learn it from both sides). */
export function flipPlay(play: PlayData): PlayData {
  const side = (s: "left" | "right" | "middle") =>
    s === "left" ? "right" : s === "right" ? "left" : s;
  const lr = <T extends string>(v: T): T =>
    (v === "left" ? "right" : v === "right" ? "left" : v) as T;
  const mirror = (pts: Point[] | null) => pts?.map(([x, y]) => [-x, y] as Point) ?? null;
  return {
    ...play,
    formation: { ...play.formation, strength: lr(play.formation.strength) },
    motion: play.motion
      ? { ...play.motion, direction: lr(play.motion.direction), end: play.motion.end ? [-play.motion.end[0], play.motion.end[1]] : null, ...(play.motion.path ? { path: mirror(play.motion.path) } : {}) }
      : null,
    players: play.players.map((p) => ({
      ...p,
      x: -p.x,
      side: side(p.side),
      route: p.route ? { ...p.route, path: mirror(p.route.path), ...(p.route.options ? { options: p.route.options.map((o) => mirror(o)!) } : {}) } : null,
      block: p.block ? { ...p.block, path: mirror(p.block.path) } : null,
      path: mirror(p.path),
    })),
    ...(play.vs ? { vs: play.vs.map((p) => ({ ...p, x: -p.x, side: side(p.side) })) } : {}),
  };
}

/**
 * Rename the offensive line between left/right (LT, LG, RG, RT) and play
 * side/back side (PST, PSG, BSG, BST), with the play side on `side`. Leaves the
 * players alone if a renamed letter is already taken.
 */
export function renameLinemen(players: Player[], to: "lt" | "ps", side: "left" | "right"): Player[] {
  const toPs: Record<string, string> = side === "right" ? { RT: "PST", RG: "PSG", LG: "BSG", LT: "BST" } : { LT: "PST", LG: "PSG", RG: "BSG", RT: "BST" };
  const map: Record<string, string> = to === "ps" ? toPs : Object.fromEntries(Object.entries(toPs).map(([a, b]) => [b, a]));
  const ids = new Set(players.map((p) => p.id));
  if (players.some((p) => map[p.id] && ids.has(map[p.id]!))) return players;
  return players.map((p) => (map[p.id] ? { ...p, id: map[p.id]!, position: p.position === p.id ? map[p.id]! : p.position } : p));
}
