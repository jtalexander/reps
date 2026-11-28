/**
 * Breakdown's tables. Like every team-owned table: a NOT NULL team_id, and a
 * row can only point at a parent row of the same team (enforced by Postgres,
 * as in drizzle/0014_team_guard.sql).
 *
 * Scout plays are kept in their own table, not in `plays`: an opponent's play
 * must never reach our playbook, our installs or a quiz on our own plays, and
 * a separate table makes that impossible instead of relying on every query to
 * filter. The play itself is the same PlayData document in the same yards.
 */
import { boolean, date, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { PlayData } from "../../domain/play";
import { teams, users } from "../../shared/db/tables";

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

/**
 * An opponent in one season. The staff is part of who they are: what a team
 * runs follows its coordinators, so "Central 2026" under a new OC is a
 * different playbook from "Central 2025".
 */
export const opponents = pgTable(
  "opponents",
  {
    id: id(),
    teamId: team(),
    name: text().notNull(),
    /** the name as compared: upper case, no punctuation */
    nameKey: text().notNull(),
    season: integer().notNull(),
    headCoach: text().notNull().default(""),
    offensiveCoordinator: text().notNull().default(""),
    defensiveCoordinator: text().notNull().default(""),
    notes: text().notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("opponents_team_name_season").on(t.teamId, t.nameKey, t.season), unique("opponents_id_team_unique").on(t.id, t.teamId)],
);

/** One game on one team's schedule. A school with two freshman teams has two teams, each with its own games. */
export const games = pgTable(
  "games",
  {
    id: id(),
    teamId: team(),
    opponentId: uuid().notNull(),
    gameDate: date().notNull(),
    /** as the coach typed it: "7:00 PM" */
    kickoff: text().notNull().default(""),
    homeAway: text().$type<"home" | "away" | "neutral">().notNull().default("home"),
    location: text().notNull().default(""),
    notes: text().notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("games_team_date").on(t.teamId, t.gameDate),
    unique("games_id_team_unique").on(t.id, t.teamId),
    foreignKey({ name: "games_opponent_id_same_team", columns: [t.opponentId, t.teamId], foreignColumns: [opponents.id, opponents.teamId] }).onDelete("cascade"),
  ],
);

/** One play in an opponent's playbook, for the scout team to run. */
export const scoutPlays = pgTable(
  "scout_plays",
  {
    id: id(),
    teamId: team(),
    opponentId: uuid().notNull(),
    name: text().notNull().default("unknown"),
    /** their offense (our defense practices against it) or their defense */
    side: text().$type<"offense" | "defense">().notNull().default("offense"),
    data: jsonb().$type<PlayData>().notNull(),
    /** drawn by a coach, or started from a snap marked on film */
    source: text().$type<"drawn" | "film">().notNull().default("drawn"),
    /** in this week's scout install: players see the card */
    inInstall: boolean().notNull().default(false),
    sort: integer().notNull().default(0),
    archived: boolean().notNull().default(false),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("scout_plays_team_opponent").on(t.teamId, t.opponentId),
    unique("scout_plays_id_team_unique").on(t.id, t.teamId),
    foreignKey({ name: "scout_plays_opponent_id_same_team", columns: [t.opponentId, t.teamId], foreignColumns: [opponents.id, opponents.teamId] }).onDelete("cascade"),
  ],
);
