/**
 * The field a game is played on. Dimensions are data, not constants: high
 * school hash marks differ from college and NFL, some states play college
 * rules, and 6-, 8- and 9-player and youth fields are narrower. A preset is a
 * starting point the coach confirms.
 */
import { z } from "zod";

export const FieldSpecSchema = z.object({
  rules: z.enum(["nfhs", "ncaa", "other"]),
  players: z.union([z.literal(11), z.literal(9), z.literal(8), z.literal(6)]),
  /** sideline to sideline, yards */
  width_yd: z.number().positive(),
  /** goal line to goal line, yards */
  length_yd: z.number().positive(),
  endzone_yd: z.number().positive(),
  /** each hash mark's distance from its nearer sideline, yards */
  hash_from_sideline_yd: z.number().positive(),
  /** the nine-yard marks / tops of the numbers, from the nearer sideline (null = not on this field) */
  numbers_from_sideline_yd: z.number().positive().nullable(),
  /** where the numbers came from: a built-in preset, the coach, or measured off film */
  source: z.enum(["preset", "coach", "measured"]),
});
export type FieldSpec = z.infer<typeof FieldSpecSchema>;

/**
 * NFHS 11-player: 160 ft wide, hash marks 53 ft 4 in from each sideline (the
 * field in thirds), nine-yard marks 9 yards in. Jeremy's team plays on this
 * (2026-11-28). Check against the current NFHS rule book before offering it
 * to other schools: see docs/BREAKDOWN-AUDIT.md section 2.5.
 */
export const NFHS_11: FieldSpec = {
  rules: "nfhs",
  players: 11,
  width_yd: 160 / 3,
  length_yd: 100,
  endzone_yd: 10,
  hash_from_sideline_yd: 160 / 9,
  numbers_from_sideline_yd: 9,
  source: "preset",
};

/**
 * Places across the field that are painted on it, named from the camera's
 * side: "near" is the sideline closer to the camera.
 */
export const LATERAL_REFS = ["near_sideline", "near_numbers", "near_hash", "far_hash", "far_numbers", "far_sideline"] as const;
export type LateralRef = (typeof LATERAL_REFS)[number];

export const LATERAL_LABEL: Record<LateralRef, string> = {
  near_sideline: "Near sideline",
  near_numbers: "Near numbers (top) / 9-yard mark",
  near_hash: "Near hash",
  far_hash: "Far hash",
  far_numbers: "Far numbers (top) / 9-yard mark",
  far_sideline: "Far sideline",
};

/** Yards from the near sideline to a painted reference (null when this field doesn't have it). */
export function lateralYards(spec: FieldSpec, ref: LateralRef): number | null {
  const n = spec.numbers_from_sideline_yd;
  switch (ref) {
    case "near_sideline":
      return 0;
    case "near_numbers":
      return n;
    case "near_hash":
      return spec.hash_from_sideline_yd;
    case "far_hash":
      return spec.width_yd - spec.hash_from_sideline_yd;
    case "far_numbers":
      return n == null ? null : spec.width_yd - n;
    case "far_sideline":
      return spec.width_yd;
  }
}
