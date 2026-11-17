/**
 * The model's answer for one play crop, and its conversion into PlayData.
 * The model works in pixels (what it sees); conversion to yards happens
 * here with the crop's calibration. Pure: no SDK, no I/O.
 */
import { z } from "zod";
import {
  ASSIGNMENT_TYPES,
  COVERAGES,
  MOTION_TYPES,
  OPTION_TYPES,
  PLAY_TYPES,
  PlayDataSchema,
  QB_DROPS,
  UNKNOWN,
  type PlayData,
  type Point,
} from "./play";
import { normalizeRouteName } from "./routes";

const U = z.literal(UNKNOWN);
const px = z.object({ x: z.number(), y: z.number() });

export const ExtractedSchema = z.object({
  is_play: z.boolean().describe("false for title pages, blank fields, legends, logos"),
  name: z.string().describe("play name / call exactly as printed; 'unknown' if none"),
  play_type: z.union([z.enum(PLAY_TYPES), U]),
  concept_name: z.string().describe("pass/run/option concept if recognizable (Smash, Inside Zone, Zone Read...), else 'unknown'"),
  ball: px.describe("center of the ball / center's marker, pixels"),
  formation: z.object({
    name: z.string(),
    personnel: z.string().describe("e.g. 11, 12, 21; 'unknown' if unsure"),
    strength: z.union([z.enum(["left", "right", "balanced"]), U]),
    backfield_alignment: z.string().describe("e.g. 'gun, RB right', 'I', 'pistol', 'offset left'; 'unknown'"),
  }),
  motion: z
    .object({
      player: z.string(),
      type: z.union([z.enum(MOTION_TYPES), U]),
      direction: z.union([z.enum(["left", "right"]), U]),
      timing: z.union([z.enum(["at_snap", "set"]), U]),
      end: px.nullable().describe("where the motion ends, pixels"),
    })
    .nullable(),
  players: z.array(
    z.object({
      id: z.string().describe("the label in the marker (X, Z, Y, H, F, Q/QB, R/RB...). Linemen: LT, LG, C, RG, RT"),
      position: z.string(),
      x: z.number().describe("marker center, pixels"),
      y: z.number().describe("marker center, pixels"),
      on_ball: z.boolean(),
      assignment_type: z.union([z.enum(ASSIGNMENT_TYPES), U]),
      route: z
        .object({
          name: z.string().describe("standard route name (go, slant, hitch, out, quick out, curl, dig, post, corner, flat, wheel, drag, seam, swing, bubble, stick...) or 'unknown'"),
          depth_yards: z.number().nullable(),
          break_direction: z.union([z.enum(["in", "out", "none"]), U]),
          notes: z.string().nullable(),
        })
        .nullable(),
      block: z.object({ type: z.string(), target: z.string().nullable() }).nullable(),
      path: z.array(px).nullable().describe("the drawn line from the player outward, pixels, up to 6 points incl. the end"),
      notes: z.string().nullable(),
    }),
  ),
  run_details: z
    .object({ point_of_attack: z.string(), scheme: z.string(), ball_carrier: z.string() })
    .nullable(),
  option_details: z
    .object({
      option_type: z.union([z.enum(OPTION_TYPES), U]),
      read_key: z.string().describe("one of backside_de, playside_de, playside_olb, backside_olb, mike, playside_dt, playside_safety, playside_corner, flat_defender, or 'unknown'"),
      give_rule: z.string(),
      keep_rule: z.string(),
      pitch_or_pass_rule: z.string().nullable(),
    })
    .nullable(),
  pass_details: z
    .object({
      protection: z.string(),
      qb_drop: z.union([z.enum(QB_DROPS), U]),
      presnap_read: z.string(),
      progression: z.array(z.object({ player: z.string(), trigger: z.string() })),
      hot_or_sight_adjustment: z.string().nullable(),
      vs_coverage: z.array(z.object({ coverage: z.enum(COVERAGES), target: z.string(), why: z.string() })),
    })
    .nullable(),
  coaching_points: z.array(z.string()),
  confidence: z
    .array(z.object({ path: z.string(), level: z.enum(["high", "medium", "low"]) }))
    .describe("every field you are not fully sure of, as a dotted path (formation.name, players.3.route.name, motion.type...)"),
});
export type Extracted = z.infer<typeof ExtractedSchema>;

export const EXTRACTION_SYSTEM = `You read one American football play diagram (cropped from a coach's playbook PDF) and return it as structured data.

Rules
- Never guess. If something is not drawn or written, use "unknown" (or null where the field is not applicable). A wrong value is worse than "unknown": players will be quizzed on this.
- List every field you are not fully sure of in "confidence" with level medium or low.
- Coordinates are pixels in the image you are given, origin top-left. Offense is at the bottom moving up unless clearly drawn otherwise. Locate every offensive player marker (circles/squares/letters). The center is usually a square or the marker on the ball. Unlabeled linemen: name them LT, LG, C, RG, RT from left to right as you look at the image.
- Ignore defenders in the diagram (triangles, Vs, letters like E, T, M, S, C, F); the app draws its own defense.
- Lines: a line ending in an arrow is a route or carry path; a line ending in a short perpendicular bar is a block; zigzag or dashed lines before the snap are motion; a thin line from QB to a receiver is the throw. Give each path as up to 6 waypoints from the player outward, including the end point.
- Route names: use standard names (go, fade, slant, quick out, speed out, out, hitch, curl, comeback, stick, dig, in, drag, post, corner, flag, seam, flat, arrow, swing, bubble, wheel, angle, out and up, post corner, screen). depth_yards is your estimate from the yard lines if present (5 yards between lines), else null.
- assignment_type: route (receivers), block (linemen / blockers), carry (ball carrier), fake, mesh (QB on a read play), pass_pro (backs protecting), lead (lead blocker through the hole).
- Play type: run, pass, play_action, rpo, screen, option, special. Text in the play name often tells you (e.g. "Boot", "PA" = play action; "Read" = option; numbers like 34 often mean back 3 to hole 4).
- Reads (presnap_read, progression, option keys, give/keep rules, vs_coverage, coaching points): only fill these from text printed on the card. If no text says it, use "unknown" / empty arrays. The app fills standard reads from its own library later.
- formation.name: the formation as named in the play call or card (e.g. "Trips Right", "Ace", "Gun Doubles"); strength = side with more receivers or the tight end.`;

function pts(path: Array<{ x: number; y: number }> | null, origin: [number, number], toYards: (x: number, y: number) => [number, number]): Point[] | null {
  if (!path || path.length < 2) return null;
  return path.map((p) => {
    const [x, y] = toYards(p.x, p.y);
    return [Math.round((x - origin[0]) * 10) / 10, Math.round((y - origin[1]) * 10) / 10] as Point;
  });
}

/** Convert the model's pixel answer to a validated PlayData. */
export function toPlayData(e: Extracted, toYards: (x: number, y: number) => [number, number]): PlayData {
  const fieldConfidence: Record<string, "high" | "medium" | "low"> = {};
  for (const c of e.confidence) fieldConfidence[c.path] = c.level;

  const players = e.players.map((p) => {
    const [x, y] = toYards(p.x, p.y);
    const id = p.id.trim().toUpperCase().replace(/^Q$/, "QB");
    const drawn = pts(p.path, [x, y], toYards);
    const routeName = p.route ? normalizeRouteName(p.route.name) : null;
    return {
      id,
      position: (p.position || id).toUpperCase(),
      x,
      y: Math.min(y, 0.5),
      on_ball: p.on_ball,
      side: x < -1 ? "left" : x > 1 ? "right" : "middle",
      split: null,
      assignment_type: p.assignment_type,
      route: p.route
        ? {
            name: routeName ?? UNKNOWN,
            depth_yards: p.route.depth_yards ?? UNKNOWN,
            break_direction: p.route.break_direction,
            notes: p.route.notes,
            path: drawn,
          }
        : null,
      block: p.block ? { type: p.block.type, target: p.block.target, path: drawn } : null,
      path: !p.route && !p.block ? drawn : null,
      notes: p.notes,
    };
  });

  const motion = e.motion
    ? {
        player: e.motion.player.trim().toUpperCase(),
        type: e.motion.type,
        direction: e.motion.direction,
        timing: e.motion.timing,
        end: e.motion.end ? toYards(e.motion.end.x, e.motion.end.y) : null,
      }
    : null;

  const vs: Record<string, { target: string; why: string } | null> = {
    cover_0: null,
    cover_1: null,
    cover_2: null,
    cover_3: null,
    cover_4: null,
  };
  for (const v of e.pass_details?.vs_coverage ?? []) vs[v.coverage] = { target: v.target.toUpperCase(), why: v.why };

  return PlayDataSchema.parse({
    name: e.name.trim() || UNKNOWN,
    play_type: e.play_type,
    concept_key: null,
    formation: e.formation,
    motion,
    players,
    run_details: e.run_details
      ? { ...e.run_details, ball_carrier: e.run_details.ball_carrier.trim().toUpperCase().replace(/^Q$/, "QB") }
      : null,
    option_details: e.option_details ? { ...e.option_details, decisions: [] } : null,
    pass_details: e.pass_details
      ? {
          concept_key: null,
          concept_name: e.concept_name || UNKNOWN,
          protection: e.pass_details.protection || UNKNOWN,
          qb_drop: e.pass_details.qb_drop,
          presnap_read: e.pass_details.presnap_read || UNKNOWN,
          progression: e.pass_details.progression.map((s) => ({ ...s, player: s.player.toUpperCase() })),
          hot_or_sight_adjustment: e.pass_details.hot_or_sight_adjustment,
          vs_coverage: vs,
        }
      : null,
    coaching_points: e.coaching_points,
    field_confidence: fieldConfidence,
  });
}
