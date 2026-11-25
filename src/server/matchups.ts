/**
 * What each play is good against, per team: the tags the coach kept, RepWon's
 * suggestions he hasn't decided on yet, and the game plan (our plays that
 * beat what the opponent shows).
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { db, type Db } from "@/db";
import { plays } from "@/db/schema";
import { playConceptKey, recognizeConcept } from "@/domain/concepts";
import { lookLabel, looksFor, setLook, suggestLooks, type GoodVs, type Side, type Suggestion } from "@/domain/matchups";
import { isDefense, type PlayData } from "@/domain/play";
import { playbookPages } from "@/teach/drawings";
import { conceptsForTeam, getPlay } from "./plays";

/** A tag key RepWon accepts: a shared word, a concept ("c:smash") or the coach's own words ("x:Cover 6"). */
export const LOOK_KEY = /^(?:[a-z0-9_]{1,30}|c:[a-z0-9_]{1,40}|x:[^\n]{1,40})$/;

export interface PlayLooks {
  side: Side;
  yes: Array<{ key: string; label: string }>;
  suggested: Array<Suggestion & { label: string }>;
  /** everything the coach can add: the shared words, and concepts for a defensive call */
  options: Array<{ key: string; label: string; group: string }>;
}

const sideOf = (data: PlayData | null): Side => (data && isDefense(data) ? "defense" : "offense");

/** The words around a play on its playbook page (what RepWon read there), for "good vs" sentences. */
async function pageText(teamId: string, page: number | null, database: Db) {
  if (!page) return [];
  const p = (await playbookPages(teamId, database)).find((x) => x.pageNo === page);
  return p ? p.facts.map((f) => f.text) : [];
}

export async function playLooks(teamId: string, playId: string, database: Db = db): Promise<PlayLooks | null> {
  const row = await getPlay(teamId, playId, database);
  if (!row?.data) return null;
  const side = sideOf(row.data);
  const concepts = await conceptsForTeam(teamId, database);
  const conceptKey = row.data.concept_key ?? playConceptKey(row.data) ?? recognizeConcept(row.data, concepts)?.key ?? null;
  const g = row.goodVs;
  const decided = new Set([...g.yes, ...g.no]);
  const label = (key: string) => lookLabel(key, concepts);
  return {
    side,
    yes: g.yes.map((key) => ({ key, label: label(key) })),
    suggested: suggestLooks(row.data, side, await pageText(teamId, row.sourcePage, database), conceptKey)
      .filter((s) => !decided.has(s.key))
      .map((s) => ({ ...s, label: label(s.key) })),
    options: [
      ...looksFor(side),
      // a defensive call can be good against a pass or run concept
      ...(side === "defense" ? concepts.map((c) => ({ key: `c:${c.key}`, label: c.name, group: "Concepts" })) : []),
    ].filter((o) => !g.yes.includes(o.key)),
  };
}

/** Keep (or add) a tag, or drop it. */
export async function setPlayLook(teamId: string, playId: string, key: string, on: boolean, database: Db = db) {
  if (!LOOK_KEY.test(key)) throw new Error("That isn't a tag RepWon knows.");
  const row = await getPlay(teamId, playId, database);
  if (!row) throw new Error("Play not found.");
  const next: GoodVs = setLook(row.goodVs, key, on);
  await database.update(plays).set({ goodVs: next }).where(and(eq(plays.teamId, teamId), eq(plays.id, playId)));
  return next;
}

/** Keep every suggestion RepWon has for a play. */
export async function keepSuggestedLooks(teamId: string, playId: string, database: Db = db) {
  const looks = await playLooks(teamId, playId, database);
  if (!looks) throw new Error("Play not found.");
  let g: GoodVs | null = null;
  for (const s of looks.suggested) g = await setPlayLook(teamId, playId, s.key, true, database);
  return g;
}

export interface PlanRow {
  id: string;
  name: string;
  approved: boolean;
  /** the opponent looks this play is good against, of the ones asked for */
  hits: string[];
  tags: string[];
}

/**
 * The game plan: our plays (offense or defense) that are good against what
 * the opponent shows, most matches first. Only tags the coach kept count.
 */
export async function gamePlan(teamId: string, side: Side, want: string[], database: Db = db): Promise<PlanRow[]> {
  const concepts = await conceptsForTeam(teamId, database);
  const rows = await database
    .select({ id: plays.id, name: plays.name, data: plays.data, status: plays.status, goodVs: plays.goodVs })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false), eq(plays.side, side)));
  return rows
    .filter((r) => r.goodVs.yes.length)
    .map((r) => ({
      id: r.id,
      name: r.data?.name && r.data.name !== "unknown" ? r.data.name : r.name,
      approved: r.status === "approved",
      hits: want.filter((k) => r.goodVs.yes.includes(k)).map((k) => lookLabel(k, concepts)),
      tags: r.goodVs.yes.map((k) => lookLabel(k, concepts)),
    }))
    .filter((r) => !want.length || r.hits.length)
    .sort((a, b) => b.hits.length - a.hits.length || Number(b.approved) - Number(a.approved) || a.name.localeCompare(b.name));
}

/** Every tag a team's plays use on one side (shared words first, then concepts and the coach's own words). */
export async function tagsInUse(teamId: string, side: Side, database: Db = db): Promise<Array<{ key: string; label: string; group: string }>> {
  const concepts = await conceptsForTeam(teamId, database);
  const rows = await database
    .select({ goodVs: plays.goodVs })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false), eq(plays.side, side)));
  const used = new Set(rows.flatMap((r) => r.goodVs.yes));
  const shared = looksFor(side).filter((l) => used.has(l.key));
  const own = [...used]
    .filter((k) => !shared.some((l) => l.key === k))
    .map((key) => ({ key, label: lookLabel(key, concepts), group: key.startsWith("c:") ? "Concepts" : "Your words" }));
  return [...shared, ...own];
}
