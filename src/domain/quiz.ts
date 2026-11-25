/**
 * Quiz generation. Every question is built from approved play data — never
 * invented — and every answer carries an explanation pulled from the play's
 * own reads, route descriptions or coaching points.
 *
 * Pure: plays + player position + terms in, questions out. Randomness comes
 * from a seeded generator so a quiz can be rebuilt for grading.
 */
import { frontOk, resolveBlocking, ROLE_LABEL, ruleWhy } from "./blocking";
import { callKey, CARD_LETTERS, explainCall, saidText, sayCall, signalKey, splitCall, type SaidPart } from "./calling";
import type { Band } from "./wristband";
import { COVERAGE_LABEL, COVERAGE_TELL, REACTIONS, READ_KEY_BY_KEY } from "./defense";
import { defJobText, ZONE_LABEL } from "./defense-play";
import { lookLabel } from "./matchups";
import {
  COVERAGES,
  DEF_ASSIGNMENT_TYPES,
  isDefense,
  isPassFamily,
  isUnknown,
  needsOptionRules,
  skillPlayers,
  type Coverage,
  type PlayData,
  type Player,
} from "./play";
import { drawable } from "./draw-grade";
import { ROUTES, ROUTE_BY_KEY, normalizeRouteName } from "./routes";
import { assignmentLabel, blockLabel, reactionLabel, term, title, type Terms } from "./terms";
import type { Level } from "./readiness";

const DEF_JOBS = new Set<string>(DEF_ASSIGNMENT_TYPES);

export const QUIZ_TYPES = [
  "formation_id",
  "assignment",
  "draw_job",
  "motion",
  "route_recognition",
  "presnap_read",
  "progression",
  "option_decision",
  "breakdown",
  "call_vs",
  "def_call_id",
  "block_vs",
  "call_decode",
  "signal_id",
] as const;
export type QuizType = (typeof QUIZ_TYPES)[number];

export const QUIZ_TYPE_LABEL: Record<QuizType, string> = {
  formation_id: "Formation ID",
  assignment: "My assignment",
  draw_job: "Draw my job",
  motion: "Motion",
  route_recognition: "Route recognition",
  presnap_read: "Presnap read",
  progression: "Progression",
  option_decision: "Option / RPO decision",
  breakdown: "Play-call breakdown",
  call_vs: "What to call",
  def_call_id: "Name the call",
  block_vs: "Who do I block",
  call_decode: "Decode the call",
  signal_id: "Signals",
};

export interface QuizPlay {
  id: string;
  data: PlayData;
  qbReady: boolean;
  /** what the coach says it's good against (kept tags only) */
  goodVs?: string[];
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
  /** a run's blocking: draw this front and every block against it */
  front?: string;
  /** route recognition: draw a single route on an empty field */
  routeOnly?: { route: string; side: "left" | "right" };
}

export interface Question {
  id: string;
  type: QuizType;
  playId: string;
  prompt: string;
  /** "choice": pick one; "order": put choices in order; "draw": draw your line on the play (graded on the server) */
  kind: "choice" | "order" | "draw";
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
  /** how the team calls plays (the band players learn): for decoding calls and signals */
  calling?: TeachCalling | null;
}

/** The band players learn: how calls are said, and the team's numbers. */
export interface TeachCalling {
  band: Pick<Band, "id" | "style" | "gridRows" | "gridCols" | "cards" | "cardSeed" | "calling" | "off">;
  numbers: Record<string, string>;
  labels: Record<string, string>;
  numbersBy: "play" | "concept";
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
  if (DEF_JOBS.has(String(p.assignment_type))) return defJobText(p);
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
  if (isDefense(play)) {
    const call = [play.defense?.front, play.defense?.coverage, play.defense?.stunt, play.defense?.pressure].filter(Boolean).join(", ");
    parts.push(`${defJobText(p)}${call ? ` in ${call}` : ""}.`);
    if (p.notes) parts.push(p.notes);
    return parts.join(" ");
  }
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
  if (isUnknown(play.data.formation.name) || isDefense(play.data)) return [];
  const pool = all.map((p) => formationLabel(p.data));
  // also offer the mirror name as a distractor: swap RIGHT/LEFT in the name, or add the other side
  const name = play.data.formation.name;
  if (/\b(right|left)\b/i.test(name)) pool.push(name.replace(/\b(right|left)\b/gi, (w) => (/right/i.test(w) ? (w === "RIGHT" ? "LEFT" : "Left") : w === "LEFT" ? "RIGHT" : "Right")));
  else if (play.data.formation.strength === "left" || play.data.formation.strength === "right")
    pool.push(`${name} ${play.data.formation.strength === "left" ? "Right" : "Left"}`);
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
    if (DEF_JOBS.has(String(p.assignment_type))) pool.push(...Object.values(ZONE_LABEL), ...["A", "B", "C", "D"].map((g) => `Rush the ${g} gap`), "Contain", "Spy the QB");
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

/** Draw your job: the play with everyone's lines but yours; draw yours. The answer is the player's letter. */
const drawJob: Gen = (play, _all, ctx, rand) => {
  const out: Question[] = [];
  const mine = play.data.players.filter((p) => playerMatches(p, ctx.positions) && drawable(p, play.data) && !(p.id === "QB" && p.assignment_type !== "carry" && p.assignment_type !== "route"));
  for (const p of mine) {
    const flip = ctx.allowFlip && rand() < 0.3;
    out.push({
      id: qid("draw_job", play.id, p.id),
      type: "draw_job",
      playId: play.id,
      prompt: `${play.data.name}${flip ? " (flipped)" : ""}: draw your job, ${term(ctx.terms, "positions", p.id)}.`,
      kind: "draw",
      choices: [],
      answer: p.id,
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

/** What to call: "They're in Cover 2. Which of our plays is built to beat it?" From the coach's kept tags only. */
const callVs: Gen = (play, all, ctx, rand) => {
  const tags = play.goodVs ?? [];
  // offense players get offensive plays, defenders get defensive calls
  if (!tags.length || !play.data.players.some((p) => playerMatches(p, ctx.positions))) return [];
  const defense = isDefense(play.data);
  const tag = tags[Math.floor(rand() * tags.length)]!;
  const label = lookLabel(tag);
  const name = (q: QuizPlay) => (q.data.name && q.data.name !== "unknown" ? q.data.name : "");
  const others = all.filter((q) => q.id !== play.id && isDefense(q.data) === defense && !(q.goodVs ?? []).includes(tag)).map(name);
  if (!name(play)) return [];
  const { choices, answer } = choicesFrom(name(play), others, rand);
  if (choices.length < 2) return [];
  const why = tags.map((t) => lookLabel(t)).join(", ");
  return [
    {
      id: qid("call_vs", play.id, tag),
      type: "call_vs",
      playId: play.id,
      prompt: defense ? `The offense shows ${label}. Which of our calls is built for it?` : `The defense shows ${label}. Which of our plays is built to beat it?`,
      kind: "choice",
      choices,
      answer,
      explanation: `${name(play)}: your coach tagged it good against ${why}.`,
      diagram: null,
    },
  ];
};

/** Name the call: a defensive call drawn on the field; which one is it? */
const defCallId: Gen = (play, all, ctx, rand) => {
  if (!isDefense(play.data) || !play.data.players.some((p) => playerMatches(p, ctx.positions))) return [];
  const name = play.data.name;
  if (!name || name === "unknown") return [];
  const others = all.filter((q) => q.id !== play.id && isDefense(q.data)).map((q) => q.data.name).filter((n) => n && n !== "unknown");
  const { choices, answer } = choicesFrom(name, others, rand);
  if (choices.length < 2) return [];
  return [
    {
      id: qid("def_call_id", play.id),
      type: "def_call_id",
      playId: play.id,
      prompt: "Name this call.",
      kind: "choice",
      choices,
      answer,
      explanation: `${name}.`,
      diagram: { playId: play.id, flip: false, hide: "none" },
    },
  ];
};

/**
 * Who do I block: a run against a front the coach checked; the blocker picks
 * his man. The answer comes from the scheme's rule (or the coach's fix).
 */
const blockVs: Gen = (play, _all, ctx, rand) => {
  const b = play.data.blocking;
  if (!b || isDefense(play.data)) return [];
  const name = play.data.name && play.data.name !== "unknown" ? play.data.name : b.name;
  const out: Question[] = [];
  for (const front of b.checked.filter(frontOk)) {
    const r = resolveBlocking(play.data, b, front);
    const label = (id: string) => {
      const d = r.defenders.find((x) => x.id === id);
      return d ? `${d.level === "line" ? "the " : ""}${d.label} (${d.id})` : id;
    };
    for (const blk of r.blocks) {
      const me = play.data.players.find((p) => p.id === blk.id);
      if (!me || !blk.target || !playerMatches(me, ctx.positions)) continue;
      const pool = r.defenders.filter((d) => d.level !== "back" && d.id !== blk.target).map((d) => label(d.id));
      const { choices, answer } = choicesFrom(label(blk.target), pool, rand);
      if (choices.length < 2) continue;
      out.push({
        id: qid("block_vs", play.id, `${front}:${me.id}`),
        type: "block_vs",
        playId: play.id,
        prompt: `${name} against a ${front}: who do you block?`,
        kind: "choice",
        choices,
        answer,
        explanation: blk.fixed
          ? `Your coach set it: against the ${front}, you take ${label(blk.target)}.`
          : `${ROLE_LABEL[blk.role]} on ${b.name}: ${ruleWhy(blk.rule)}. Against the ${front}, that's ${label(blk.target)}.`,
        diagram: { playId: play.id, flip: false, hide: "player", highlight: me.id, front },
      });
    }
  }
  return out;
};

// ---------- calling: decode the call, and signals ----------

/** The call as the team says it, part by part, or null when this play isn't on the band. */
function saidFor(play: QuizPlay, ctx: QuizContext, rand: () => number): { parts: SaidPart[]; card: string | null } | null {
  const t = ctx.calling;
  if (!t || isDefense(play.data)) return null;
  const sp = splitCall(play.data.name, isUnknown(play.data.formation.name) ? null : play.data.formation.name);
  const key = callKey(play.id, sp.play, t.numbersBy);
  if (t.band.off.includes(key)) return null;
  const number = t.numbers[key] ?? null;
  const card = t.band.style === "cards" ? CARD_LETTERS[Math.floor(rand() * t.band.cards)]! : null;
  const parts = sayCall({ formation: sp.formation, play: sp.play, number, label: t.labels[key] }, t.band, rand, { allNumbers: Object.values(t.numbers), card: card ?? undefined });
  return parts ? { parts, card } : null;
}

/** Hear the call ("ALABAMA 37 BLUE BINGO"): what's the play, and what's your job on it? */
const callDecode: Gen = (play, all, ctx, rand) => {
  const said = saidFor(play, ctx, rand);
  if (!said) return [];
  const out: Question[] = [];
  const text = saidText(said.parts);
  const heard = `The coach calls “${text}”${said.card ? ` (card ${said.card} is live)` : ""}`;
  const offense = all.filter((q) => !isDefense(q.data));
  const pick = choicesFrom(
    play.data.name,
    offense.map((q) => q.data.name),
    rand,
  );
  if (pick.choices.length >= 2)
    out.push({
      id: qid("call_decode", play.id),
      type: "call_decode",
      playId: play.id,
      prompt: `${heard}. What's the play?`,
      kind: "choice",
      choices: pick.choices,
      answer: pick.answer,
      explanation: explainCall(said.parts),
      diagram: null,
    });
  // and your job on it
  const p = play.data.players.find((x) => playerMatches(x, ctx.positions) && !isUnknown(x.assignment_type));
  if (p) {
    const correct = assignmentText(p, ctx.terms);
    const pool = offense.flatMap((q) => q.data.players.filter((o) => playerMatches(o, ctx.positions) && !isUnknown(o.assignment_type)).map((o) => assignmentText(o, ctx.terms)));
    const job = choicesFrom(correct, pool, rand);
    if (job.choices.length >= 2)
      out.push({
        id: qid("call_decode", play.id, `job:${p.id}`),
        type: "call_decode",
        playId: play.id,
        prompt: `${heard}. What's your job, ${term(ctx.terms, "positions", p.id)}?`,
        kind: "choice",
        choices: job.choices,
        answer: job.answer,
        explanation: `${explainCall(said.parts)} That's ${play.data.name}: ${explainAssignment(p, play.data)}`,
        diagram: null,
      });
  }
  return out;
};

/** See the signal: which formation (or play word) is it? */
const signalId: Gen = (play, all, ctx, rand) => {
  const t = ctx.calling;
  if (!t || isDefense(play.data)) return [];
  const signals = t.band.calling.signals;
  const split = (q: QuizPlay) => splitCall(q.data.name, isUnknown(q.data.formation.name) ? null : q.data.formation.name);
  const sp = split(play);
  const out: Question[] = [];
  const f = signals[signalKey.formation(sp.formation)];
  if (f && sp.formation) {
    const pool = [...new Set(all.filter((q) => !isDefense(q.data)).map((q) => split(q).formation))].filter(Boolean);
    const pick = choicesFrom(sp.formation, pool, rand);
    if (pick.choices.length >= 2)
      out.push({ id: qid("signal_id", play.id, "f"), type: "signal_id", playId: play.id, prompt: `The signal: ${f}. What formation?`, kind: "choice", choices: pick.choices, answer: pick.answer, explanation: `${f} means ${sp.formation}.`, diagram: null });
  }
  const w = t.band.calling.play === "word" ? signals[signalKey.word(sp.play)] : undefined;
  if (w) {
    const pool = [...new Set(all.filter((q) => !isDefense(q.data)).map((q) => split(q).play))];
    const pick = choicesFrom(sp.play, pool, rand);
    if (pick.choices.length >= 2)
      out.push({ id: qid("signal_id", play.id, "w"), type: "signal_id", playId: play.id, prompt: `The signal: ${w}. What's the play?`, kind: "choice", choices: pick.choices, answer: pick.answer, explanation: `${w} means ${sp.play}.`, diagram: null });
  }
  return out;
};

const GENERATORS: Record<QuizType, Gen> = {
  formation_id: formationId,
  assignment,
  draw_job: drawJob,
  motion,
  route_recognition: routeRecognition,
  presnap_read: presnapRead,
  progression,
  option_decision: optionDecision,
  breakdown,
  call_vs: callVs,
  def_call_id: defCallId,
  block_vs: blockVs,
  call_decode: callDecode,
  signal_id: signalId,
};

/** Quiz types that make sense for a set of positions. */
export function typesForPositions(positions: string[]): QuizType[] {
  const qb = positions.some((p) => p.toUpperCase() === "QB");
  const back = positions.some((p) => /^(RB|TB|HB|FB|F|B|R)$/i.test(p));
  // what to call and naming the call ask only about plays the player is in (offense or defense)
  const types: QuizType[] = ["formation_id", "assignment", "draw_job", "motion", "route_recognition", "breakdown", "call_vs", "def_call_id", "block_vs", "call_decode", "signal_id"];
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
  if (q.kind === "draw") return false; // graded against the play on the server (gradeDrawing)
  if (Array.isArray(q.answer)) return Array.isArray(given) && given.join(",") === q.answer.join(",");
  return given === q.answer;
}

export { isPassFamily, REACTIONS, COVERAGE_LABEL };
