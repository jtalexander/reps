/**
 * The play builder's "pick the play and Reps draws it": every player's job
 * (route, block, carry) and the motion, laid onto the coach's lineup by
 * position letter. From the team's own playbook first (reading that one
 * drawing if needed), then Reps' built-in concepts. Always a starting point.
 */
import { and, eq } from "drizzle-orm";
import { db, type Db } from "@/db";
import { plays } from "@/db/schema";
import { conceptByName } from "@/domain/concepts";
import { drawConcept, type Job } from "@/domain/concept-draw";
import { drawMotion, SPOT } from "@/domain/motion-draw";
import { isLineman, type Motion, type PlayData, type Player, type Point } from "@/domain/play";
import { conceptsForTeam } from "@/server/plays";
import { playbookDrawings } from "./drawings";
import { readDrawingOnce, SIDES, words } from "./lineup";
import { getNaming } from "./naming";

export interface PlayCall {
  formation: string;
  dir: "RIGHT" | "LEFT";
  tag: string;
  play: string;
  playDir: "RIGHT" | "LEFT" | "";
  motion: string;
  motionPlayer: string;
}

export type DrawResult =
  | { kind: "reading"; from: string; page: number }
  | {
      kind: "done";
      /** null = leave everyone's jobs as they are */
      jobs: Job[] | null;
      playType: PlayData["play_type"] | null;
      motion: Motion | null;
      notes: string[];
      /** players the play gives a job to that this lineup doesn't have */
      missing: string[];
    };

/**
 * How well a play's name fits the call (null = it isn't that play): every
 * play word must be there; the formation and tag words count for it. The
 * side is the one said after the play words (or the formation's).
 */
export function fitPlay(name: string, call: PlayCall): { score: number; mirror: boolean } | null {
  const w = words(name);
  const pw = words(call.play);
  if (!pw.length || !pw.every((x) => w.includes(x))) return null;
  const fw = words(call.formation);
  const tw = words(call.tag);
  const last = Math.max(...pw.map((x) => w.lastIndexOf(x)));
  const after = w.slice(last + 1).map((x) => SIDES[x]).find(Boolean);
  const side = after ?? w.map((x) => SIDES[x]).find(Boolean);
  const target = call.playDir || call.dir;
  const score = fw.filter((x) => w.includes(x)).length * 3 + tw.filter((x) => w.includes(x)).length - w.filter((x) => !pw.includes(x) && !fw.includes(x) && !tw.includes(x) && !SIDES[x]).length * 0.2;
  return { score, mirror: side !== undefined && side !== target };
}

const flipPts = (pts: Point[] | null) => pts?.map(([x, y]) => [-x, y] as Point) ?? null;
const hasJob = (p: Player) => (p.assignment_type !== "unknown" && p.assignment_type !== undefined) || p.route !== null || p.block !== null || p.path !== null;

/** The formation part of a play's name ("SPREAD RIGHT ZOOT, SMASH" -> "SPREAD RIGHT ZOOT"). */
const formationOf = (name: string, call: PlayCall) => {
  const pw = new Set(words(call.play));
  return words(name)
    .filter((x) => !pw.has(x))
    .join(" ");
};

export async function drawPlay(teamId: string, call: PlayCall, lineup: Player[], origin: string | null, database: Db = db): Promise<DrawResult> {
  const notes: string[] = [];
  let jobs: Job[] | null = null;
  let playType: PlayData["play_type"] | null = null;
  let motion: Motion | null = null;
  const missing: string[] = [];
  const made = (
    await database
      .select({ name: plays.name, data: plays.data, page: plays.sourcePage, aiRaw: plays.aiRaw })
      .from(plays)
      .where(and(eq(plays.teamId, teamId), eq(plays.archived, false)))
  ).filter((p) => (p.data?.players.length ?? 0) > 0);
  const label = (p: (typeof made)[number]) => (p.data!.name && p.data!.name !== "unknown" ? p.data!.name : p.name);

  if (call.play.trim()) {
    const converted = new Set(made.map((p) => (p.aiRaw as { drawingKey?: string } | null)?.drawingKey).filter(Boolean));
    const candidates = made
      .map((p) => ({ p, f: fitPlay(label(p), call) ?? fitPlay(p.name, call) }))
      .filter((x) => x.f && x.p.data!.players.some(hasJob))
      .sort((a, b) => b.f!.score - a.f!.score);
    const best = candidates[0];
    const drawing = (await playbookDrawings(teamId, database))
      .filter((d) => !converted.has(d.key))
      .map((d) => ({ d, f: fitPlay(d.label, call) }))
      .filter((x) => x.f)
      .sort((a, b) => b.f!.score - a.f!.score)[0];
    if (drawing && (!best || drawing.f!.score > best.f!.score)) {
      const read = await readDrawingOnce(teamId, drawing.d.key, origin, database);
      if (read.state === "reading") return { kind: "reading", from: drawing.d.label, page: drawing.d.pageNo };
      if (read.state === "blocked") notes.push(read.reason);
    }
    // formations it's run from (short names only; page titles aren't formations)
    const usedIn = [...new Set(candidates.map((c) => formationOf(label(c.p), call)).filter((f) => f && f.split(" ").length <= 4))].slice(0, 3);

    if (best) {
      const src = best.p.data!;
      const mirror = best.f!.mirror;
      // by letter first; a letter this team doesn't use (RB vs F) goes to the nearest player still free
      const byId = new Map(lineup.map((p) => [p.id, p]));
      const taken = new Set<string>();
      const moved: string[] = [];
      const assign: [Player, Player][] = [];
      const withJob = src.players.filter(hasJob);
      for (const sp of withJob)
        if (byId.has(sp.id)) {
          assign.push([sp, byId.get(sp.id)!]);
          taken.add(sp.id);
        }
      for (const sp of withJob) {
        if (byId.has(sp.id)) continue;
        const sx = mirror ? -sp.x : sp.x;
        const near = lineup
          .filter((p) => !taken.has(p.id) && !withJob.some((w) => w.id === p.id) && isLineman(p.id) === isLineman(sp.id) && p.id !== "QB")
          .sort((a, b) => Math.hypot(a.x - sx, a.y - sp.y) - Math.hypot(b.x - sx, b.y - sp.y))[0];
        if (near && Math.hypot(near.x - sx, near.y - sp.y) < 6) {
          assign.push([sp, near]);
          taken.add(near.id);
          moved.push(`${sp.id}'s job went to ${near.id}`);
        } else missing.push(sp.id);
      }
      jobs = assign.map(([sp, to]) => ({
        id: to.id,
        assignment_type: sp.assignment_type,
        route: sp.route && mirror ? { ...sp.route, path: flipPts(sp.route.path) } : sp.route,
        block: sp.block && mirror ? { ...sp.block, path: flipPts(sp.block.path) } : sp.block,
        path: mirror ? flipPts(sp.path) : sp.path,
      }));
      playType = src.play_type;
      if (src.motion && !call.motion.trim()) motion = moveMotion(src, src.motion, lineup, src.motion.player, mirror);
      notes.push(`Drawn from your playbook: ${label(best.p)}${best.p.page ? ` (p${best.p.page})` : ""}${mirror ? ", flipped" : ""}${moved.length ? ` (${moved.join(", ")})` : ""}.`);
      if (missing.length) notes.push(`${missing.join(", ")} ${missing.length === 1 ? "has" : "have"} a job in that play but ${missing.length === 1 ? "isn't" : "aren't"} in this formation. In your playbook it's run from ${usedIn.join(", ") || "another formation"}.`);
    } else {
      // Reps' own version of a known concept
      const concepts = await conceptsForTeam(teamId, database);
      const concept = conceptByName(call.play, concepts) ?? words(call.play).map((w) => conceptByName(w, concepts)).find(Boolean);
      const side = (call.playDir || call.dir) === "LEFT" ? "left" : "right";
      const drawn = concept ? drawConcept(concept.key, lineup, side) : null;
      if (concept && drawn) {
        jobs = drawn;
        playType = concept.kind === "run" ? "run" : concept.kind === "screen" ? "screen" : "pass";
        notes.push(`Your playbook doesn't draw ${call.play}, so Reps drew a standard ${concept.name}. Change anything that isn't how you run it.`);
      } else notes.push(`Reps doesn't have ${call.play} drawn. Tap each player to give him his job.`);
    }
  }

  if (call.motion.trim() && call.motionPlayer) {
    const mover = lineup.find((p) => p.id === call.motionPlayer);
    const src = SPOT.test(call.motion.trim()) ? undefined : made.find((p) => p.data!.motion && words(call.motion).every((w) => words(label(p)).includes(w)));
    // what the motion means in the team's naming rules
    const { naming } = await getNaming(teamId, database);
    const def = (naming?.motions ?? []).find((m) => words(m.word).join(" ") === words(call.motion).join(" "));
    const toward = (call.playDir || call.dir) === "LEFT" ? "left" : "right";
    const drawn = mover ? drawMotion(call.motion, def?.means ?? "", mover.id, lineup, toward) : null;
    // a playbook copy drawn as one straight line (or none) when the definition goes there and back: the definition wins
    const m0 = src?.data!.motion;
    const flat = !m0?.end || (m0.path?.length ?? 0) < 3;
    const legs = drawn?.motion?.path && drawn.motion.path.length >= 3;
    if (mover && src && !(flat && legs)) {
      const m = src.data!.motion!;
      const srcMover = src.data!.players.find((p) => p.id === m.player);
      const mirror = Boolean(srcMover && Math.sign(srcMover.x || 1) !== Math.sign(mover.x || 1));
      motion = moveMotion(src.data!, m, lineup, mover.id, mirror);
      notes.push(`Motion drawn like ${label(src)}.`);
    } else if (mover && drawn) {
      motion = drawn.motion;
      if (drawn.kind === "shift") notes.push(`${call.motion} is a shift, not a motion: line the players up where they end up.`);
      else if (def && drawn.kind !== "across") notes.push(`${call.motion} drawn from your naming rules: ${def.means}`);
      else notes.push(`Reps guessed the ${call.motion} motion path. Drag or redraw it if it's not right.`);
    }
  }

  // skill players only: the line and the QB often aren't drawn on pass plays
  const without = jobs ? lineup.filter((p) => !isLineman(p.id) && p.id !== "QB" && !jobs!.some((j) => j.id === p.id)).map((p) => p.id) : [];
  if (jobs && without.length) notes.push(`No job yet: ${without.join(", ")}. Tap them to give them one.`);
  return { kind: "done", jobs, playType, motion, notes, missing };
}

/** A motion from one play moved onto a player in this lineup (same path, mirrored if he's on the other side). */
function moveMotion(src: PlayData, m: Motion, lineup: Player[], moverId: string, mirror: boolean): Motion | null {
  const from = src.players.find((p) => p.id === m.player);
  const to = lineup.find((p) => p.id === moverId);
  if (!to) return null;
  const end: Point | null = m.end && from ? [Math.round((to.x + (m.end[0] - from.x) * (mirror ? -1 : 1)) * 10) / 10, Math.round((to.y + (m.end[1] - from.y)) * 10) / 10] : null;
  const dir = m.direction === "left" || m.direction === "right" ? (mirror ? (m.direction === "left" ? "right" : "left") : m.direction) : m.direction;
  return { ...m, player: moverId, direction: dir, end, ...(m.path ? { path: mirror ? flipPts(m.path) : m.path } : {}) };
}
