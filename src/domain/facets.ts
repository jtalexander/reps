/**
 * The playbook's tags, for finding plays: every play gets values for each
 * facet (formation, personnel, motion, concept, blocking scheme...), worked
 * out from how it's named and drawn. Filters combine like a coach thinks:
 * any of the values picked within a facet, and every facet picked.
 */
import { offenseShape } from "./blocking";
import { isLineman, type Player } from "./play";

export const FACETS = ["side", "formation", "personnel", "shift", "motion", "concept", "pressure", "scheme", "type", "direction", "good_vs", "status", "install"] as const;
export type Facet = (typeof FACETS)[number];
export const FACET_LABEL: Record<Facet, string> = {
  side: "Offense or defense",
  formation: "Formation",
  personnel: "Personnel",
  shift: "Shift",
  motion: "Motion",
  concept: "Concept or coverage",
  pressure: "Stunt or pressure",
  scheme: "Blocking scheme",
  type: "Play type",
  direction: "Direction",
  good_vs: "Good against",
  status: "Approved",
  install: "Install",
};

export interface FacetValue {
  value: string;
  label: string;
}
export type PlayFacets = Partial<Record<Facet, FacetValue[]>>;
export type Filter = Partial<Record<Facet, string[]>>;

/** Personnel by the usual count: backs then tight ends ("11" = one back, one tight end). Null when it can't tell. */
export function personnelOf(players: Player[]): string | null {
  const line = players.filter((p) => isLineman(p.id));
  if (line.length < 5) return null;
  const shape = offenseShape(players);
  const backs = shape.backs.filter((p) => p.id !== "QB").length;
  const tes = [shape.te["-1"], shape.te["1"], shape.wings["-1"], shape.wings["1"]].filter(Boolean).length;
  if (backs > 3 || tes > 3) return null;
  return `${backs}${tes}`;
}

/** Read a filter from the page's address (?formation=TRIPS&formation=PRO&scheme=power). */
export function filterFrom(sp: Record<string, string | string[] | undefined>): Filter {
  const out: Filter = {};
  for (const f of FACETS) {
    const v = sp[f];
    const list = (Array.isArray(v) ? v : v ? [v] : []).map((x) => x.slice(0, 60)).filter(Boolean);
    if (list.length) out[f] = [...new Set(list)].slice(0, 20);
  }
  return out;
}

/** The address for a filter (and search words). */
export function filterQuery(filter: Filter, q = ""): string {
  const u = new URLSearchParams();
  for (const f of FACETS) for (const v of filter[f] ?? []) u.append(f, v);
  if (q.trim()) u.set("q", q.trim());
  return u.toString();
}

/** One value picked or unpicked. */
export function toggle(filter: Filter, f: Facet, value: string): Filter {
  const cur = filter[f] ?? [];
  const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  const out = { ...filter };
  if (next.length) out[f] = next;
  else delete out[f];
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Does a play fit: every facet picked, any value within it, and the search words. */
export function fits(facets: PlayFacets, name: string, filter: Filter, q = "", skip?: Facet): boolean {
  for (const f of FACETS) {
    if (f === skip) continue;
    const want = filter[f];
    if (!want?.length) continue;
    const have = (facets[f] ?? []).map((v) => v.value);
    if (!want.some((w) => have.includes(w))) return false;
  }
  if (q.trim()) {
    const hay = norm([name, ...FACETS.flatMap((f) => (facets[f] ?? []).map((v) => v.label))].join(" "));
    return norm(q)
      .split(" ")
      .every((w) => hay.includes(w));
  }
  return true;
}

/**
 * The values each facet can take, with how many plays each would show given
 * everything else picked (so a count never promises plays that aren't there).
 */
export function facetOptions(rows: Array<{ name: string; facets: PlayFacets }>, filter: Filter, q = ""): Record<Facet, Array<FacetValue & { n: number; on: boolean }>> {
  const out = {} as Record<Facet, Array<FacetValue & { n: number; on: boolean }>>;
  for (const f of FACETS) {
    const counts = new Map<string, { label: string; n: number }>();
    for (const r of rows) {
      if (!fits(r.facets, r.name, filter, q, f)) continue;
      for (const v of r.facets[f] ?? []) {
        const c = counts.get(v.value) ?? { label: v.label, n: 0 };
        c.n++;
        counts.set(v.value, c);
      }
    }
    // picked values stay listed even when nothing else fits them
    for (const v of filter[f] ?? []) if (!counts.has(v)) counts.set(v, { label: v, n: 0 });
    out[f] = [...counts.entries()]
      .map(([value, c]) => ({ value, label: c.label, n: c.n, on: (filter[f] ?? []).includes(value) }))
      .sort((a, b) => Number(b.on) - Number(a.on) || b.n - a.n || a.label.localeCompare(b.label));
  }
  return out;
}

/** "Formation: TRIPS or PRO · Blocking scheme: Power" */
export function filterSummary(filter: Filter, labelOf: (f: Facet, v: string) => string): string {
  return FACETS.filter((f) => filter[f]?.length)
    .map((f) => `${FACET_LABEL[f]}: ${filter[f]!.map((v) => labelOf(f, v)).join(" or ")}`)
    .join(" · ");
}
