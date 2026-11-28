/**
 * Football data every RepWon product shares: the play record, the team's
 * saved formations, the play-type list. For now these are re-exports of
 * where Install keeps them; the files move here later
 * (docs/BREAKDOWN-AUDIT.md section 3.2). Client-safe: nothing here touches
 * the database.
 */
export { PLAY_TYPES, PlayDataSchema, emptyPlay, isDefense, isLineman } from "@/domain/play";
export type { PlayData, PlayType, Player, Point } from "@/domain/play";
export { formationKey } from "@/domain/formations";
export type { TeamFormation } from "@/domain/formations";
