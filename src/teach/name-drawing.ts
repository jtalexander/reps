/**
 * Naming a play the coach drew by hand, in the team's own words: the
 * formation from where the players stand (matched to the playbook's
 * plays), the motion word from plays with the same motion, and the play
 * word from a playbook play drawn the same way, or the concept Reps
 * recognizes (smash, power...). No AI: it's all matching drawings.
 */
import { and, eq } from "drizzle-orm";
import { db, type Db } from "@/db";
import { plays } from "@/db/schema";
import { conceptByName, recognizeConcept, type Concept } from "@/domain/concepts";
import type { Naming } from "@/domain/naming";
import { flipPlay, isLineman, type PlayData, type Player } from "@/domain/play";
import { normalizeRouteName } from "@/domain/routes";
import { conceptsForTeam } from "@/server/plays";
import { SIDES, words } from "./lineup";
import { getNaming } from "./naming";

export interface NameParts {
  formation: string;
  dir: "RIGHT" | "LEFT";
  tag: string;
  motion: string;
  motionPlayer: string;
  play: string;
  playDir: "" | "RIGHT" | "LEFT";
}

export interface NameGuess {
  /** only the parts Reps could tell; the rest are left out */
  parts: Partial<NameParts>;
  notes: string[];
  /** a playbook play drawn the same way */
  same: { id: string; name: string; page: number | null } | null;
}

type TeamPlay = { id: string; label: string; data: PlayData; page: number | null };

const skill = (ps: Player[]) => ps.filter((p) => !isLineman(p.id));
const hasJob = (p: Player) => p.route !== null || p.block !== null || (p.path !== null && p.path.length > 1) || p.assignment_type === "pass_pro";
const has = (name: string, word: string) => {
  const w = words(name);
  const need = words(word);
  return need.length > 0 && need.every((x) => w.includes(x));
};
const flip = (d: "RIGHT" | "LEFT") => (d === "RIGHT" ? "LEFT" : "RIGHT");

/** How far the drawn skill players stand from a playbook play's (yards on average; letters count). */
export function lineupCost(drawn: Player[], other: Player[]): number {
  const mine = skill(drawn);
  const theirs = skill(other);
  if (!mine.length) return Infinity;
  const used = new Set<Player>();
  let cost = 0;
  for (const p of mine) {
    const same = theirs.find((o) => o.id === p.id && !used.has(o));
    const near = same ?? theirs.filter((o) => !used.has(o)).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (!near) {
      cost += 6;
      continue;
    }
    used.add(near);
    cost += Math.min(8, Math.hypot(near.x - p.x, near.y - p.y)) + (same ? 0 : 1);
  }
  cost += (theirs.length - used.size) * 3;
  return cost / mine.length;
}

const sig = (p: Player) =>
  p.route ? `route:${normalizeRouteName(p.route.name)}` : p.block ? `block:${p.block.type}` : p.assignment_type === "carry" || p.assignment_type === "fake" ? p.assignment_type : p.assignment_type === "pass_pro" ? "block:pass_pro" : "";

/** How alike two plays' jobs are, 0..1 (same letter first, else the nearest player). */
export function jobLikeness(drawn: Player[], other: Player[]): number {
  const mine = drawn.filter((p) => hasJob(p) && !isLineman(p.id));
  const theirs = other.filter((p) => hasJob(p) && !isLineman(p.id));
  const line = drawn.filter((p) => hasJob(p) && isLineman(p.id));
  if (!mine.length && !line.length) return 0;
  let got = 0;
  for (const p of [...mine, ...line]) {
    const o = other.find((x) => x.id === p.id) ?? (isLineman(p.id) ? undefined : skill(other).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]);
    if (!o || !hasJob(o)) continue;
    const [a, b] = [sig(p), sig(o)];
    if (a === b) got += 1;
    else if (a.split(":")[0] === b.split(":")[0] && a.includes(":")) got += 0.4;
  }
  return got / Math.max(mine.length + line.length, theirs.length + other.filter((p) => hasJob(p) && isLineman(p.id)).length);
}

/** The formation part of a play name: before the comma, or the whole name without the play words. */
function formationText(label: string, data: PlayData, n: Naming | null): string {
  if (data.formation.name && data.formation.name !== "unknown") return data.formation.name;
  if (label.includes(",")) return label.split(",")[0]!;
  const playWords = new Set((n?.plays ?? []).flatMap((w) => words(w.word)));
  return words(label)
    .filter((w) => !playWords.has(w))
    .join(" ");
}

/** Split a formation name into the team's formation word, tag and side. */
function readFormation(text: string, n: Naming | null): { formation: string; tag: string; side: "RIGHT" | "LEFT" | null } {
  const w = words(text);
  const side = w.map((x) => SIDES[x]).find(Boolean) ?? null;
  const at = (word: string) => w.indexOf(words(word)[0]!);
  const formations = (n?.formations ?? []).filter((f) => has(text, f.word)).sort((a, b) => at(a.word) - at(b.word) || words(b.word).length - words(a.word).length);
  const tags = (n?.formation_tags ?? []).filter((t) => has(text, t.word)).sort((a, b) => at(a.word) - at(b.word));
  if (formations.length) return { formation: formations[0]!.word.toUpperCase(), tag: tags.map((t) => t.word.toUpperCase()).join(" "), side };
  // no naming rules for formations: everything but the side and the tags
  const tagWords = new Set(tags.flatMap((t) => words(t.word)));
  return { formation: w.filter((x) => !SIDES[x] && !tagWords.has(x)).join(" "), tag: tags.map((t) => t.word.toUpperCase()).join(" "), side };
}

/** The play words of a playbook play's name, and the side said after them. */
function readPlay(label: string, n: Naming | null): { play: string; side: "RIGHT" | "LEFT" | null } | null {
  const w = words(label);
  const found = (n?.plays ?? []).filter((p) => has(label, p.word)).sort((a, b) => w.indexOf(words(a.word)[0]!) - w.indexOf(words(b.word)[0]!));
  let playWords: string[];
  if (found.length) playWords = found.flatMap((p) => words(p.word));
  else if (label.includes(",")) playWords = words(label.split(",").slice(1).join(" ")).filter((x) => !SIDES[x]);
  else return null;
  if (!playWords.length) return null;
  const last = Math.max(...playWords.map((x) => w.lastIndexOf(x)));
  const side = w.slice(last + 1).map((x) => SIDES[x]).find(Boolean) ?? null;
  return { play: [...new Set(playWords)].join(" "), side };
}

/** Run plays Reps can tell from the blocks: pullers, or the whole line stepping one way. */
export function runConcept(play: PlayData): string | null {
  const carrier = play.players.find((p) => p.assignment_type === "carry" && p.path && p.path.length > 1);
  if (!carrier) return null;
  const line = play.players.filter((p) => isLineman(p.id) && p.block);
  const pulls = line.filter((p) => p.block!.type === "pull").length;
  if (pulls >= 2) return "counter";
  if (pulls === 1) return "power";
  const sides = line.map((p) => Math.sign(p.block!.path?.at(-1)?.[0] ?? 0)).filter(Boolean);
  const endX = carrier.x + carrier.path!.at(-1)![0];
  if (sides.length >= 4 && Math.abs(sides.reduce((a, b) => a + b, 0)) >= sides.length - 1) return Math.abs(endX) >= 4 ? "outside_zone" : "inside_zone";
  return null;
}

/** The team's word for a concept, if its naming rules have one. */
function teamWord(concept: Concept, n: Naming | null, concepts: Concept[]): string | null {
  const name = concept.name.toLowerCase();
  const w = (n?.plays ?? []).find((p) => conceptByName(p.word, concepts)?.key === concept.key) ?? (n?.plays ?? []).find((p) => p.means.toLowerCase().includes(name));
  return w ? w.word.toUpperCase() : null;
}

export async function nameDrawnPlay(teamId: string, drawn: PlayData, database: Db = db): Promise<NameGuess> {
  const { naming: n } = await getNaming(teamId, database);
  const rows = await database
    .select({ id: plays.id, name: plays.name, data: plays.data, page: plays.sourcePage })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false)));
  const book: TeamPlay[] = rows
    .filter((r) => (r.data?.players.length ?? 0) > 0)
    .map((r) => ({ id: r.id, label: r.data!.name && r.data!.name !== "unknown" ? r.data!.name : r.name, data: r.data!, page: r.page ?? null }));
  const parts: Partial<NameParts> = {};
  const notes: string[] = [];

  // 1. the formation: the playbook play whose players stand where these do (either way round)
  // (when several stand the same way, the one drawn most like this play wins: "SPREAD ZOOT" for its SMASH)
  let lineupMatch: { tp: TeamPlay; mirror: boolean; cost: number; rank: number } | null = null;
  for (const tp of book)
    for (const mirror of [false, true]) {
      const players = mirror ? flipPlay(tp.data).players : tp.data.players;
      const cost = lineupCost(drawn.players, players);
      const rank = cost - jobLikeness(drawn.players, players);
      if (!lineupMatch || rank < lineupMatch.rank) lineupMatch = { tp, mirror, cost, rank };
    }
  if (lineupMatch && lineupMatch.cost < 2.5) {
    const f = readFormation(formationText(lineupMatch.tp.label, lineupMatch.tp.data, n), n);
    if (f.formation) {
      parts.formation = f.formation;
      parts.tag = f.tag;
      const side = f.side ?? (lineupMatch.tp.data.formation.strength === "left" ? "LEFT" : "RIGHT");
      parts.dir = lineupMatch.mirror ? flip(side) : side;
      notes.push(`Formation: lined up like ${lineupMatch.tp.label}${lineupMatch.tp.page ? ` (p${lineupMatch.tp.page})` : ""}${lineupMatch.mirror ? ", flipped" : ""}.`);
    }
  }
  if (!parts.formation) notes.push(book.length ? "Reps couldn't match this lineup to a formation in your playbook. Pick the formation." : "Pick the formation.");

  // 2. the motion: a playbook play with the same motion from the same spot
  const m = drawn.motion;
  const mover = m && drawn.players.find((p) => p.id === m.player);
  if (m && mover) {
    parts.motionPlayer = m.player;
    const motionWords = n?.motions ?? [];
    let best: { word: string; score: number; label: string } | null = null;
    for (const tp of book) {
      const tm = tp.data.motion;
      const tmover = tm && tp.data.players.find((p) => p.id === tm.player);
      if (!tm || !tmover || !tm.end || !m.end) continue;
      const word = motionWords.find((w) => has(tp.label, w.word));
      if (!word) continue;
      const mirror = Math.sign(tmover.x || 1) !== Math.sign(mover.x || 1);
      const dx = (tm.end[0] - tmover.x) * (mirror ? -1 : 1) - (m.end[0] - mover.x);
      const dy = tm.end[1] - tmover.y - (m.end[1] - mover.y);
      const score = Math.hypot(dx, dy) + (tm.player === m.player ? 0 : 2) + (tm.type !== m.type && m.type !== "unknown" ? 1.5 : 0);
      if (!best || score < best.score) best = { word: word.word.toUpperCase(), score, label: tp.label };
    }
    const byType = m.type !== "unknown" ? motionWords.find((w) => words(w.word).includes(m.type.toUpperCase()) || w.means.toLowerCase().includes(m.type)) : undefined;
    if (best && best.score < 5) {
      parts.motion = best.word;
      notes.push(`Motion: ${m.player} moves like ${best.label}.`);
    } else if (byType) {
      parts.motion = byType.word.toUpperCase();
      notes.push(`Motion: looks like ${m.type} motion.`);
    } else notes.push(`Pick the word for ${m.player}'s motion.`);
  }

  // 3. the play: a playbook play drawn the same way, else a concept Reps knows
  let same: NameGuess["same"] = null;
  let playMatch: { tp: TeamPlay; score: number } | null = null;
  for (const tp of book) {
    const score = Math.max(jobLikeness(drawn.players, tp.data.players), jobLikeness(drawn.players, flipPlay(tp.data).players));
    if (!playMatch || score > playMatch.score) playMatch = { tp, score };
  }
  const jobs = drawn.players.filter((p) => hasJob(p) && !isLineman(p.id)).length;
  const carrier = drawn.players.find((p) => p.assignment_type === "carry" && p.path && p.path.length > 1);
  const runSide = carrier ? (carrier.x + carrier.path!.at(-1)![0] >= 0 ? "RIGHT" : "LEFT") : null;
  const read = playMatch && playMatch.score >= 0.7 && jobs >= 2 ? readPlay(playMatch.tp.label, n) : null;
  if (playMatch && read) {
    parts.play = read.play;
    if (runSide) parts.playDir = runSide;
    else if (read.side) {
      const flipped = lineupCost(drawn.players, flipPlay(playMatch.tp.data).players) < lineupCost(drawn.players, playMatch.tp.data.players);
      parts.playDir = flipped ? flip(read.side) : read.side;
    } else parts.playDir = "";
    notes.push(`Play: drawn like ${playMatch.tp.label}${playMatch.tp.page ? ` (p${playMatch.tp.page})` : ""}.`);
    if (playMatch.score >= 0.9) same = { id: playMatch.tp.id, name: playMatch.tp.label, page: playMatch.tp.page };
  } else if (jobs) {
    const concepts = await conceptsForTeam(teamId, database);
    const runKey = runConcept(drawn);
    const concept = runKey ? concepts.find((c) => c.key === runKey) : recognizeConcept({ ...drawn, name: "unknown", pass_details: null }, concepts);
    if (concept) {
      const word = teamWord(concept, n, concepts);
      parts.play = word ?? concept.name.toUpperCase();
      parts.playDir = runSide ?? "";
      notes.push(
        word
          ? `Play: a new ${concept.name} (your playbook calls it ${word}).`
          : `Play: looks like ${concept.name}. Your naming rules don't have a word for it, so Reps called it ${concept.name.toUpperCase()}. Change it if you call it something else.`,
      );
    } else notes.push("New play: Reps couldn't tell which concept this is. Type the play's name.");
  }

  return { parts, notes, same };
}
