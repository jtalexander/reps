/**
 * Teams, coach sign-in guards and the team's saved football data, for any
 * RepWon product. Server only. For now these are re-exports of where Install
 * keeps them (docs/BREAKDOWN-AUDIT.md section 3.2).
 */
import "server-only";

export { requireCoach } from "@/server/teams";
export { listFormations } from "@/server/formations";
