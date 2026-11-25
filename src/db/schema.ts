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
import type { Concept } from "@/domain/concepts";
import type { PlayData } from "@/domain/play";
import type { GoodVs } from "@/domain/matchups";
import type { Naming } from "@/domain/naming";
import type { Terms } from "@/domain/terms";
import type { RouteTree } from "@/domain/route-tree";

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
  /** naming rules Reps drafted from the playbook (null until drafted) */
  naming: jsonb().$type<Naming>(),
  /** when the coach confirmed the naming rules (null = still a draft) */
  namingApprovedAt: timestamp({ withTimezone: true }),
  /** flip diagrams in quizzes so players learn both sides */
  allowFlip: boolean().notNull().default(true),
  /** show a play's "vs front" drawings as one play with a version per front (coach preference) */
  groupFronts: boolean().notNull().default(true),
  /** Teach only asks about and reviews this week's install topics (the rest wait) */
  installOnly: boolean().notNull().default(false),
  /** what the coach calls this week's install, e.g. "Week 7: Eagles" (null = no name) */
  installName: text(),
  /** secret in the link that adds an assistant coach to the team (null = no link yet) */
  coachInviteCode: text().unique(),
  /** monthly AI cap in dollars, set by the Reps admin; AI stops when reached (null = the default cap) */
  aiBudgetUsd: integer(),
  /** whether Reps may run AI for this team: new teams wait for the Reps admin */
  aiAccess: text().$type<"pending" | "on" | "off">().notNull().default("pending"),
  /** this team's approved answers help Reps' suggestions for other coaches (as concepts, never names) */
  shareAnswers: boolean().notNull().default(true),
  /** Football basics: the coach's pick where coaches teach it differently, { styleKey: optionKey } */
  libraryStyles: jsonb().$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
  /** the team's route tree (numbers to routes), set on Settings; null = not set yet */
  routeTree: jsonb().$type<RouteTree>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** People who run Reps itself: they see every team on /admin and turn AI on or off. */
export const admins = pgTable("admins", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
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
    /** an offensive or a defensive playbook (decides how its drawings are read) */
    side: text().$type<"offense" | "defense">().notNull().default("offense"),
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
    aiRaw: jsonb(),
    extraction: text().$type<"pending" | "running" | "done" | "failed" | "not_a_play">().notNull().default("pending"),
    extractionError: text(),
    status: text().$type<"draft" | "needs_coach_input" | "approved">().notNull().default("draft"),
    qbReady: boolean().notNull().default(false),
    /** picked one by one for this week's install (topics can be in the install too) */
    inInstall: boolean().notNull().default(false),
    /** an offensive play or a defensive call */
    side: text().$type<"offense" | "defense">().notNull().default("offense"),
    /** what it's good against: tags the coach kept or added, and Reps' suggestions he dropped */
    goodVs: jsonb().$type<GoodVs>().notNull().default({ yes: [], no: [] }),
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
    /** old play-reader sets; new sets use topicIds */
    playIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    /** Teach topics in the set; players practice those topics' approved questions */
    topicIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
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
