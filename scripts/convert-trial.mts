/**
 * Trial: turn a sample of a team's drawings into draft plays.
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/convert-trial.mts "<team name>" [list | key key ...]
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { convertDrawing } from "@/teach/convert";
import { playbookDrawings } from "@/teach/drawings";

const [teamName, ...rest] = process.argv.slice(2);
const [team] = await db.select().from(teams).where(eq(teams.name, teamName!));
if (!team) throw new Error(`No team ${teamName}`);
const all = await playbookDrawings(team.id);
if (rest[0] === "list") {
  for (const d of all) console.log(`${d.key}\t${d.topicName}\t${d.label}`);
  process.exit(0);
}
const keys = rest;
let i = 0;
async function worker() {
  while (i < keys.length) {
    const key = keys[i++]!;
    const t0 = Date.now();
    try {
      const r = await convertDrawing(team!.id, key);
      console.log(`ok   ${key}\t${((Date.now() - t0) / 1000).toFixed(0)}s\t${r.playId}${r.existed ? " (existed)" : ""}`);
    } catch (e) {
      console.log(`FAIL ${key}\t${(e as Error).message.slice(0, 200)}`);
    }
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
process.exit(0);
