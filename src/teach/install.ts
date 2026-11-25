/**
 * This week's install: a name, whole topics, and plays picked one by one.
 * The coach finds plays by formation, motion and concept (read from each
 * play's name with the team's naming rules, and from how it's drawn), ticks
 * them and adds them. Picked plays, and the plays of install topics, come
 * first in players' play quizzes and play cards; the topics of picked plays
 * count as install topics for Teach's lessons and questions.
 */
import { and, asc, eq } from "drizzle-orm";
import { db, type Db } from "@/db";
import { plays } from "@/db/schema";
import { conceptByName, type Concept } from "@/domain/concepts";
import type { Naming } from "@/domain/naming";
import { isDefense, MOTION_TYPES, type PlayData } from "@/domain/play";
import { conceptsForTeam } from "@/server/plays";
import { playbookDrawings } from "./drawings";
import { formationText, has, passConcept, readFormation, runConcept, teamWord } from "./name-drawing";
import { getNaming } from "./naming";
import { words } from "./lineup";

export interface PlayTags {
  /** the team's formation word, e.g. "TRIPS" (no side) */
  formation: string | null;
  /** the team's motion word, or the kind of motion drawn ("Jet"); null = no motion */
  motion: string | null;
  /** concept key (or "w:WORD" for a team play word Reps can't tie to a concept) */
  concept: string | null;
  conceptLabel: string | null;
  type: string;
}

export const TYPE_LABEL: Record<string, string> = {
  run: "Run",
  pass: "Pass",
  play_action: "Play action",
  rpo: "RPO",
  screen: "Screen",
  option: "Option",
  special: "Special",
  defense: "Defense",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

/** How a concept reads to this coach: their word first, Reps' name after when they differ. */
function conceptLabel(c: Concept, n: Naming | null, concepts: Concept[]) {
  const w = teamWord(c, n, concepts);
  return w && w.toLowerCase() !== c.name.toLowerCase() ? `${w} (${c.name})` : c.name;
}

/** What a play is, for the install filters: formation, motion, concept and type. No AI. */
export function playTags(label: string, data: PlayData, n: Naming | null, concepts: Concept[]): PlayTags {
  if (isDefense(data)) {
    // a defensive call: its front, and its coverage where an offense has its concept
    const front = data.defense?.front?.trim().toUpperCase() || null;
    const cov = data.defense?.coverage?.trim() || null;
    return { formation: front, motion: null, concept: cov ? `w:${cov.toUpperCase()}` : null, conceptLabel: cov, type: "defense" };
  }
  // the formation: the team's word; without one, a short name that isn't a play word ("vs 4-3" is the front, not the formation)
  const text = formationText(label, data, n).split(/\bvs\b/i)[0]!;
  const read = readFormation(text, n).formation.trim();
  const known = (n?.formations ?? []).some((x) => has(text, x.word));
  const playWords = new Set((n?.plays ?? []).flatMap((x) => words(x.word)));
  const rest = words(read).filter((w) => !playWords.has(w) && !/^\d+$/.test(w));
  const f = known ? read : rest.length >= 1 && rest.length <= 2 ? rest.join(" ") : "";
  // motion: the team's word in the name, or the motion drawn
  const mWord = (n?.motions ?? []).find((m) => has(label, m.word));
  const motion = mWord
    ? mWord.word.toUpperCase()
    : data.motion
      ? data.motion.type && (MOTION_TYPES as readonly string[]).includes(data.motion.type)
        ? cap(data.motion.type)
        : "Motion"
      : null;
  // concept: what the play says it is, the team's play word, or what Reps sees in the drawing
  const byKey = data.concept_key ? concepts.find((c) => c.key === data.concept_key) : undefined;
  const pWord = (n?.plays ?? []).find((p) => has(label, p.word));
  const byWord = pWord ? (conceptByName(pWord.word, concepts) ?? conceptByName(pWord.means, concepts)) : undefined;
  const run = runConcept(data);
  const seen = passConcept(data, concepts) ?? (run ? concepts.find((c) => c.key === run) : undefined);
  const c = byKey ?? byWord ?? seen;
  const concept = c ? c.key : pWord ? `w:${pWord.word.toUpperCase()}` : null;
  return {
    formation: f ? f.toUpperCase() : null,
    motion,
    concept,
    conceptLabel: c ? conceptLabel(c, n, concepts) : pWord ? pWord.word.toUpperCase() : null,
    type: data.play_type && data.play_type !== "unknown" ? data.play_type : "unknown",
  };
}

export interface InstallPlay {
  id: string;
  name: string;
  approved: boolean;
  page: number | null;
  topicId: string | null;
  topicName: string | null;
  /** picked one by one */
  picked: boolean;
  /** in the install because its topic is */
  viaTopic: boolean;
  tags: PlayTags;
  data: PlayData;
}

/** Every play with a drawing Reps can show (converted or drawn), with its tags and install state. */
export async function installPlays(teamId: string, database: Db = db): Promise<InstallPlay[]> {
  const rows = await database
    .select()
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false)))
    .orderBy(asc(plays.sourcePage), asc(plays.boxIndex), asc(plays.name));
  const { naming } = await getNaming(teamId, database);
  const concepts = await conceptsForTeam(teamId, database);
  const drawings = new Map((await playbookDrawings(teamId, database)).map((d) => [d.key, d]));
  return rows
    .filter((r) => (r.data?.players.length ?? 0) > 0)
    .map((r) => {
      const key = (r.aiRaw as { drawingKey?: string } | null)?.drawingKey;
      const d = key ? drawings.get(key) : undefined;
      const label = r.data!.name && r.data!.name !== "unknown" ? r.data!.name : r.name;
      return {
        id: r.id,
        name: label,
        approved: r.status === "approved",
        page: r.sourcePage ?? d?.pageNo ?? null,
        topicId: d?.topicId ?? null,
        topicName: d?.topicName ?? null,
        picked: r.inInstall,
        viaTopic: d?.inInstall ?? false,
        tags: playTags(label, r.data!, naming, concepts),
        data: r.data!,
      };
    });
}

export { installPlayIds, installTopicIds, setInstallName, setPlaysInstall } from "./install-set";
