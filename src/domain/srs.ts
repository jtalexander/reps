/**
 * Spaced repetition (Leitner boxes) over (item, quiz type) pairs, and the
 * quiz builder that picks which questions a player sees next. Items are
 * drawn plays, library items (concepts, formations, terms) and the team's
 * call system. Missed items drop to box 0 and come back soon; correct
 * answers move up a box and wait longer.
 */
import {
  LIBRARY_QUIZ_TYPES,
  libraryCandidates,
  libraryQuestionsFor,
  libraryTypesForPositions,
  type CallsEntry,
  type LibEntry,
  type LibraryQuizType,
} from "./library-quiz";
import {
  QUIZ_TYPES,
  candidates,
  hashSeed,
  questionsFor,
  rng,
  typesForPositions,
  type AnyQuizType,
  type QuizContext,
  type QuizPlay,
  type QuizType,
  type Question,
} from "./quiz";

export const BOX_DAYS = [0, 1, 2, 4, 8, 16];
const DAY = 86_400_000;

export interface SrsState {
  playId: string;
  type: AnyQuizType;
  box: number;
  dueAt: Date;
  seen: number;
  correct: number;
}

export function nextState(prev: SrsState | undefined, key: { playId: string; type: AnyQuizType }, correct: boolean, now: Date): SrsState {
  const box = correct ? Math.min((prev?.box ?? 0) + 1, BOX_DAYS.length - 1) : 0;
  // a miss comes back in 10 minutes; a hit waits its box interval
  const wait = correct ? BOX_DAYS[box]! * DAY : 10 * 60_000;
  return {
    ...key,
    box,
    dueAt: new Date(now.getTime() + wait),
    seen: (prev?.seen ?? 0) + 1,
    correct: (prev?.correct ?? 0) + (correct ? 1 : 0),
  };
}

export type QuizMode = "mixed" | "speed" | AnyQuizType;

export interface BuildOptions {
  plays: QuizPlay[];
  ctx: QuizContext;
  /** approved library items and the approved call system (if any) */
  library?: LibEntry[];
  calls?: CallsEntry | null;
  state: SrsState[];
  now: Date;
  count: number;
  mode: QuizMode;
  /** restrict to these items (a study set) */
  playIds?: string[];
  seed: number;
}

const isPlayType = (t: AnyQuizType): t is QuizType => (QUIZ_TYPES as readonly string[]).includes(t);
const isLibType = (t: AnyQuizType): t is LibraryQuizType => (LIBRARY_QUIZ_TYPES as readonly string[]).includes(t);

export function buildQuiz(o: BuildOptions): Question[] {
  const keep = (id: string) => !o.playIds || o.playIds.includes(id);
  const plays = o.plays.filter((p) => keep(p.id));
  const library = (o.library ?? []).filter((e) => keep(e.id));
  // The call system belongs to every study set: decoding calls is always fair game.
  const calls = o.calls ?? null;
  const libCtx = { ...o.ctx, library: o.library ?? [], calls };

  let playTypes = typesForPositions(o.ctx.positions);
  let libTypes = libraryTypesForPositions(o.ctx.positions);
  if (o.mode === "speed") {
    playTypes = ["assignment"];
    libTypes = ["concept_rule", "call_decode"];
  } else if (o.mode !== "mixed") {
    playTypes = isPlayType(o.mode) && playTypes.includes(o.mode) ? [o.mode] : [];
    libTypes = isLibType(o.mode) && libTypes.includes(o.mode) ? [o.mode] : [];
  }

  const pairs: Array<{ playId: string; type: AnyQuizType }> = [
    ...candidates(plays, o.ctx, playTypes),
    ...libraryCandidates({ ...libCtx, library, calls: o.playIds && !calls ? null : calls }, libTypes),
  ];
  if (pairs.length === 0) return [];

  const byKey = new Map(o.state.map((s) => [`${s.playId}:${s.type}`, s]));
  const rand = rng(o.seed);
  const scored = pairs.map((p) => {
    const s = byKey.get(`${p.playId}:${p.type}`);
    // lower = sooner: due items by how overdue, then unseen, then the rest
    let score: number;
    if (!s) score = 1 + rand();
    else if (s.dueAt <= o.now) score = -((o.now.getTime() - s.dueAt.getTime()) / DAY) - (5 - s.box) + rand() * 0.5;
    else score = 2 + (s.dueAt.getTime() - o.now.getTime()) / DAY + rand();
    return { ...p, score };
  });
  scored.sort((a, b) => a.score - b.score);

  // Avoid long runs of one item: at most two questions per item when the pool allows.
  const picked: typeof scored = [];
  const used = new Map<string, number>();
  for (const p of scored) {
    if (picked.length >= o.count) break;
    if ((used.get(p.playId) ?? 0) >= 2 && scored.length > o.count * 2) continue;
    picked.push(p);
    used.set(p.playId, (used.get(p.playId) ?? 0) + 1);
  }
  let i = 0;
  while (picked.length < Math.min(o.count, pairs.length * 3) && scored.length) {
    picked.push(scored[i % scored.length]!);
    i++;
  }

  const playById = new Map(o.plays.map((p) => [p.id, p]));
  const libById = new Map((o.library ?? []).map((e) => [e.id, e]));
  const questions: Question[] = [];
  const seen = new Set<string>();
  for (const [n, p] of picked.entries()) {
    let qs: Question[] = [];
    const seed = hashSeed(o.seed, n);
    if (isPlayType(p.type)) {
      const play = playById.get(p.playId);
      if (play) qs = questionsFor(p.type, play, o.plays, o.ctx, seed);
    } else if (isLibType(p.type)) {
      const entry = libById.get(p.playId) ?? (calls && calls.id === p.playId ? calls : undefined);
      if (entry) qs = libraryQuestionsFor(p.type, entry, libCtx, seed);
    }
    const fresh = qs.filter((q) => !seen.has(q.id));
    const q = (fresh.length ? fresh : qs)[Math.floor(rand() * (fresh.length || qs.length))];
    if (!q) continue;
    seen.add(q.id);
    questions.push(o.mode === "speed" ? { ...q, timeLimit: o.ctx.level === "youth" ? 8 : 6, diagram: null } : q);
  }
  return questions.slice(0, o.count);
}
