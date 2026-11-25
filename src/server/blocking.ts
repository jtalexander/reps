/**
 * A team's blocking schemes: Reps' usual rules for each run, changed or added
 * to by the coach, and the defensive fronts the team sees. Changing a
 * scheme's rules redraws the blocking on every play that uses it.
 */
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Db } from "@/db";
import { plays, teams } from "@/db/schema";
import {
  applyBlocking,
  BLOCK_FRONTS,
  frontOk,
  HOLES,
  ROLES,
  RULES,
  SCHEME_LIBRARY,
  teamFronts,
  teamSchemes,
  withScheme,
  type TeamBlocking,
  type TeamScheme,
} from "@/domain/blocking";
import { PlayDataSchema } from "@/domain/play";
import { assignSchemes } from "@/teach/assign-schemes";

export async function getBlocking(teamId: string, database: Db = db) {
  const [t] = await database.select({ blocking: teams.blocking }).from(teams).where(eq(teams.id, teamId));
  const raw = (t?.blocking ?? {}) as TeamBlocking;
  return { schemes: teamSchemes(raw), fronts: teamFronts(raw), raw };
}

const SchemeInput = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/),
  name: z.string().trim().min(1).max(40),
  hole: z.enum(HOLES),
  rules: z.record(z.enum(ROLES), z.enum(RULES)),
  words: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
});

/** Save one scheme's rules, then redraw every play that uses it. Returns how many plays changed. */
export async function saveScheme(teamId: string, input: unknown, database: Db = db): Promise<{ scheme: TeamScheme; plays: number; matched: number }> {
  const s = SchemeInput.parse(input) as TeamScheme;
  s.words = [...new Set(s.words.map((w) => w.toUpperCase()))];
  const { raw } = await getBlocking(teamId, database);
  const schemes = [...(raw.schemes ?? []).filter((x) => x.key !== s.key), s];
  await database.update(teams).set({ blocking: { ...raw, schemes } }).where(eq(teams.id, teamId));
  const redrawn = await redrawPlays(teamId, s, database);
  // new play words may fit plays that had no scheme yet
  return { scheme: s, plays: redrawn, matched: await assignSchemes(teamId, database) };
}

/** Put one of Reps' schemes back to Reps' rules, or remove a scheme the coach added (plays keep their last rules). */
export async function resetScheme(teamId: string, key: string, database: Db = db): Promise<{ plays: number }> {
  const { raw } = await getBlocking(teamId, database);
  await database
    .update(teams)
    .set({ blocking: { ...raw, schemes: (raw.schemes ?? []).filter((x) => x.key !== key) } })
    .where(eq(teams.id, teamId));
  const lib = SCHEME_LIBRARY.find((x) => x.key === key);
  return { plays: lib ? await redrawPlays(teamId, { ...lib, words: [] }, database) : 0 };
}

export async function saveFronts(teamId: string, fronts: string[], database: Db = db) {
  const f = [...new Set(fronts)].filter(frontOk);
  if (!f.length) throw new Error("Pick at least one front.");
  const { raw } = await getBlocking(teamId, database);
  await database.update(teams).set({ blocking: { ...raw, fronts: f } }).where(eq(teams.id, teamId));
  return f;
}

/** Every play blocked with this scheme gets its new rules, and its blocks are worked out again. */
async function redrawPlays(teamId: string, s: TeamScheme, database: Db): Promise<number> {
  const rows = await database
    .select({ id: plays.id, data: plays.data })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false), sql`${plays.data}->'blocking'->>'scheme' = ${s.key}`));
  let n = 0;
  for (const r of rows) {
    const parsed = PlayDataSchema.safeParse(r.data);
    if (!parsed.success || !parsed.data.blocking) continue;
    const data = parsed.data;
    const b = withScheme(data.blocking!, s);
    const front = frontOk(b.front) ? b.front : BLOCK_FRONTS[0];
    // a playbook drawing keeps its own blocks; only Reps-built blocking is redrawn
    const next = { ...data, blocking: b, players: b.drawn ? data.players : applyBlocking(data, b, front) };
    await database.update(plays).set({ data: next }).where(and(eq(plays.teamId, teamId), eq(plays.id, r.id)));
    n++;
  }
  return n;
}

/**
 * Copy one team's blocking (scheme rules, play words, fronts) to another team
 * the same coach has: it replaces that team's blocking, redraws its plays that
 * use a copied scheme, and gives its other runs their schemes.
 */
export async function copyBlocking(fromTeamId: string, toTeamId: string, database: Db = db): Promise<{ redrawn: number; matched: number }> {
  if (fromTeamId === toTeamId) throw new Error("Pick another team.");
  const { raw } = await getBlocking(fromTeamId, database);
  const copy: TeamBlocking = JSON.parse(JSON.stringify(raw));
  await database.update(teams).set({ blocking: copy }).where(eq(teams.id, toTeamId));
  let redrawn = 0;
  for (const s of teamSchemes(copy)) redrawn += await redrawPlays(toTeamId, s, database);
  return { redrawn, matched: await assignSchemes(toTeamId, database) };
}
