/**
 * After the 3-5 and Bear fronts went in: plays drawn "vs 3-5" / "vs Bear" that
 * were matched before those fronts existed get their drawn-against front.
 * Run only once the code with those fronts is live.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { plays, teams } from "@/db/schema";
import { BLOCK_FRONTS } from "@/domain/blocking";
import { PlayDataSchema } from "@/domain/play";

const [team] = await db.select().from(teams).where(eq(teams.name, process.argv[2]!));
const rows = await db.select({ id: plays.id, data: plays.data }).from(plays).where(and(eq(plays.teamId, team!.id), sql`${plays.data}->'blocking'->>'drawn' = 'true'`));
let n = 0;
for (const r of rows) {
  const d = PlayDataSchema.parse(r.data);
  const vs = d.name.match(/\s+vs\.?\s+(.+)$/i)?.[1]?.trim().toLowerCase();
  const f = vs ? BLOCK_FRONTS.find((x) => x.toLowerCase() === vs) : undefined;
  if (!f || d.blocking!.front === f) continue;
  if (process.argv[3] === "--apply") await db.update(plays).set({ data: { ...d, blocking: { ...d.blocking!, front: f } } }).where(eq(plays.id, r.id));
  n++;
}
console.log(process.argv[3] === "--apply" ? "fixed" : "would fix", n);
process.exit(0);
