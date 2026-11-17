/**
 * Quiz generation. Every question is built from approved play data — never
 * invented — and every answer carries an explanation pulled from the play's
 * own reads, route descriptions or coaching points.
 *
 * Pure: plays + player position + terms in, questions out. Randomness comes
 * from a seeded generator so a quiz can be rebuilt for grading.
 */
import { COVERAGE_LABEL, COVERAGE_TELL, REACTIONS, READ_KEY_BY_KEY } from "./defense";
import {
  COVERAGES,
  isPassFamily,
  isUnknown,
  needsOptionRules,
  skillPlayers,
  type Coverage,
  type PlayData,
  type Player,
} from "./play";
import { ROUTES, ROUTE_BY_KEY, normalizeRouteName } from "./routes";
import { assignmentLabel, blockLabel, reactionLabel, term, title, type Terms } from "./terms";
import type { Level } from "./readiness";

export const QUIZ_TYPES = [
  "formation_id",
  "assignment",
  "motion",
  "route_recognition",
  "presnap_read",
  "progression",
  "option_decision",
  "breakdown",
] as const;
export type QuizType = (typeof QUIZ_TYPES)[number];

export const QUIZ_TYPE_LABEL: Record<QuizType, string> = {
  formation_id: "Formation ID",
  assignment: "My assignment",
  motion: "Motion",
  route_recognition: "Route recognition",
  presnap_read: "Presnap read",
  progression: "Progression",
  option_decision: "Option / RPO decision",
  breakdown: "Play-call breakdown",
};

export interface QuizPlay {
  id: string;
  data: PlayData;
  qbReady: boolean;
}

export interface Choice {
  id: string;
  label: string;
}

/** What the diagram under a question shows. */
export interface DiagramSpec {
  playId: string;
  flip: boolean;
  /** hide routes/paths: "all" hides every assignment, "player" hides only the asked player's */
  hide: "none" | "all" | "player";
  highlight?: string;
  coverage?: Coverage;
  /** option decision: the read key and how it reacts */
  readKey?: { key: string; reaction: string };
  /** route recognition: draw a single route on an empty field */
  routeOnly?: { route: string; side: "left" | "right" };
}

export interface Question {
  id: string;
  type: QuizType;
  playId: string;
  prompt: string;
  /** "choice": pick one; "order": put choices in order */
  kind: "choice" | "order";
  choices: Choice[];
  /** choice id, or ordered choice ids */
  answer: string | string[];
  explanation: string;
  diagram: DiagramSpec | null;
  /** seconds, for the speed round */
  timeLimit?: number;
}

export interface QuizContext {
  terms: Terms;
  level: Level;
  /** positions the player studies, e.g. ["QB"] or ["X", "Z"] */
  positions: string[];
  /** flip some diagrams left/right */
  allowFlip: boolean;
}

// ---------- seeded randomness ----------
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}
export function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Correct answer + up to 3 distinct distractors, shuffled. */
function choicesFrom(correct: string, pool: string[], rand: () => number, n = 4): { choices: Choice[]; answer: string } {
  const distractors = shuffle(
    [...new Set(pool.filter((p) => p && p.toLowerCase() !== correct.toLowerCase()))],
    rand,
  ).slice(0, n - 1);
  const labels = shuffle([correct, ...distractors], rand);
  const choices = labels.map((label, i) => ({ id: `c${i}`, label }));
  return { choices, answer: choices.find((c) => c.label === correct)!.id };
}

// ---------- labels ----------
export function playerMatches(p: Player, positions: string[]): boolean {
  const ps = positions.map((x) => x.toUpperCase());
  return ps.includes(p.id.toUpperCase()) || ps.includes(p.position.toUpperCase());
}

export function formationLabel(play: PlayData): string {
  const s = play.formation.strength;
  const name = play.formation.name;
  if (isUnknown(s) || s === "balanced" || /\b(rt|lt|right|left)\b/i.test(name)) return name;
  return `${name} ${s === "left" ? "Left" : "Right"}`;
}

export function assignmentText(p: Player, terms: Terms): string {
  if (p.assignment_type === "route" && p.route) {
    const name = term(terms, "routes", normalizeRouteName(p.route.name));
    const depth = typeof p.route.depth_yards === "number" ? ` at ${p.route.depth_yards}` : "";
    return `${name}${depth}`;
  }
  if ((p.assignment_type === "block" || p.assignment_type === "pass_pro") && p.block) {
    return p.block.target ? `${blockLabel(p.block.type)} — ${p.block.target}` : blockLabel(p.block.type);
  }
  return assignmentLabel(String(p.assignment_type));
}

function explainAssignment(p: Player, play: PlayData): string {
  const parts: string[] = [];
  if (p.route) {
    const def = ROUTE_BY_KEY.get(normalizeRouteName(p.route.name));
    if (def) parts.push(`${def.label}: ${def.describe}.`);
    if (p.route.notes) parts.push(p.route.notes);
  }
  if (p.notes) parts.push(p.notes);
  const step = play.pass_details?.progression.findIndex((s) => s.player === p.id) ?? -1;
  if (step >= 0) parts.push(`You are read #${step + 1}: ${play.pass_details!.progression[step]!.trigger}`);
  if (play.run_details?.ball_carrier === p.id)
    parts.push(`You carry it — ${play.run_details.scheme}, aiming at ${play.run_details.point_of_attack}.`);
  if (p.block) parts.push(`${blockLabel(p.block.type)}${p.block.target ? ` on the ${p.block.target}` : ""}.`);
  // Only coaching points written for this player ("Z: ...", "QB — ...") or for everyone.
  const mine = play.coaching_points.filter((c) => new RegExp(`^${p.id}\\b`, "i").test(c));
  parts.push(...mine.slice(0, 2));
  return parts.join(" ") || `${assignmentLabel(String(p.assignment_type))} on ${play.name}.`;
}

function motionText(play: PlayData, terms: Terms): string {
  const m = play.motion!;
  const who = term(terms, "positions", m.player);
  const type = isUnknown(m.type) ? "motion" : `${title(String(m.type))} motion`;
  const dir = isUnknown(m.direction) ? "" : ` ${m.direction}`;
  return `${who} — ${type}${dir}`;
}

// ---------- generators ----------
type Gen = (play: QuizPlay, all: QuizPlay[], ctx: QuizContext, rand: () => number) => Question[];

const qid = (type: string, playId: string, extra = "") => `${type}:${playId}${extra ? ":" + extra : ""}`;

const formationId: Gen = (play, all, ctx, rand) => {
  const correct = formationLabel(play.data);
  if (isUnknown(play.data.formation.name)) return [];
  const pool = all.map((p) => formationLabel(p.data));
  // also offer the mirror name as a distractor
  if (play.data.formation.strength === "left" || play.data.formation.strength === "right")
    pool.push(`${play.data.formation.name} ${play.data.formation.strength === "left" ? "Right" : "Left"}`);
  const { choices, answer } = choicesFrom(correct, pool, rand);
  if (choices.length < 2) return [];
  return [
    {
      id: qid("formation_id", play.id),
      type: "formation_id",
      playId: play.id,
      prompt: "Name this formation and its strength.",
      kind: "choice",
      choices,
      answer,
      explanation: `${correct}. ${play.data.formation.backfield_alignment !== "unknown" ? `Backfield: ${play.data.formation.backfield_alignment}. ` : ""}${play.data.formation.personnel !== "unknown" ? `${play.data.formation.personnel} personnel.` : ""}`.trim(),
      diagram: { playId: play.id, flip: false, hide: "all" },
    },
  ];
};

const assignment: Gen = (play, all, ctx, rand) => {
  const out: Question[] = [];
  // A QB's "job" is only worth asking when he carries it or runs a route;
  // his fakes and meshes are covered by the read questions.
  const mine = play.data.players.filter(
    (p) =>
      playerMatches(p, ctx.positions) &&
      !isUnknown(p.assignment_type) &&
      !(p.id === "QB" && !["carry", "route"].includes(String(p.assignment_type))),
  );
  for (const p of mine) {
    const correct = assignmentText(p, ctx.terms);
    const pool = [
      ...all.flatMap((q) => q.data.players.filter((o) => o.assignment_type === p.assignment_type).map((o) => assignmentText(o, ctx.terms))),
      ...play.data.players.filter((o) => o !== p && !isUnknown(o.assignment_type)).map((o) => assignmentText(o, ctx.terms)),
    ];
    if (p.assignment_type === "route") {
      pool.push(...ROUTES.filter((r) => ctx.level !== "youth" || r.basic).map((r) => term(ctx.terms, "routes", r.key)));
    }
    const { choices, answer } = choicesFrom(correct, pool, rand);
    if (choices.length < 2) continue;
    const flip = ctx.allowFlip && rand() < 0.3;
    out.push({
      id: qid("assignment", play.id, p.id),
      type: "assignment",
      playId: play.id,
      prompt: `${play.data.name}${flip ? " (flipped)" : ""}: what's your job, ${term(ctx.terms, "positions", p.id)}?`,
      kind: "choice",
      choices,
      answer,
      explanation: explainAssignment(p, play.data),
      diagram: { playId: play.id, flip, hide: "player", highlight: p.id },
    });
  }
  return out;
};

const motion: Gen = (play, all, ctx, rand) => {
  const m = play.data.motion;
  if (!m || isUnknown(m.type)) return [];
  const correct = motionText(play.data, ctx.terms);
  const pool = [
    ...all.filter((q) => q.data.motion && !isUnknown(q.data.motion.type)).map((q) => motionText(q.data, ctx.terms)),
    ...skillPlayers(play.data)
      .filter((p) => p.id !== m.player && p.id !== "QB")
      .map((p) => `${term(ctx.terms, "positions", p.id)} — ${title(String(m.type))} motion ${m.direction === "left" ? "right" : "left"}`),
    `${term(ctx.terms, "positions", m.player)} — ${title(String(m.type))} motion ${m.direction === "left" ? "right" : "left"}`,
  ];
  const { choices, answer } = choicesFrom(correct, pool, rand);
  const after = play.data.formation.strength;
  return [
    {
      id: qid("motion", play.id),
      type: "motion",
      playId: play.id,
      prompt: `${play.data.name}: who motions, and how?`,
      kind: "choice",
      choices,
      answer,
      explanation: `${correct}${isUnknown(m.timing) ? "" : m.timing === "at_snap" ? ", snap as he gets to the ball" : ", sets before the snap"}.${!isUnknown(after) ? ` Formation strength: ${after}.` : ""}`,
      diagram: { playId: play.id, flip: false, hide: "all" },
    },
  ];
};

const routeRecognition: Gen = (play, all, ctx, rand) => {
  const routes = play.data.players
    .filter((p) => p.route && ROUTE_BY_KEY.has(normalizeRouteName(p.route.name)) && (ctx.positions.includes("QB") || playerMatches(p, ctx.positions)))
    .map((p) => ({ key: normalizeRouteName(p.route!.name), side: (p.x < 0 ? "left" : "right") as "left" | "right" }));
  const uniq = [...new Map(routes.map((r) => [r.key, r])).values()];
  return uniq.slice(0, 2).map((r) => {
    const correct = term(ctx.terms, "routes", r.key);
    const pool = ROUTES.filter((x) => ctx.level !== "youth" || x.basic).map((x) => term(ctx.terms, "routes", x.key));
    const { choices, answer } = choicesFrom(correct, pool, rand);
    return {
      id: qid("route_recognition", play.id, r.key),
      type: "route_recognition" as const,
      playId: play.id,
      prompt: "Name this route.",
      kind: "choice" as const,
      choices,
      answer,
      explanation: `${correct}: ${ROUTE_BY_KEY.get(r.key)!.describe}.`,
      diagram: { playId: play.id, flip: false, hide: "all" as const, routeOnly: { route: r.key, side: r.side } },
    };
  });
};

const presnapRead: Gen = (play, all, ctx, rand) => {
  const pd = play.data.pass_details;
  if (!pd || !play.qbReady) return [];
  const out: Question[] = [];
  const answered = COVERAGES.filter((c) => pd.vs_coverage[c]?.target);
  const targets = skillPlayers(play.data).filter((p) => p.assignment_type === "route" || p.id === play.data.run_details?.ball_carrier);
  for (const cov of shuffle(answered, rand).slice(0, ctx.level === "youth" ? 1 : 2)) {
    const a = pd.vs_coverage[cov]!;
    const label = (id: string) => {
      if (id === "run") return "Hand it off / run";
      const p = play.data.players.find((x) => x.id === id);
      return p ? `${term(ctx.terms, "positions", id)} — ${assignmentText(p, ctx.terms)}` : id;
    };
    const correct = label(a.target);
    const pool = targets.map((p) => label(p.id));
    const { choices, answer } = choicesFrom(correct, pool, rand);
    const flip = ctx.allowFlip && rand() < 0.3;
    out.push({
      id: qid("presnap_read", play.id, cov),
      type: "presnap_read",
      playId: play.id,
      prompt: `${play.data.name}${flip ? " (flipped)" : ""} vs ${term(ctx.terms, "coverages", cov)}: where should the ball go?`,
      kind: "choice",
      choices,
      answer,
      explanation: `${term(ctx.terms, "coverages", cov)}: ${COVERAGE_TELL[cov]}. ${a.why}`,
      diagram: { playId: play.id, flip, hide: "none", coverage: cov },
    });
  }
  // "what do you look at" — compare with other plays' presnap reads
  if (!isUnknown(pd.presnap_read) && ctx.level !== "youth") {
    const pool = all.map((q) => q.data.pass_details?.presnap_read).filter((x): x is string => !!x && !isUnknown(x));
    if (new Set(pool).size >= 2) {
      const { choices, answer } = choicesFrom(pd.presnap_read, pool, rand, 3);
      out.push({
        id: qid("presnap_read", play.id, "look"),
        type: "presnap_read",
        playId: play.id,
        prompt: `${play.data.name}: what do you look at before the snap?`,
        kind: "choice",
        choices,
        answer,
        explanation: pd.presnap_read,
        diagram: { playId: play.id, flip: false, hide: "none" },
      });
    }
  }
  return out;
};

const progression: Gen = (play, _all, ctx, rand) => {
  const pd = play.data.pass_details;
  if (!pd || !play.qbReady || pd.progression.length < 2) return [];
  const label = (id: string) => {
    const p = play.data.players.find((x) => x.id === id);
    return p ? `${term(ctx.terms, "positions", id)} — ${assignmentText(p, ctx.terms)}` : id;
  };
  const steps = pd.progression;
  const choices = steps.map((s, i) => ({ id: `r${i}`, label: label(s.player) }));
  const out: Question[] = [
    {
      id: qid("progression", play.id, "order"),
      type: "progression",
      playId: play.id,
      prompt: `${play.data.name}: put your reads in order.`,
      kind: "order",
      choices: shuffle(choices, rand),
      answer: choices.map((c) => c.id),
      explanation: steps.map((s, i) => `${i + 1}. ${label(s.player)} — ${s.trigger}`).join(" "),
      diagram: { playId: play.id, flip: false, hide: "none" },
    },
  ];
  // "1 and 2 are covered — where now?"
  if (steps.length >= 3 || (steps.length === 2 && ctx.level !== "youth")) {
    const k = steps.length >= 3 ? 2 : 1;
    const next = steps[k]!;
    const covered = steps.slice(0, k).map((s) => label(s.player)).join(" and ");
    const pool = skillPlayers(play.data).filter((p) => p.assignment_type === "route").map((p) => label(p.id));
    const fallback = steps.length === k + 1 ? "Throw it away / scramble" : "";
    const { choices: cs, answer } = choicesFrom(label(next.player), [...pool, fallback], rand);
    out.push({
      id: qid("progression", play.id, "next"),
      type: "progression",
      playId: play.id,
      prompt: `${play.data.name}: ${covered} ${k > 1 ? "are" : "is"} covered. Where now?`,
      kind: "choice",
      choices: cs,
      answer,
      explanation: `Read #${k + 1}: ${label(next.player)} — ${next.trigger}`,
      diagram: { playId: play.id, flip: false, hide: "none" },
    });
  }
  return out;
};

const ACTION_LABEL = { give: "Give", keep: "Keep", pitch: "Pitch", throw: "Throw" } as const;

const optionDecision: Gen = (play, _all, ctx, rand) => {
  const od = play.data.option_details;
  if (!od || !needsOptionRules(play.data.play_type as PlayData["play_type"]) || !play.qbReady) return [];
  if (isUnknown(od.read_key) || od.decisions.length === 0) return [];
  const actions = [...new Set(od.decisions.map((d) => d.action))];
  const allActions = play.data.play_type === "rpo" ? ["give", "throw"] : od.pitch_or_pass_rule ? ["give", "keep", "pitch"] : ["give", "keep"];
  const keyLabel = term(ctx.terms, "read_keys", od.read_key) || READ_KEY_BY_KEY.get(od.read_key)?.label || od.read_key;
  return shuffle(od.decisions, rand)
    .slice(0, 2)
    .map((d) => {
      const opts = [...new Set([...allActions, ...actions])];
      const choices = opts.map((a) => ({ id: a, label: ACTION_LABEL[a as keyof typeof ACTION_LABEL] }));
      const rule = d.action === "give" ? od.give_rule : d.action === "keep" ? od.keep_rule : od.pitch_or_pass_rule ?? od.keep_rule;
      return {
        id: qid("option_decision", play.id, d.reaction),
        type: "option_decision" as const,
        playId: play.id,
        prompt: `${play.data.name}: the ${keyLabel.toLowerCase()} ${reactionLabel(d.reaction).toLowerCase()}. What do you do?`,
        kind: "choice" as const,
        choices,
        answer: d.action,
        explanation: rule,
        diagram: { playId: play.id, flip: false, hide: "none" as const, readKey: { key: od.read_key, reaction: d.reaction } },
      };
    });
};

const breakdown: Gen = (play, all, ctx, rand) => {
  // Concept + my job from a play call, each as its own question.
  const out: Question[] = [];
  const conceptName = play.data.concept_key ? term(ctx.terms, "concepts", play.data.concept_key) : play.data.pass_details?.concept_name;
  if (conceptName && !isUnknown(conceptName) && ctx.level !== "youth") {
    const pool = all
      .map((q) => (q.data.concept_key ? term(ctx.terms, "concepts", q.data.concept_key) : q.data.pass_details?.concept_name))
      .filter((x): x is string => !!x && !isUnknown(x));
    const { choices, answer } = choicesFrom(conceptName, pool, rand);
    if (choices.length >= 2)
      out.push({
        id: qid("breakdown", play.id, "concept"),
        type: "breakdown",
        playId: play.id,
        prompt: `Play call: "${play.data.name}". What's the concept?`,
        kind: "choice",
        choices,
        answer,
        explanation: `${conceptName} out of ${formationLabel(play.data)}${play.data.motion ? `, with ${motionText(play.data, ctx.terms)}` : ""}.`,
        diagram: null,
      });
  }
  const formation = formationLabel(play.data);
  if (!isUnknown(play.data.formation.name)) {
    const { choices, answer } = choicesFrom(formation, all.map((q) => formationLabel(q.data)), rand);
    if (choices.length >= 2)
      out.push({
        id: qid("breakdown", play.id, "formation"),
        type: "breakdown",
        playId: play.id,
        prompt: `Play call: "${play.data.name}". What's the formation?`,
        kind: "choice",
        choices,
        answer,
        explanation: `${formation}.`,
        diagram: null,
      });
  }
  for (const q of assignment(play, all, ctx, rand)) {
    out.push({ ...q, id: q.id.replace("assignment", "breakdown"), type: "breakdown", prompt: `Play call: "${play.data.name}". Your job?`, diagram: null });
  }
  return out;
};

const GENERATORS: Record<QuizType, Gen> = {
  formation_id: formationId,
  assignment,
  motion,
  route_recognition: routeRecognition,
  presnap_read: presnapRead,
  progression,
  option_decision: optionDecision,
  breakdown,
};

/** Quiz types that make sense for a set of positions. */
export function typesForPositions(positions: string[]): QuizType[] {
  const qb = positions.some((p) => p.toUpperCase() === "QB");
  const back = positions.some((p) => /^(RB|TB|HB|FB|F|B|R)$/i.test(p));
  const types: QuizType[] = ["formation_id", "assignment", "motion", "route_recognition", "breakdown"];
  if (qb) types.push("presnap_read", "progression", "option_decision");
  else if (back) types.push("option_decision");
  return types;
}

/** All questions for one play and quiz type. */
export function questionsFor(type: QuizType, play: QuizPlay, all: QuizPlay[], ctx: QuizContext, seed: number): Question[] {
  return GENERATORS[type](play, all, ctx, rng(hashSeed(seed, type, play.id)));
}

/** Every (play, type) pair this player can be quizzed on. */
export function candidates(plays: QuizPlay[], ctx: QuizContext, types = typesForPositions(ctx.positions)) {
  const out: Array<{ playId: string; type: QuizType }> = [];
  for (const play of plays)
    for (const type of types) {
      if (questionsFor(type, play, plays, ctx, 1).length) out.push({ playId: play.id, type });
    }
  return out;
}

export function isCorrect(q: Question, given: string | string[]): boolean {
  if (Array.isArray(q.answer)) return Array.isArray(given) && given.join(",") === q.answer.join(",");
  return given === q.answer;
}

export { isPassFamily, REACTIONS, COVERAGE_LABEL };
