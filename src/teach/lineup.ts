/**
 * The play builder's lineup from a formation call: "TRIPS RIGHT STACK" puts
 * the players where the team's own playbook draws them. Reps looks for a play
 * already made from that formation; failing that, it turns the matching
 * drawing into a play (one drawing, a few seconds) and uses that. A call
 * drawn the other way is mirrored.
 */
import { and, eq } from "drizzle-orm";
import { db, type Db } from "@/db";
import { plays } from "@/db/schema";
import { jobs } from "@/db/teach-schema";
import type { Player } from "@/domain/play";
import { prepareCrop } from "./convert";
import { playbookDrawings } from "./drawings";
import { dispatchWorkers } from "./playbook-run";
import { aiBlockedReason } from "./usage";

export interface Call {
  formation: string;
  dir: "RIGHT" | "LEFT";
  tag: string;
}

export type LineupResult =
  | { kind: "lineup"; players: Player[]; from: string; page: number | null; mirrored: boolean }
  | { kind: "converting"; from: string; page: number }
  | { kind: "none"; why: string };

export const words = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
export const SIDES: Record<string, "RIGHT" | "LEFT"> = { RIGHT: "RIGHT", RT: "RIGHT", R: "RIGHT", LEFT: "LEFT", LT: "LEFT", L: "LEFT" };

/**
 * How well a drawing or play name fits the call (null = it doesn't): the
 * formation word must be there; the tag counts if asked for, and counts
 * against when not asked for; fewer extra words is better.
 */
export function fit(name: string, call: Call): { score: number; mirror: boolean } | null {
  const w = words(name);
  const f = words(call.formation);
  if (!f.length || !f.every((x) => w.includes(x))) return null;
  const tag = words(call.tag);
  const hasTag = tag.length > 0 && tag.every((x) => w.includes(x));
  if (tag.length && !hasTag) return null;
  const side = w.map((x) => SIDES[x]).find(Boolean);
  const extra = w.filter((x) => !f.includes(x) && !tag.includes(x) && !SIDES[x]).length;
  return { score: (hasTag ? 10 : 0) + (side === call.dir ? 2 : 0) - extra, mirror: side !== undefined && side !== call.dir };
}

/** Players where they stand, no assignments; mirrored left-right when asked. */
function lineupOf(players: Player[], mirror: boolean): Player[] {
  return players.map((p) => ({
    ...p,
    x: mirror ? -p.x : p.x,
    side: mirror ? (p.side === "left" ? "right" : p.side === "right" ? "left" : p.side) : p.side,
    assignment_type: "unknown",
    route: null,
    block: null,
    path: null,
  }));
}

export async function lineupFor(teamId: string, call: Call, origin: string | null, database: Db = db): Promise<LineupResult> {
  if (!call.formation.trim()) return { kind: "none", why: "Pick a formation." };
  const label = [call.formation, call.dir, call.tag].filter(Boolean).join(" ").trim();

  // plays the team already has (drawn, converted or extracted), and the playbook's drawings not made into plays yet
  const made = await database
    .select({ name: plays.name, data: plays.data, page: plays.sourcePage, aiRaw: plays.aiRaw })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false)));
  const converted = new Set(made.map((p) => (p.aiRaw as { drawingKey?: string } | null)?.drawingKey).filter(Boolean));
  const bestPlay = made
    .filter((p) => (p.data?.players.length ?? 0) > 0)
    .map((p) => ({ p, f: fit(p.data!.name && p.data!.name !== "unknown" ? p.data!.name : p.name, call) ?? fit(p.name, call) }))
    .filter((x) => x.f)
    .sort((x, y) => y.f!.score - x.f!.score)[0];
  const bestDrawing = (await playbookDrawings(teamId, database))
    .filter((d) => !converted.has(d.key))
    .map((d) => ({ d, f: fit(d.label, call) }))
    .filter((x) => x.f)
    .sort((x, y) => y.f!.score - x.f!.score)[0];

  if (bestPlay && (!bestDrawing || bestPlay.f!.score >= bestDrawing.f!.score))
    return { kind: "lineup", players: lineupOf(bestPlay.p.data!.players, bestPlay.f!.mirror), from: bestPlay.p.name, page: bestPlay.p.page ?? null, mirrored: bestPlay.f!.mirror };
  if (!bestDrawing) return { kind: "none", why: `Your playbook has no drawing of ${label}. Drag the players into place.` };

  // turn that one drawing into a play now (the builder asks again until it's done)
  const read = await readDrawingOnce(teamId, bestDrawing.d.key, origin, database);
  if (read.state === "reading") return { kind: "converting", from: bestDrawing.d.label, page: bestDrawing.d.pageNo };
  if (read.state === "blocked") return { kind: "none", why: read.reason };
  // read before and nothing usable came of it: don't spend AI on it again
  if (bestPlay) return { kind: "lineup", players: lineupOf(bestPlay.p.data!.players, bestPlay.f!.mirror), from: bestPlay.p.name, page: bestPlay.p.page ?? null, mirrored: bestPlay.f!.mirror };
  return { kind: "none", why: `Reps couldn't read your drawing of ${bestDrawing.d.label} (p${bestDrawing.d.pageNo}). Drag the players into place.` };
}

/**
 * Make sure Reps has read one playbook drawing into a play: starts it the
 * first time (one AI call), says "reading" while it runs, "done" once any
 * read finished (worked or not; a drawing is never read twice).
 */
export async function readDrawingOnce(
  teamId: string,
  key: string,
  origin: string | null,
  database: Db = db,
): Promise<{ state: "reading" } | { state: "done" } | { state: "blocked"; reason: string }> {
  const runs = await database
    .select({ status: jobs.status })
    .from(jobs)
    .where(and(eq(jobs.teamId, teamId), eq(jobs.kind, "convert_drawing"), eq(jobs.ref, key)));
  if (runs.some((j) => j.status === "queued" || j.status === "running")) return { state: "reading" };
  if (runs.length) return { state: "done" };
  const blocked = await aiBlockedReason(teamId, database);
  if (blocked) return { state: "blocked", reason: blocked };
  await prepareCrop(teamId, key, database);
  await database.insert(jobs).values({ teamId, kind: "convert_drawing", ref: key });
  await dispatchWorkers(teamId, origin, 1, database);
  return { state: "reading" };
}
