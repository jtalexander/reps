/** Drafting and saving a team's naming rules (see domain/naming.ts). */
import { and, asc, eq } from "drizzle-orm";
import { db, type Db } from "@/db";
import { teams } from "@/db/schema";
import { topics } from "@/db/teach-schema";
import { NamingSchema, type Naming } from "@/domain/naming";
import { draftNaming } from "./ai";
import { playbookPages } from "./drawings";

/** Everything Reps read, by topic, plus every drawing label: the material for the draft. */
export async function namingMaterial(teamId: string, database: Db = db) {
  const pages = await playbookPages(teamId, database);
  const ts = await database.select().from(topics).where(and(eq(topics.teamId, teamId), eq(topics.archived, false))).orderBy(asc(topics.sort));
  const byPage = new Map(pages.map((p) => [p.pageNo, p]));
  const parts: string[] = [];
  for (const t of ts) {
    const lines: string[] = [];
    for (const n of t.pageNos) {
      const p = byPage.get(n);
      if (!p) continue;
      lines.push(`  p${n}${p.section ? ` (${p.section})` : ""}: ${p.summary ?? ""}`);
      for (const f of p.facts) lines.push(`    - ${f.appliesTo.length ? `[${f.appliesTo.join(", ")}] ` : ""}${f.text}`);
      if (p.drawings.length) lines.push(`    drawings: ${p.drawings.map((d) => d.label).join(" | ")}`);
    }
    if (lines.length) parts.push(`TOPIC ${t.name}\n${lines.join("\n")}`);
  }
  return parts.join("\n\n");
}

export async function runNaming(teamId: string, database: Db = db) {
  const material = await namingMaterial(teamId, database);
  if (!material) throw new Error("Reps hasn't read any pages yet.");
  const naming = await draftNaming(material);
  await database.update(teams).set({ naming, namingApprovedAt: null }).where(eq(teams.id, teamId));
  return { positions: naming.positions.length, formations: naming.formations.length, plays: naming.plays.length };
}

export async function getNaming(teamId: string, database: Db = db) {
  const [t] = await database.select({ naming: teams.naming, approvedAt: teams.namingApprovedAt }).from(teams).where(eq(teams.id, teamId));
  return { naming: t?.naming ?? null, approvedAt: t?.approvedAt ?? null };
}

/** The coach's edits; saving again leaves it unconfirmed unless `approve`. */
export async function saveNaming(teamId: string, naming: Naming, approve: boolean, database: Db = db) {
  const clean = NamingSchema.parse(naming);
  await database
    .update(teams)
    .set({ naming: clean, namingApprovedAt: approve ? new Date() : null })
    .where(eq(teams.id, teamId));
}
