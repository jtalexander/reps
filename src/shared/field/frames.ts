/**
 * The two ways a spot on the field is written down.
 *
 * Play frame (what Install's plays, formations and Breakdown's player
 * positions use): yards from the ball on the line of scrimmage, x to the
 * offense's right, y downfield.
 *
 * Camera field frame (where a snap happened, as marked off sideline film):
 * `along` is yards from the goal line at the LEFT of the picture (0 to the
 * field's length), `across` is yards from the sideline NEARER the camera.
 * With which way the offense is going, it converts to the play frame and to
 * the offense's own view of the spot (yard line, hash).
 */
import type { FieldSpec } from "./spec";

export interface PlayPoint {
  x: number;
  y: number;
}
export interface CameraFieldPoint {
  along: number;
  across: number;
}
/** Which way the offense is going in the picture. */
export type Direction = "left" | "right";

/**
 * A camera-field point in the play frame. Going right in the picture, the
 * offense's right hand is toward the camera; going left, away from it.
 */
export function toPlayFrame(p: CameraFieldPoint, ball: CameraFieldPoint, direction: Direction): PlayPoint {
  return direction === "right" ? { x: ball.across - p.across, y: p.along - ball.along } : { x: p.across - ball.across, y: ball.along - p.along };
}

export function fromPlayFrame(p: PlayPoint, ball: CameraFieldPoint, direction: Direction): CameraFieldPoint {
  return direction === "right" ? { along: ball.along + p.y, across: ball.across - p.x } : { along: ball.along - p.y, across: ball.across + p.x };
}

export type Hash = "left" | "middle" | "right";

export interface Spot {
  /** yards from the goal line the offense is defending */
  along: number;
  /** yards from the offense's left sideline */
  across: number;
  hash: Hash;
  /** how a coach says it: "own 35", "50", "opp 20" */
  yard_line: string;
}

/** The ball's spot from the offense's point of view. */
export function spotOf(ball: CameraFieldPoint, direction: Direction, spec: FieldSpec): Spot {
  const along = direction === "right" ? ball.along : spec.length_yd - ball.along;
  const across = direction === "right" ? spec.width_yd - ball.across : ball.across;
  // between the hashes, split in thirds: the outer thirds are "on" a hash
  const third = (spec.width_yd - 2 * spec.hash_from_sideline_yd) / 3;
  const hash: Hash = across < spec.hash_from_sideline_yd + third ? "left" : across > spec.width_yd - spec.hash_from_sideline_yd - third ? "right" : "middle";
  const yd = Math.round(along);
  const half = spec.length_yd / 2;
  const yard_line = yd === half ? `${half}` : yd < half ? `own ${yd}` : `opp ${spec.length_yd - yd}`;
  return { along, across, hash, yard_line };
}
