/**
 * Reps database schema.
 *
 * Every team-owned table carries a NOT NULL team_id, and every query in
 * src/db/repo goes through a team-scoped function (see `teamRepo`). Team
 * separation is tested in tests/integration/tenancy.test.ts.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  date,
} from "drizzle-orm/pg-core";
import type { Box } from "@/ingest/boxes";
import type { CallSystem } from "@/domain/calls";
import type { Concept } from "@/domain/concepts";
import type { LibraryItem, LibraryKind } from "@/domain/library";
import type { PlayData } from "@/domain/play";
import type { Terms } from "@/domain/terms";

const id = () => uuid().primaryKey().defaultRandom();
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------- Better Auth (coaches) ----------
export const users = pgTable("users", {
  id: id(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerAccountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("auth_accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

// ---------- Teams ----------
export const teams = pgTable("teams", {
  id: id(),
  name: text().notNull(),
  level: text().$type<"youth" | "middle_school" | "high_school">().notNull().default("youth"),
  /** players type this to join; unique across the app */
  joinCode: text().notNull().unique(),
  /** bumped when the coach resets the code: old player cookies stop working */
  joinCodeVersion: integer().notNull().default(1),
  terms: jsonb().$type<Terms>().notNull().default(sql`'{}'::jsonb`),
  /** flip diagrams in quizzes so players learn both sides */
  allowFlip: boolean().notNull().default(true),
  /** how this team calls plays (src/domain/calls.ts) */
  callSystem: jsonb().$type<CallSystem>().notNull().default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const teamCoaches = pgTable(
  "team_coaches",
  {
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text().$type<"owner" | "coach">().notNull().default("coach"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

export const players = pgTable(
  "players",
  {
    id: id(),
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    /** first name + last initial; nothing else about the player is stored */
    name: text().notNull(),
    jersey: text(),
    /** positions this player studies, in the coach's terms (QB, X, RB...) */
    positions: text().array().notNull().default(sql`'{}'::text[]`),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("players_team_idx").on(t.teamId)],
);

// ---------- Playbook ingest ----------
export const uploads = pgTable(
  "uploads",
  {
    id: id(),
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    filename: text().notNull(),
    mediaKey: text().notNull(),
    pageCount: integer().notNull().default(0),
    status: text().$type<"uploading" | "rendering" | "ready" | "failed">().notNull().default("rendering"),
    error: text(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("uploads_team_idx").on(t.teamId)],
);

export const uploadPages = pgTable(
  "upload_pages",
  {
    id: id(),
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    uploadId: uuid()
      .notNull()
      .references(() => uploads.id, { onDelete: "cascade" }),
    pageNo: integer().notNull(),
    width: real().notNull(),
    height: real().notNull(),
    imageKey: text().notNull(),
    /** play boxes in PDF points (detected, then possibly adjusted by the coach) */
    boxes: jsonb().$type<Box[]>().notNull().default(sql`'[]'::jsonb`),
    boxesConfirmed: boolean().notNull().default(false),
    /** text layer items, points, for assigning text to boxes */
    text: jsonb().$type<Array<{ str: string; x: number; y: number; w: number; h: number }>>().notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("upload_pages_upload_page").on(t.uploadId, t.pageNo), index("upload_pages_team_idx").on(t.teamId)],
);

export const plays = pgTable(
  "plays",
  {
    id: id(),
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    uploadId: uuid().references(() => uploads.id, { onDelete: "set null" }),
    pageId: uuid().references(() => uploadPages.id, { onDelete: "set null" }),
    sourcePage: integer(),
    /** index of the box on its page, reading order */
    boxIndex: integer(),
    box: jsonb().$type<Box>(),
    cropKey: text(),
    cropWidth: integer(),
    cropHeight: integer(),
    sourceText: text().notNull().default(""),
    /** denormalized from data for lists and filters */
    name: text().notNull().default("unknown"),
    playType: text().notNull().default("unknown"),
    conceptKey: text(),
    data: jsonb().$type<PlayData>(),
    /**
     * What this row is. "play": a drawn play (data). "page": a box whose
     * content became library items (its children). concept / formation /
     * term / reading: a library item (item), keyed by name_key per team.
     */
    kind: text().$type<"play" | "page" | "calls" | LibraryKind>().notNull().default("play"),
    item: jsonb().$type<LibraryItem["data"]>(),
    nameKey: text(),
    /** the box (kind "page") this item was first read from */
    parentId: uuid(),
    sourcePages: integer().array().notNull().default(sql`'{}'::int[]`),
    aiRaw: jsonb(),
    extraction: text().$type<"pending" | "queued" | "running" | "done" | "failed" | "not_a_play">().notNull().default("pending"),
    extractionError: text(),
    status: text().$type<"draft" | "needs_coach_input" | "approved">().notNull().default("draft"),
    qbReady: boolean().notNull().default(false),
    approvedAt: timestamp({ withTimezone: true }),
    approvedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    sort: integer().notNull().default(0),
    archived: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("plays_team_idx").on(t.teamId, t.status),
    index("plays_upload_idx").on(t.uploadId),
    index("plays_team_kind_idx").on(t.teamId, t.kind),
    uniqueIndex("plays_library_name").on(t.teamId, t.kind, t.nameKey).where(sql`kind not in ('play', 'page')`),
  ],
);

/** A team's edits to library concepts (or its own concepts). */
export const teamConcepts = pgTable(
  "team_concepts",
  {
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    conceptKey: text().notNull(),
    data: jsonb().$type<Partial<Concept>>().notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.conceptKey] })],
);

// ---------- Study and results ----------
export const studySets = pgTable(
  "study_sets",
  {
    id: id(),
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: text().notNull(),
    dueDate: date(),
    playIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    /** empty = everyone */
    positions: text().array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [index("study_sets_team_idx").on(t.teamId)],
);

export const quizSessions = pgTable(
  "quiz_sessions",
  {
    id: id(),
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    playerId: uuid()
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    studySetId: uuid().references(() => studySets.id, { onDelete: "set null" }),
    mode: text().notNull(),
    position: text().notNull(),
    seed: integer().notNull(),
    /** the questions as served (answers included; never sent to the client before answering) */
    questions: jsonb().notNull(),
    startedAt: createdAt(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("quiz_sessions_player_idx").on(t.playerId)],
);

export const answers = pgTable(
  "answers",
  {
    id: id(),
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    playerId: uuid()
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    sessionId: uuid()
      .notNull()
      .references(() => quizSessions.id, { onDelete: "cascade" }),
    playId: uuid()
      .notNull()
      .references(() => plays.id, { onDelete: "cascade" }),
    questionId: text().notNull(),
    quizType: text().notNull(),
    correct: boolean().notNull(),
    responseMs: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("answers_team_idx").on(t.teamId, t.createdAt),
    index("answers_player_idx").on(t.playerId),
    uniqueIndex("answers_session_question").on(t.sessionId, t.questionId),
  ],
);

export const srsItems = pgTable(
  "srs_items",
  {
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    playerId: uuid()
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    playId: uuid()
      .notNull()
      .references(() => plays.id, { onDelete: "cascade" }),
    quizType: text().notNull(),
    box: integer().notNull().default(0),
    dueAt: timestamp({ withTimezone: true }).notNull(),
    seen: integer().notNull().default(0),
    correct: integer().notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.playId, t.quizType] })],
);
