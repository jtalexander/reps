/**
 * Give the team's run plays their blocking scheme from their names (24 POWER
 * -> Power), so every play read from a playbook can be seen and quizzed
 * against any front. Used when a drawing is read and from the Blocking
 * schemes page. No "server-only": the background worker saves drawings too.
 */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { plays, teams } from "@/db/schema";
import { autoBlocking, teamFronts, teamSchemes, type TeamBlocking } from "@/domain/blocking";
import { playSideSign } from "@/domain/defense";
import { PlayDataSchema, type PlayData } from "@/domain/play";

async function candidates(teamId: string, ids: string[] | undefined, database: Db) {
  const [t] = await database.select({ blocking: teams.blocking }).from(teams).where(eq(teams.id, teamId));
  const raw = (t?.blocking ?? {}) as TeamBlocking;
  const schemes = teamSchemes(raw);
  const fronts = teamFronts(raw);
  const rows = await database
    .select({ id: plays.id, data: plays.data })
    .from(plays)
    .where(
      and(
        eq(plays.teamId, teamId),
        eq(plays.archived, false),
        isNotNull(plays.data),
        sql`(${plays.data}->'blocking' is null or ${plays.data}->>'blocking' = 'null')`,
        ...(ids ? [inArray(plays.id, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])] : []),
      ),
    );
  const out: Array<{ id: string; data: PlayData }> = [];
  for (const r of rows) {
    const parsed = PlayDataSchema.safeParse(r.data);
    if (!parsed.success) continue;
    const data = parsed.data;
    const b = autoBlocking(data, schemes, fronts, playSideSign(data) === -1 ? "left" : "right");
    if (b) out.push({ id: r.id, data: { ...data, blocking: b } });
  }
  return out;
}

/** How many plays would get a scheme (nothing is changed). */
export async function schemeMatches(teamId: string, database: Db = db): Promise<number> {
  return (await candidates(teamId, undefined, database)).length;
}

/** Give matching plays their scheme; returns how many changed. `ids` limits it to those plays. */
export async function assignSchemes(teamId: string, database: Db = db, ids?: string[]): Promise<number> {
  const found = await candidates(teamId, ids, database);
  for (const f of found) await database.update(plays).set({ data: f.data }).where(and(eq(plays.teamId, teamId), eq(plays.id, f.id)));
  return found.length;
}
