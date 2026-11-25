/**
 * Formations the coach saves once: a name ("TRIPS RIGHT STACK") and where
 * everyone lines up. Every play can start from one, and moving a player in
 * the formation can move him in every play drawn from it.
 */
import type { Player } from "./play";

export interface TeamFormation {
  id: string;
  name: string;
  /** players where they line up, no jobs */
  players: Player[];
  updatedAt: string;
}

/** "Trips  right, stack" -> "TRIPS RIGHT STACK": how formation names are compared. */
export const formationKey = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

/** Players where they stand, without their jobs. */
export const lineupOnly = (players: Player[]): Player[] =>
  players.map((p) => ({ ...p, assignment_type: "unknown", route: null, block: null, path: null, line: null, notes: null }));

/** A play's players moved to where the formation puts them (anyone the formation doesn't have stays put; jobs stay). */
export function moveToFormation(players: Player[], formation: Player[]): { players: Player[]; moved: number } {
  let moved = 0;
  const next = players.map((p) => {
    const f = formation.find((x) => x.id === p.id);
    if (!f || (f.x === p.x && f.y === p.y)) return p;
    moved++;
    return { ...p, x: f.x, y: f.y, on_ball: f.on_ball, side: f.side };
  });
  return { players: next, moved };
}
