/**
 * Quiz sessions for a player: build from approved plays + the player's
 * spaced-repetition state, grade answers on the server (the client never
 * receives answers before it answers), and record results.
 */
import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { answers, plays, quizSessions, srsItems, studySets, teams } from "@/db/schema";
import { z } from "zod";
import { gradeDrawing } from "@/domain/draw-grade";
import { isDefense, LineSchema, type PlayData } from "@/domain/play";
import { isCorrect, type QuizContext, type QuizPlay, type QuizType, type Question } from "@/domain/quiz";
import { buildQuiz, nextState, type QuizMode, type SrsState } from "@/domain/srs";
import { term, TermsSchema } from "@/domain/terms";
import { bandOf, wristbandFrom } from "@/domain/wristband";
import { installPlayIds } from "@/teach/install";
import { approvedPlays } from "./plays";

export type Team = typeof teams.$inferSelect;

/** The band players learn calls from (the coach picks it on the wristband page). */
function teachCalling(raw: unknown): QuizContext["calling"] {
  const w = wristbandFrom(raw);
  if (!Object.keys(w.numbers).length && bandOf(w, w.teachBand).calling.play !== "word") return null;
  return { band: bandOf(w, w.teachBand), numbers: w.numbers, labels: w.labels, numbersBy: w.numbersBy };
}

export function contextFor(team: Team, position: string): QuizContext {
  return {
    terms: TermsSchema.parse(team.terms ?? {}),
    level: team.level,
    positions: [position],
    allowFlip: team.allowFlip,
    calling: teachCalling(team.wristband),
  };
}

export async function quizPlays(teamId: string, ids?: string[], database: Db = db): Promise<QuizPlay[]> {
  const rows = await approvedPlays(teamId, ids, database);
  return rows.filter((r) => r.data).map((r) => ({ id: r.id, data: r.data!, qbReady: r.qbReady, goodVs: r.goodVs.yes }));
}

export async function srsFor(playerId: string, database: Db = db): Promise<SrsState[]> {
  const rows = await database.select().from(srsItems).where(eq(srsItems.playerId, playerId));
  return rows.map((r) => ({
    playId: r.playId,
    type: r.quizType as QuizType,
    box: r.box,
    dueAt: r.dueAt,
    seen: r.seen,
    correct: r.correct,
  }));
}

/**
 * A question as the client sees it before answering: no answer, no
 * explanation, and a diagram stripped of anything that gives the answer
 * away (names, reads, the hidden player's route).
 */
export type PublicQuestion = Omit<Question, "answer" | "explanation"> & { index: number; play: PlayData | null };

export function diagramData(data: PlayData, q: Pick<Question, "diagram">, reveal = false): PlayData | null {
  if (!q.diagram) return null;
  const d = q.diagram;
  const players = data.players.map((p) => {
    const hidden = !reveal && (d.hide === "all" || (d.hide === "player" && p.id === d.highlight));
    // a hidden defender's job goes too (the field draws the usual line for a job even with no path)
    return hidden ? { ...p, route: null, block: null, path: null, notes: null, ...(isDefense(data) ? { assignment_type: "unknown" as const, def: null } : {}) } : { ...p, notes: null };
  });
  return {
    ...data,
    name: "",
    formation: reveal ? data.formation : { ...data.formation, name: "", personnel: "", backfield_alignment: "" },
    motion: !reveal && d.hide === "all" && data.motion ? { ...data.motion, end: null } : data.motion,
    players,
    pass_details: null,
    option_details: null,
    run_details: data.run_details ? { point_of_attack: data.run_details.point_of_attack, scheme: "", ball_carrier: data.run_details.ball_carrier } : null,
    coaching_points: [],
    field_confidence: {},
    suggested: [],
    from_concept: [],
    concept_key: null,
    defense: reveal ? data.defense : null,
  };
}

export function publicQuestion(q: Question, index: number, data: PlayData | undefined): PublicQuestion {
  const rest: Partial<Question> = { ...q };
  delete rest.answer;
  delete rest.explanation;
  return { ...(rest as Omit<Question, "answer" | "explanation">), index, play: data ? diagramData(data, q) : null };
}

export async function startSession(
  args: { team: Team; playerId: string; position: string; mode: QuizMode; studySetId?: string | null; install?: boolean; count?: number; now?: Date },
  database: Db = db,
) {
  const { team, playerId, position, mode } = args;
  let playIds: string[] | undefined;
  if (args.studySetId) {
    const [set] = await database
      .select()
      .from(studySets)
      .where(and(eq(studySets.teamId, team.id), eq(studySets.id, args.studySetId)));
    if (!set) throw new Error("Study set not found.");
    playIds = set.playIds;
  }
  // this week's install: only its plays when asked for, otherwise its new plays first
  const week = [...(await installPlayIds(team.id, database))];
  if (args.install && !args.studySetId) playIds = week;
  const all = await quizPlays(team.id, undefined, database);
  const ctx = contextFor(team, position);
  const seed = Math.floor(Math.random() * 2 ** 31);
  const questions = buildQuiz({
    plays: all,
    ctx,
    state: await srsFor(playerId, database),
    now: args.now ?? new Date(),
    count: args.count ?? (mode === "speed" ? 15 : 10),
    mode,
    playIds,
    focus: week,
    seed,
  });
  const [session] = await database
    .insert(quizSessions)
    .values({
      teamId: team.id,
      playerId,
      studySetId: args.studySetId ?? null,
      mode,
      position,
      seed,
      questions,
    })
    .returning();
  return { session: session!, questions };
}

export async function getSession(teamId: string, playerId: string, sessionId: string, database: Db = db) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const [s] = await database
    .select()
    .from(quizSessions)
    .where(and(eq(quizSessions.teamId, teamId), eq(quizSessions.playerId, playerId), eq(quizSessions.id, sessionId)));
  return s ?? null;
}

const point = z.tuple([z.number().min(-60).max(60), z.number().min(-40).max(60)]);
const DrawnSchema = z.object({ pts: z.array(point).min(2).max(600), pen: LineSchema });
const safeJson = (v: unknown) => {
  try {
    return typeof v === "string" ? JSON.parse(v) : null;
  } catch {
    return null;
  }
};

export async function answerQuestion(
  args: { teamId: string; playerId: string; sessionId: string; index: number; given: string | string[]; responseMs: number; now?: Date },
  database: Db = db,
) {
  const s = await getSession(args.teamId, args.playerId, args.sessionId, database);
  if (!s) throw new Error("Quiz not found.");
  const questions = s.questions as Question[];
  const q = questions[args.index];
  if (!q) throw new Error("Question not found.");
  const [play] = await database.select({ data: plays.data }).from(plays).where(and(eq(plays.teamId, args.teamId), eq(plays.id, q.playId)));
  // A timed-out speed question arrives with given = "" and counts as a miss.
  let correct = isCorrect(q, args.given);
  let note: string | null = null;
  if (q.kind === "draw") {
    // a drawn answer: checked against the play like a coach would
    const drawn = DrawnSchema.safeParse(safeJson(args.given));
    if (drawn.success && play?.data) {
      const [t] = await database.select({ terms: teams.terms }).from(teams).where(eq(teams.id, args.teamId));
      const terms = TermsSchema.parse(t?.terms ?? {});
      const g = gradeDrawing(play.data, String(q.answer), drawn.data, { flip: q.diagram?.flip, routeLabel: (k) => term(terms, "routes", k) });
      correct = g.correct;
      note = g.note;
    } else note = "Draw your line from your spot, then check it.";
  }
  const now = args.now ?? new Date();
  const inserted = await database
    .insert(answers)
    .values({
      teamId: args.teamId,
      playerId: args.playerId,
      sessionId: s.id,
      playId: q.playId,
      questionId: String(args.index),
      quizType: q.type,
      correct,
      responseMs: Math.max(0, Math.min(args.responseMs, 600_000)),
    })
    .onConflictDoNothing()
    .returning({ id: answers.id });
  if (inserted.length) {
    const [prev] = await database
      .select()
      .from(srsItems)
      .where(and(eq(srsItems.playerId, args.playerId), eq(srsItems.playId, q.playId), eq(srsItems.quizType, q.type)));
    const next = nextState(
      prev ? { playId: prev.playId, type: prev.quizType as QuizType, box: prev.box, dueAt: prev.dueAt, seen: prev.seen, correct: prev.correct } : undefined,
      { playId: q.playId, type: q.type },
      correct,
      now,
    );
    await database
      .insert(srsItems)
      .values({ teamId: args.teamId, playerId: args.playerId, playId: q.playId, quizType: q.type, box: next.box, dueAt: next.dueAt, seen: next.seen, correct: next.correct })
      .onConflictDoUpdate({
        target: [srsItems.playerId, srsItems.playId, srsItems.quizType],
        set: { box: next.box, dueAt: next.dueAt, seen: next.seen, correct: next.correct },
      });
  }
  if (args.index === questions.length - 1) {
    await database.update(quizSessions).set({ finishedAt: now }).where(eq(quizSessions.id, s.id));
  }
  const reveal = play?.data && q.diagram ? diagramData(play.data, q, true) : null;
  return { correct, answer: q.answer, explanation: q.explanation, reveal, note };
}

export async function sessionScore(sessionId: string, database: Db = db) {
  const [r] = await database
    .select({
      total: sql<number>`count(*)::int`,
      correct: sql<number>`count(*) filter (where ${answers.correct})::int`,
      avgMs: sql<number>`coalesce(avg(${answers.responseMs}), 0)::int`,
    })
    .from(answers)
    .where(eq(answers.sessionId, sessionId));
  return r!;
}

export async function recentSessions(playerId: string, database: Db = db) {
  return database.select().from(quizSessions).where(eq(quizSessions.playerId, playerId)).orderBy(desc(quizSessions.startedAt)).limit(5);
}

export async function playNames(teamId: string, database: Db = db) {
  const rows = await database.select({ id: plays.id, name: plays.name }).from(plays).where(eq(plays.teamId, teamId));
  return new Map(rows.map((r) => [r.id, r.name]));
}
