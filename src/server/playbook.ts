/**
 * The Playbook tab: every play the team has, tagged so the coach can find
 * "Power out of anything with a tight end" or "every play with jet motion",
 * and the views he saves.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, type Db } from "@/db";
import { teams } from "@/db/schema";
import { callSide } from "@/domain/blocking";
import { personnelOf, type FacetValue, type PlayFacets } from "@/domain/facets";
import { lookLabel } from "@/domain/matchups";
import { motionKind } from "@/domain/motion-draw";
import { isDefense } from "@/domain/play";
import { installPlays, TYPE_LABEL, type InstallPlay } from "@/teach/install";
import { has } from "@/teach/name-drawing";
import { getNaming } from "@/teach/naming";
import { conceptsForTeam } from "./plays";

export interface PlaybookPlay {
  id: string;
  name: string;
  approved: boolean;
  inInstall: boolean;
  page: number | null;
  data: InstallPlay["data"];
  facets: PlayFacets;
}

const one = (value: string | null | undefined, label?: string): FacetValue[] => (value ? [{ value, label: label ?? value }] : []);

export async function playbookPlays(teamId: string, database: Db = db): Promise<PlaybookPlay[]> {
  const [rows, { naming }, concepts] = await Promise.all([installPlays(teamId, database), getNaming(teamId, database), conceptsForTeam(teamId, database)]);
  const shiftWords = (naming?.motions ?? []).filter((m) => ["shift", "trade"].includes(motionKind(m.word, m.means))).map((m) => m.word.toUpperCase());
  return rows.map((r) => {
    const d = r.data;
    const defense = isDefense(d);
    const shift = shiftWords.find((w) => has(r.name, w)) ?? null;
    const motion = r.tags.motion && r.tags.motion !== shift ? r.tags.motion : null;
    // the play's direction, else the formation's ("TRIPS RIGHT, SMASH" goes right)
    const anyDir = /\b(LEFT|LT)\b/i.test(r.name) ? "left" : /\b(RIGHT|RT)\b/i.test(r.name) ? "right" : null;
    const dir = defense ? null : (callSide(r.name) ?? anyDir ?? (d.formation.strength === "left" ? "left" : d.formation.strength === "right" ? "right" : null));
    const personnel = defense ? null : personnelOf(d.players);
    const facets: PlayFacets = {
      side: defense ? one("defense", "Defense") : one("offense", "Offense"),
      formation: one(r.tags.formation),
      personnel: one(personnel, personnel ? `${personnel} personnel` : undefined),
      shift: one(shift),
      motion: one(motion),
      concept: one(r.tags.concept, r.tags.conceptLabel ?? undefined),
      pressure: defense ? [d.defense?.stunt, d.defense?.pressure].filter((x): x is string => Boolean(x?.trim())).map((x) => ({ value: x.trim().toUpperCase(), label: x.trim().toUpperCase() })) : [],
      scheme: one(d.blocking?.scheme, d.blocking?.name),
      type: one(r.tags.type !== "unknown" ? r.tags.type : null, TYPE_LABEL[r.tags.type] ?? r.tags.type),
      direction: one(dir, dir === "left" ? "Left" : "Right"),
      good_vs: r.goodVs.map((k) => ({ value: k, label: lookLabel(k, concepts) })),
      status: r.approved ? one("approved", "Approved") : one("draft", "Not approved yet"),
      install: r.picked || r.viaTopic ? one("in", "In this week's install") : one("out", "Not in the install"),
    };
    return { id: r.id, name: r.name, approved: r.approved, inInstall: r.picked || r.viaTopic, page: r.page, data: d, facets };
  });
}

export type PlaybookView = { id: string; name: string; query: string };

export async function playbookViews(teamId: string, database: Db = db): Promise<PlaybookView[]> {
  const [t] = await database.select({ v: teams.playbookViews }).from(teams).where(eq(teams.id, teamId));
  return t?.v ?? [];
}

/** Save the current filter under a name (a name already used is replaced). */
export async function saveView(teamId: string, name: string, query: string, database: Db = db): Promise<PlaybookView[]> {
  const n = name.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!n) throw new Error("Give the view a name.");
  const q = query.replace(/^\?/, "").slice(0, 1500);
  if (!q) throw new Error("Pick some filters first.");
  const views = (await playbookViews(teamId, database)).filter((v) => v.name.toLowerCase() !== n.toLowerCase());
  if (views.length >= 40) throw new Error("That's a lot of views: delete one first.");
  const next = [...views, { id: randomUUID().slice(0, 8), name: n, query: q }];
  await database.update(teams).set({ playbookViews: next }).where(eq(teams.id, teamId));
  return next;
}

export async function deleteView(teamId: string, id: string, database: Db = db): Promise<PlaybookView[]> {
  const next = (await playbookViews(teamId, database)).filter((v) => v.id !== id);
  await database.update(teams).set({ playbookViews: next }).where(eq(teams.id, teamId));
  return next;
}
