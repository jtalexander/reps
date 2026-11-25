/**
 * Teach: the playbook decoded by AI, the coach interview that fills the
 * gaps, and the lessons and questions built from both. Every lesson and
 * question needs the coach's approval before a player sees it.
 *
 * Every table carries team_id; every query filters by it.
 */
import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { Fact, DiagramRegion, QuestionData, QuestionImage } from "@/teach/types";
import type { Diagram } from "@/library/types";
import { players, teams, uploadPages, uploads, users } from "./schema";

const id = () => uuid().primaryKey().defaultRandom();
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const team = () =>
  uuid()
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" });

/** One playbook page as the AI decoded it. */
export const teachPages = pgTable(
  "teach_pages",
  {
    id: id(),
    teamId: team(),
    uploadId: uuid()
      .notNull()
      .references(() => uploads.id, { onDelete: "cascade" }),
    pageId: uuid()
      .notNull()
      .references(() => uploadPages.id, { onDelete: "cascade" }),
    pageNo: integer().notNull(),
    status: text().$type<"pending" | "decoding" | "decoded" | "not_playbook" | "failed">().notNull().default("pending"),
    error: text(),
    /** the playbook's own section heading for this page */
    section: text(),
    /** the topic the AI filed it under ("Snap count", "Veer", "Smash") */
    topicName: text(),
    summary: text(),
    facts: jsonb().$type<Fact[]>().notNull().default(sql`'[]'::jsonb`),
    diagrams: jsonb().$type<DiagramRegion[]>().notNull().default(sql`'[]'::jsonb`),
    aiRaw: jsonb(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("teach_pages_upload_page").on(t.uploadId, t.pageNo), index("teach_pages_team").on(t.teamId)],
);

/** A topic players learn: a formation family, a concept, the cadence... */
export const topics = pgTable(
  "topics",
  {
    id: id(),
    teamId: team(),
    name: text().notNull(),
    nameKey: text().notNull(),
    summary: text(),
    pageNos: integer().array().notNull().default(sql`'{}'::int[]`),
    sort: integer().notNull().default(0),
    /** gap finding and lesson/question writing, see jobs */
    gapsFoundAt: timestamp({ withTimezone: true }),
    generatedAt: timestamp({ withTimezone: true }),
    /** in the install the team is learning now: first in line for the coach and the players */
    inInstall: boolean().notNull().default(false),
    archived: boolean().notNull().default(false),
    /** set when the topic came from the Football basics library: its key and the version copied */
    libraryKey: text(),
    libraryVersion: integer(),
    /** the name's concept words (see reps_concept_words / conceptWords in teach/shared.ts), kept by Postgres for shared learning */
    conceptWords: text()
      .array()
      .generatedAlwaysAs(sql`reps_concept_words(name)`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("topics_team_name").on(t.teamId, t.nameKey), index("topics_concept_words").using("gin", t.conceptWords)],
);

/** A question RepWon asks the coach to fill a gap in the playbook. */
export const gaps = pgTable(
  "gaps",
  {
    id: id(),
    teamId: team(),
    topicId: uuid()
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    pageNo: integer(),
    question: text().notNull(),
    why: text(),
    appliesTo: text().array().notNull().default(sql`'{}'::text[]`),
    /** RepWon's suggested answer, clearly labeled as a suggestion */
    suggestion: text(),
    status: text().$type<"open" | "answered" | "approved" | "skipped">().notNull().default("open"),
    answer: text(),
    answeredBy: uuid().references(() => users.id, { onDelete: "set null" }),
    answeredAt: timestamp({ withTimezone: true }),
    sort: integer().notNull().default(0),
    /** "key": asked by default; "optional": left in a pile the coach can ignore */
    priority: text().$type<"key" | "optional">().notNull().default("key"),
    /** the same question asked under another topic; answering that one answers this */
    dupOf: uuid().references((): AnyPgColumn => gaps.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("gaps_team_status").on(t.teamId, t.status), index("gaps_dup_of").on(t.dupOf)],
);

export const lessons = pgTable(
  "lessons",
  {
    id: id(),
    teamId: team(),
    topicId: uuid()
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    /** who it's for: a position group (QB, RB, WR, TE, OL) or ALL */
    audience: text().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    sourcePages: integer().array().notNull().default(sql`'{}'::int[]`),
    /** a field drawing (Football basics lessons) */
    diagram: jsonb().$type<Diagram | null>(),
    /** the pass/run concept this lesson teaches (Football basics), so players see the team's plays that use it */
    conceptKey: text(),
    status: text().$type<"draft" | "approved" | "rejected">().notNull().default("draft"),
    approvedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp({ withTimezone: true }),
    sort: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("lessons_team_topic").on(t.teamId, t.topicId)],
);

export const questions = pgTable(
  "questions",
  {
    id: id(),
    teamId: team(),
    topicId: uuid()
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    audience: text().array().notNull().default(sql`'{ALL}'::text[]`),
    format: text().$type<"choice" | "tap" | "order" | "open">().notNull(),
    prompt: text().notNull(),
    data: jsonb().$type<QuestionData>().notNull(),
    explanation: text().notNull(),
    image: jsonb().$type<QuestionImage | null>(),
    /** a field drawing (Football basics questions) */
    diagram: jsonb().$type<Diagram | null>(),
    sourcePages: integer().array().notNull().default(sql`'{}'::int[]`),
    status: text().$type<"draft" | "approved" | "rejected">().notNull().default("draft"),
    /**
     * "core": the few must-know questions per topic the coach reviews first;
     * "reserve": the rest, kept out of the review until the coach wants more.
     * null = not sorted yet (treated as core so nothing is hidden).
     */
    tier: text().$type<"core" | "reserve">(),
    approvedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp({ withTimezone: true }),
    sort: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("questions_team_topic").on(t.teamId, t.topicId, t.status)],
);

/** Long AI steps, run inline locally and in a background function on Netlify. */
export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    teamId: team(),
    kind: text().$type<"decode_page" | "find_gaps" | "write_topic" | "triage" | "pick_core" | "playbook" | "naming" | "convert_drawing" | "read_batch" | "import_batch">().notNull(),
    /** what the job works on: a teach page, a topic, the team (triage, naming), the upload (a whole-playbook run), or a drawing key ("12.abc") */
    ref: text().notNull(),
    status: text().$type<"queued" | "running" | "done" | "failed">().notNull().default("queued"),
    error: text(),
    /** small summary for the page that started it (triage counts) */
    result: jsonb().$type<Record<string, number>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("jobs_team_ref").on(t.teamId, t.ref)],
);

/**
 * Reading the whole playbook's drawings in the background, after the naming
 * rules are confirmed: cropped, sent as one Message Batch (half price, usually
 * answered within the hour), then turned into plays. "cropping" -> "submitted"
 * -> "importing" -> "imported" (or "failed").
 */
export const readBatches = pgTable(
  "read_batches",
  {
    id: id(),
    teamId: team(),
    status: text().$type<"cropping" | "submitted" | "importing" | "imported" | "failed">().notNull().default("cropping"),
    /** drawing keys to read, in order; request i in the batch is keys[i] */
    keys: jsonb().$type<string[]>().notNull().default([]),
    /** how many of keys have been cropped so far */
    cropped: integer().notNull().default(0),
    /** keys that couldn't be cropped (left for an on-demand read) */
    skipped: jsonb().$type<string[]>().notNull().default([]),
    model: text().notNull(),
    batchId: text(),
    /** the site address workers call back to */
    origin: text(),
    made: integer().notNull().default(0),
    failed: integer().notNull().default(0),
    error: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("read_batches_team").on(t.teamId, t.status)],
);

export const attempts = pgTable(
  "attempts",
  {
    id: id(),
    teamId: team(),
    playerId: uuid()
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    /** "learn" (check after a lesson) or "practice" */
    mode: text().notNull().default("practice"),
    given: jsonb().notNull(),
    correct: boolean().notNull(),
    /** 0..1; partial credit for answers in the player's own words */
    score: real().notNull(),
    feedback: text(),
    responseMs: integer().notNull().default(0),
    gradedBy: text().$type<"auto" | "ai" | "coach">().notNull().default("auto"),
    overriddenBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("attempts_team").on(t.teamId, t.createdAt), index("attempts_player").on(t.playerId)],
);

export const questionSrs = pgTable(
  "question_srs",
  {
    teamId: team(),
    playerId: uuid()
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    box: integer().notNull().default(0),
    dueAt: timestamp({ withTimezone: true }).notNull(),
    seen: integer().notNull().default(0),
    correct: integer().notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.questionId] })],
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    teamId: team(),
    playerId: uuid()
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    lessonId: uuid()
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    completedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.lessonId] })],
);

/** A player saying "this question seems wrong", for the coach to look at. */
export const questionFlags = pgTable(
  "question_flags",
  {
    id: id(),
    teamId: team(),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    playerId: uuid()
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    note: text(),
    status: text().$type<"open" | "resolved">().notNull().default("open"),
    resolvedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("question_flags_team").on(t.teamId, t.status)],
);

/** Every "ask the playbook" answer, for the coach to read. */
export const askLog = pgTable(
  "ask_log",
  {
    id: id(),
    teamId: team(),
    playerId: uuid()
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    question: text().notNull(),
    answer: text().notNull(),
    sourcePages: integer().array().notNull().default(sql`'{}'::int[]`),
    answered: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("ask_log_team").on(t.teamId, t.createdAt)],
);

/** One Claude call: who it was for and how many tokens it used (for spend and budgets). */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    teamId: uuid().references(() => teams.id, { onDelete: "cascade" }),
    /** the job or action kind it ran under (write_topic, grade, ...) */
    kind: text().notNull(),
    /** the AI step (decode, gaps, write, grade, ...) */
    step: text().notNull(),
    model: text().notNull(),
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_team_time").on(t.teamId, t.createdAt)],
);
