/**
 * The team's saved formations: save a lineup once, start plays from it, and
 * when a player moves in the formation, move him in the plays drawn from it.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, type Db } from "@/db";
import { plays, teams } from "@/db/schema";
import { formationKey, lineupOnly, moveToFormation, type TeamFormation } from "@/domain/formations";
import { isDefense, PlayDataSchema, PlayerSchema } from "@/domain/play";

export async function listFormations(teamId: string, database: Db = db): Promise<TeamFormation[]> {
  const [t] = await database.select({ f: teams.formations }).from(teams).where(eq(teams.id, teamId));
  return [...(t?.f ?? [])].sort((a, b) => a.name.localeCompare(b.name));
}

/** Plays drawn from a formation: their formation is named the same. */
async function playsIn(teamId: string, name: string, database: Db) {
  const key = formationKey(name);
  const rows = await database.select({ id: plays.id, data: plays.data }).from(plays).where(and(eq(plays.teamId, teamId), eq(plays.archived, false)));
  return rows.filter((r) => {
    const d = PlayDataSchema.safeParse(r.data);
    return d.success && !isDefense(d.data) && formationKey(d.data.formation.name) === key;
  });
}

export async function formationUse(teamId: string, database: Db = db): Promise<Record<string, number>> {
  const rows = await database.select({ data: plays.data }).from(plays).where(and(eq(plays.teamId, teamId), eq(plays.archived, false)));
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = r.data?.formation?.name ? formationKey(r.data.formation.name) : "";
    if (k) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

const Input = z.object({ id: z.string().max(40).optional(), name: z.string().trim().min(1).max(60), players: z.array(PlayerSchema).min(1).max(15) });

/**
 * Save a formation (a new one, or `id` to change one). With `movePlays`, every
 * play drawn from it gets its players moved to the new spots (jobs stay).
 */
export async function saveFormation(teamId: string, input: unknown, opts: { movePlays?: boolean } = {}, database: Db = db): Promise<{ formation: TeamFormation; moved: number }> {
  const v = Input.parse(input);
  const all = await listFormations(teamId, database);
  const name = formationKey(v.name);
  const before = v.id ? all.find((f) => f.id === v.id) : undefined;
  if (v.id && !before) throw new Error("That formation is gone.");
  if (all.some((f) => f.id !== v.id && formationKey(f.name) === name)) throw new Error(`You already have ${name}. Open it to change it.`);
  const formation: TeamFormation = { id: before?.id ?? randomUUID().slice(0, 8), name, players: lineupOnly(v.players), updatedAt: new Date().toISOString() };
  const next = [...all.filter((f) => f.id !== formation.id), formation];
  await database.update(teams).set({ formations: next }).where(eq(teams.id, teamId));
  let moved = 0;
  if (opts.movePlays) {
    for (const r of await playsIn(teamId, before?.name ?? name, database)) {
      const d = PlayDataSchema.parse(r.data);
      const m = moveToFormation(d.players, formation.players);
      if (!m.moved) continue;
      await database
        .update(plays)
        .set({ data: { ...d, players: m.players, formation: { ...d.formation, name } } })
        .where(and(eq(plays.teamId, teamId), eq(plays.id, r.id)));
      moved++;
    }
  }
  return { formation, moved };
}

export async function deleteFormation(teamId: string, id: string, database: Db = db) {
  const next = (await listFormations(teamId, database)).filter((f) => f.id !== id);
  await database.update(teams).set({ formations: next }).where(eq(teams.id, teamId));
}

/** Formation-only plays from the playbook (drawn with no jobs) that aren't saved formations yet. */
export async function playbookFormations(teamId: string, database: Db = db) {
  const saved = new Set((await listFormations(teamId, database)).map((f) => formationKey(f.name)));
  const rows = await database.select({ id: plays.id, name: plays.name, data: plays.data, playType: plays.playType }).from(plays).where(and(eq(plays.teamId, teamId), eq(plays.archived, false)));
  const seen = new Set<string>();
  const out: Array<{ id: string; name: string; data: NonNullable<(typeof rows)[number]["data"]> }> = [];
  for (const r of rows) {
    if (!r.data || r.playType !== "unknown" || isDefense(r.data) || r.data.players.length < 7) continue;
    // a formation drawing: nobody has a job
    if (r.data.players.some((p) => p.route || p.block || (p.path && p.path.length > 1))) continue;
    const name = formationKey(r.name.replace(/\(.*?\)/g, "").replace(/\s+vs\.?\s+.*$/i, ""));
    if (!name || saved.has(name) || seen.has(name)) continue;
    seen.add(name);
    out.push({ id: r.id, name, data: r.data });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
