/**
 * What a play still needs before it can be approved, and whether it is
 * QB-ready. This is the "forcing function": the review screen shows the
 * missing list as a checklist, and approval is refused until it is empty.
 */
import {
  COVERAGES,
  getPath,
  isPassFamily,
  isUnknown,
  needsOptionRules,
  skillPlayers,
  type PlayData,
} from "./play";

export const LEVELS = ["youth", "middle_school", "high_school"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABEL: Record<Level, string> = {
  youth: "Youth",
  middle_school: "Middle school",
  high_school: "High school",
};

/** Reads expected in a progression, by level. */
export const READS_EXPECTED: Record<Level, number> = { youth: 1, middle_school: 2, high_school: 2 };
/** Coverage answers expected for pass plays, by level (high school adds coverage reads). */
export const COVERAGES_EXPECTED: Record<Level, number> = { youth: 0, middle_school: 0, high_school: 2 };

export interface Missing {
  path: string;
  label: string;
}

export interface Readiness {
  missing: Missing[];
  lowConfidence: string[];
  suggested: string[];
  /** every requirement for this play type is met */
  complete: boolean;
  /** a pass/rpo/option play whose QB reads are complete (always false for runs) */
  qbReady: boolean;
  /** the play is a QB-read play (pass family or option) */
  qbPlay: boolean;
}

export function readiness(play: PlayData, level: Level = "high_school"): Readiness {
  const missing: Missing[] = [];
  const need = (path: string, label: string) => {
    const v = getPath(play, path);
    if (v == null || isUnknown(v) || (Array.isArray(v) && v.length === 0)) missing.push({ path, label });
  };

  need("name", "Play name");
  need("play_type", "Play type");
  need("formation.name", "Formation name");

  for (const [i, p] of play.players.entries()) {
    if (!skillPlayers(play).includes(p)) continue;
    if (isUnknown(p.assignment_type)) missing.push({ path: `players.${i}.assignment_type`, label: `${p.id}: job (route, block, carry...)` });
    else if (p.assignment_type === "route" && (!p.route || isUnknown(p.route.name)))
      missing.push({ path: `players.${i}.route.name`, label: `${p.id}: route name` });
  }
  if (play.motion) {
    if (isUnknown(play.motion.type)) missing.push({ path: "motion.type", label: "Motion type" });
  }

  const t = play.play_type;
  const qbPlay = isPassFamily(t as PlayData["play_type"]) || t === "option";
  const qbMissingStart = missing.length;

  if (t === "run" || t === "option" || t === "rpo") {
    need("run_details.point_of_attack", "Point of attack (hole or gap)");
    need("run_details.ball_carrier", "Ball carrier");
  }
  if (isPassFamily(t as PlayData["play_type"]) && t !== "rpo") {
    need("pass_details.presnap_read", "QB presnap read");
    const prog = play.pass_details?.progression ?? [];
    const want = t === "screen" ? 1 : READS_EXPECTED[level];
    if (prog.length < want)
      missing.push({ path: "pass_details.progression", label: want > 1 ? `QB progression (at least ${want} reads)` : "QB progression" });
    const covWant = t === "screen" ? 0 : COVERAGES_EXPECTED[level];
    if (covWant > 0) {
      const answered = COVERAGES.filter((c) => play.pass_details?.vs_coverage[c]?.target).length;
      if (answered < covWant)
        missing.push({ path: "pass_details.vs_coverage", label: `Best throw vs at least ${covWant} coverages` });
    }
  }
  if (t === "rpo") {
    need("pass_details.presnap_read", "QB presnap read");
  }
  if (needsOptionRules(t as PlayData["play_type"])) {
    need("option_details.read_key", "Read key (defender)");
    need("option_details.give_rule", "Give rule");
    need("option_details.keep_rule", "Keep / throw rule");
    need("option_details.decisions", "Decision for each read-key reaction");
  }

  const qbMissing = missing.length - qbMissingStart;
  const complete = missing.length === 0;
  const lowConfidence = Object.entries(play.field_confidence)
    .filter(([, c]) => c === "low" || c === "medium")
    .map(([p]) => p);
  return {
    missing,
    lowConfidence,
    suggested: play.suggested,
    complete,
    qbPlay,
    qbReady: qbPlay && complete && qbMissing === 0,
  };
}
