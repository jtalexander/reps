/**
 * Spaced repetition (Leitner boxes) over (play, quiz type) pairs, and the
 * quiz builder that picks which questions a player sees next. Missed plays
 * drop to box 0 and come back in the same session window; correct answers
 * move up a box and wait longer.
 */
import {
  candidates,
  hashSeed,
  questionsFor,
  rng,
  typesForPositions,
  type QuizContext,
  type QuizPlay,
  type QuizType,
  type Question,
} from "./quiz";

export const BOX_DAYS = [0, 1, 2, 4, 8, 16];
const DAY = 86_400_000;

export interface SrsState {
  playId: string;
  type: QuizType;
  box: number;
  dueAt: Date;
  seen: number;
  correct: number;
}

export function nextState(prev: SrsState | undefined, key: { playId: string; type: QuizType }, correct: boolean, now: Date): SrsState {
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

export type QuizMode = "mixed" | "speed" | QuizType;

export interface BuildOptions {
  plays: QuizPlay[];
  ctx: QuizContext;
  state: SrsState[];
  now: Date;
  count: number;
  mode: QuizMode;
  /** restrict to these plays (a study set) */
  playIds?: string[];
  /** this week's install: its new plays come before other new plays */
  focus?: string[];
  seed: number;
}

export function buildQuiz(o: BuildOptions): Question[] {
  const plays = o.playIds ? o.plays.filter((p) => o.playIds!.includes(p.id)) : o.plays;
  if (plays.length === 0) return [];
  let types = typesForPositions(o.ctx.positions);
  if (o.mode === "speed") types = ["assignment"];
  else if (o.mode !== "mixed") types = types.includes(o.mode) ? [o.mode] : [];
  const pairs = candidates(plays, o.ctx, types);
  const byKey = new Map(o.state.map((s) => [`${s.playId}:${s.type}`, s]));
  const rand = rng(o.seed);
  const focus = new Set(o.focus ?? []);
  const scored = pairs.map((p) => {
    const s = byKey.get(`${p.playId}:${p.type}`);
    // lower = sooner: due items by how overdue, then unseen, then the rest
    let score: number;
    if (!s) score = (focus.has(p.playId) ? 0 : 1) + rand();
    else if (s.dueAt <= o.now) score = -((o.now.getTime() - s.dueAt.getTime()) / DAY) - (5 - s.box) + rand() * 0.5;
    else score = 2 + (s.dueAt.getTime() - o.now.getTime()) / DAY + rand();
    return { ...p, score };
  });
  scored.sort((a, b) => a.score - b.score);

  // Avoid long runs of one type or one play: take round-robin from the ordered list.
  const picked: typeof scored = [];
  const usedPlay = new Map<string, number>();
  for (const p of scored) {
    if (picked.length >= o.count) break;
    if ((usedPlay.get(p.playId) ?? 0) >= 2 && scored.length > o.count * 2) continue;
    picked.push(p);
    usedPlay.set(p.playId, (usedPlay.get(p.playId) ?? 0) + 1);
  }
  // Short pool: repeat pairs with different questions until the count is met.
  let i = 0;
  while (picked.length < Math.min(o.count, pairs.length * 3) && scored.length) {
    picked.push(scored[i % scored.length]!);
    i++;
  }

  const questions: Question[] = [];
  const seenIds = new Set<string>();
  for (const [n, p] of picked.entries()) {
    const play = plays.find((x) => x.id === p.playId)!;
    const qs = questionsFor(p.type, play, o.plays, o.ctx, hashSeed(o.seed, n));
    const fresh = qs.filter((q) => !seenIds.has(q.id));
    const q = (fresh.length ? fresh : qs)[Math.floor(rand() * (fresh.length || qs.length))];
    if (!q) continue;
    seenIds.add(q.id);
    questions.push(o.mode === "speed" ? { ...q, timeLimit: o.ctx.level === "youth" ? 8 : 5, diagram: null } : q);
  }
  return questions.slice(0, o.count);
}
