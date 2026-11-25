/** Dry run: which of a team's plays would get a blocking scheme by name (changes nothing). */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { plays, teams } from "@/db/schema";
import { autoBlocking, teamFronts, teamSchemes, type TeamBlocking } from "@/domain/blocking";
import { playSideSign } from "@/domain/defense";
import { PlayDataSchema } from "@/domain/play";

const [team] = await db.select().from(teams).where(eq(teams.name, process.argv[2]!));
const raw = (team!.blocking ?? {}) as TeamBlocking;
const rows = await db.select({ name: plays.name, data: plays.data, playType: plays.playType }).from(plays).where(and(eq(plays.teamId, team!.id), eq(plays.archived, false)));
const types = new Map<string, number>();
const hits = new Map<string, string[]>();
for (const r of rows) {
  types.set(r.playType ?? "?", (types.get(r.playType ?? "?") ?? 0) + 1);
  const d = PlayDataSchema.safeParse(r.data);
  if (!d.success) continue;
  const b = autoBlocking(d.data, teamSchemes(raw), teamFronts(raw), playSideSign(d.data) === -1 ? "left" : "right");
  if (b) hits.set(b.name, [...(hits.get(b.name) ?? []), `${r.name} [${b.side}, ${b.front}]`]);
}
console.log("play types:", Object.fromEntries(types));
for (const [k, v] of hits) console.log(`\n${k} (${v.length}):\n  ${v.slice(0, 12).join("\n  ")}`);
process.exit(0);
