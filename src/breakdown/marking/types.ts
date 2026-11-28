/**
 * Hand-marking a pre-snap frame: a person clicks painted spots on the field
 * whose real positions are known, then the ball and every player. The clicks
 * fix where the camera is looking, which puts every player in yards.
 *
 * This is the no-GPU test of the formation rules (docs/BREAKDOWN-AUDIT.md,
 * milestone 0). The film itself never leaves the marker's computer: only
 * these clicks and answers are saved.
 */
import { z } from "zod";
import {
  applyHomography,
  fitError,
  FieldSpecSchema,
  LATERAL_REFS,
  lateralYards,
  solveHomography,
  spotOf,
  toPlayFrame,
  type CameraFieldPoint,
  type FieldSpec,
  type PlayPoint,
  type PointPair,
  type Spot,
} from "@/shared/field";
import { BACK_SETS } from "../rules/formation";

const px = z.tuple([z.number(), z.number()]);

export const LandmarkSchema = z.object({
  px,
  /** yards from the goal line at the left of the picture (the 50 is 50; the right 35 is 65) */
  along: z.number().min(0).max(120),
  ref: z.enum(LATERAL_REFS),
});
export type Landmark = z.infer<typeof LandmarkSchema>;

/** What a person who knows the answer says the formation is. Any part can be left blank. */
export const ExpectedSchema = z.object({
  formation: z.string().optional(),
  shape: z.string().optional(),
  strength: z.enum(["left", "right", "balanced"]).optional(),
  qb: z.enum(["under_center", "pistol", "gun", "none"]).optional(),
  backs: z.enum(BACK_SETS).optional(),
  personnel: z.string().optional(),
});
export type Expected = z.infer<typeof ExpectedSchema>;

export const MarkedFrameSchema = z.object({
  id: z.string(),
  /** the marker's own label: "Q1 1st & 10, own 35" */
  label: z.string().default(""),
  /** where in the video this frame is, seconds (null for a still image) */
  time: z.number().nullable().default(null),
  /** the picture's own size, pixels: every click is in these */
  width: z.number().positive(),
  height: z.number().positive(),
  landmarks: z.array(LandmarkSchema).default([]),
  /** which way the offense is going in the picture */
  direction: z.enum(["left", "right"]).default("right"),
  ball: px.nullable().default(null),
  offense: z.array(px).default([]),
  defense: z.array(px).default([]),
  expected: ExpectedSchema.default({}),
  notes: z.string().default(""),
});
export type MarkedFrame = z.infer<typeof MarkedFrameSchema>;

export const MarkFileSchema = z.object({
  version: z.literal(1),
  field: FieldSpecSchema,
  /** the team's saved formations when the frames were marked (names and spots only), so results can be re-run offline */
  formations: z.array(z.object({ name: z.string(), players: z.array(z.object({ id: z.string(), x: z.number(), y: z.number() })) })).default([]),
  frames: z.array(MarkedFrameSchema),
});
export type MarkFile = z.infer<typeof MarkFileSchema>;

export type SolvedFrame =
  | { ok: false; reason: string }
  | {
      ok: true;
      /** how far the landmarks miss their true spots after fitting, yards */
      fitError: number;
      offense: PlayPoint[];
      defense: PlayPoint[];
      spot: Spot;
    };

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Put a marked frame's players in play-frame yards. */
export function solveFrame(frame: MarkedFrame, spec: FieldSpec): SolvedFrame {
  const pairs: PointPair[] = [];
  for (const l of frame.landmarks) {
    const across = lateralYards(spec, l.ref);
    if (across != null) pairs.push({ from: l.px, to: [l.along, across] });
  }
  if (pairs.length < 4) return { ok: false, reason: `Mark at least 4 field spots (${pairs.length} so far).` };
  const h = solveHomography(pairs);
  if (!h) return { ok: false, reason: "The field spots are all on one line. Mark spots on two different yard lines and two different places across the field." };
  if (!frame.ball) return { ok: false, reason: "Mark the ball." };
  const field = (p: readonly [number, number]): CameraFieldPoint => {
    const [along, across] = applyHomography(h, p);
    return { along, across };
  };
  const ball = field(frame.ball);
  const play = (p: readonly [number, number]): PlayPoint => {
    const q = toPlayFrame(field(p), ball, frame.direction);
    return { x: r2(q.x), y: r2(q.y) };
  };
  return { ok: true, fitError: fitError(h, pairs), offense: frame.offense.map(play), defense: frame.defense.map(play), spot: spotOf(ball, frame.direction, spec) };
}
