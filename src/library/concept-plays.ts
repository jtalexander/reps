/**
 * "Our plays that use this concept": the team's approved plays matched to a
 * concept (smash, flood...) by the concept set on the play, or by the
 * concept's name (or the team's word for it) in the play call.
 */
import { playConceptKey, recognizeConcept } from "@/domain/concepts";
import { conceptsForTeam } from "@/server/plays";
import { quizPlays } from "@/server/quiz";
import { db, type Db } from "@/db";

export type ConceptPlay = { id: string; name: string };

export async function playsByConcept(teamId: string, keys: string[], database: Db = db): Promise<Record<string, ConceptPlay[]>> {
  const want = new Set(keys.filter(Boolean));
  const out: Record<string, ConceptPlay[]> = {};
  if (!want.size) return out;
  const [plays, concepts] = await Promise.all([quizPlays(teamId, undefined, database), conceptsForTeam(teamId, database)]);
  for (const p of plays) {
    const key = playConceptKey(p.data) ?? recognizeConcept(p.data, concepts)?.key ?? null;
    if (!key || !want.has(key)) continue;
    (out[key] ??= []).push({ id: p.id, name: p.data.name });
  }
  return out;
}
