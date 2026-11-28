/**
 * Naming a formation seen on film with the team's own word for it: the saved
 * formation whose skill players stand closest to where these players stand.
 * Used for our own film, and for opponent film too (their formation gets the
 * name of our nearest one, close but not exact), so how close the match was
 * is part of the answer.
 */
import type { PlayPoint } from "@/shared/field";
import { isLineman } from "@/shared/football";
import type { RoledPlayer } from "./formation";

export interface NamedLineup {
  name: string;
  players: Array<{ id: string; x: number; y: number }>;
}

export interface FormationMatch {
  name: string;
  /** how far each skill player is from his spot in the saved formation, yards on average */
  cost: number;
  /** the next closest formation, and its cost */
  runnerUp: { name: string; cost: number } | null;
  confidence: number;
}

/** A player with no partner counts as this many yards off. */
const UNMATCHED = 6;

/** Average distance between two sets of spots, pairing closest first. */
export function lineupDistance(a: PlayPoint[], b: PlayPoint[]): number {
  if (!a.length || !b.length) return Infinity;
  const pairs: Array<{ i: number; j: number; d: number }> = [];
  a.forEach((p, i) => b.forEach((q, j) => pairs.push({ i, j, d: Math.hypot(p.x - q.x, p.y - q.y) })));
  pairs.sort((x, y) => x.d - y.d);
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  let total = 0;
  for (const { i, j, d } of pairs) {
    if (usedA.has(i) || usedB.has(j)) continue;
    usedA.add(i);
    usedB.add(j);
    total += d;
  }
  const left = Math.max(a.length, b.length) - usedA.size;
  return (total + left * UNMATCHED) / Math.max(a.length, b.length);
}

/** The team's formation these players are lined up in, or null when the team has saved none. */
export function matchFormation(players: RoledPlayer[], formations: NamedLineup[]): FormationMatch | null {
  const skill = players.filter((p) => p.role !== "center" && p.role !== "line");
  const ranked = formations
    .map((f) => ({ name: f.name, cost: lineupDistance(skill, f.players.filter((p) => !isLineman(p.id))) }))
    .filter((r) => Number.isFinite(r.cost))
    .sort((a, b) => a.cost - b.cost);
  const best = ranked[0];
  if (!best) return null;
  const runnerUp = ranked[1] ?? null;
  // sure when everyone is within about a yard of his spot and no other formation is nearly as close
  const fit = Math.max(0, Math.min(1, 1 - (best.cost - 1) / 3));
  const clear = runnerUp ? Math.max(0, Math.min(1, (runnerUp.cost - best.cost) / 1.5)) : 1;
  return { name: best.name, cost: best.cost, runnerUp, confidence: fit * clear };
}
