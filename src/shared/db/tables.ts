/**
 * The tables every RepWon product may point at: teams, coaches, roster.
 * Relative imports on purpose: drizzle-kit reads schema files without the
 * "@/" alias.
 */
export { teams, users, players } from "../../db/schema";
