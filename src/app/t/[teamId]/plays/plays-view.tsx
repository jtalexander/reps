import Link from "next/link";
import { FACET_LABEL, FACETS, facetOptions, filterFrom, filterQuery, filterSummary, fits, toggle, type Facet } from "@/domain/facets";
import { playbookPlays, playbookViews } from "@/server/playbook";
import { DeleteView, PlaybookGrid, SaveView, type GridRow } from "./plays-client";

const chip = (on: boolean) => `inline-flex items-center gap-1 px-2.5 py-1 text-sm ${on ? "bg-brand text-brand-ink" : "border border-line bg-card hover:border-ink"}`;
const PAGE = 48;

/** Facets worth showing first; the rest sit behind "More filters". */
const MAIN: Facet[] = ["formation", "personnel", "motion", "concept", "pressure", "scheme", "type"];

/**
 * Every play, findable by anything it is: pick formations, personnel, motion,
 * concept, blocking scheme... in any combination, save the combination as a
 * view, and add what it finds to this week's install.
 */
export async function PlaysView({ teamId, sp, header }: { teamId: string; sp: Record<string, string | string[] | undefined>; header: React.ReactNode }) {
  const [rows, views] = await Promise.all([playbookPlays(teamId), playbookViews(teamId)]);
  const filter = filterFrom(sp);
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const n = Math.min(Math.max(Number(sp.n) || PAGE, PAGE), 600);
  const options = facetOptions(rows, filter, q);
  const found = rows.filter((r) => fits(r.facets, r.name, filter, q));
  const query = filterQuery(filter, q);
  const labelOf = (f: Facet, v: string) => options[f].find((o) => o.value === v)?.label ?? v;
  const href = (next: string) => `/t/${teamId}/plays${next ? `?${next}` : ""}`;
  const any = Boolean(query);
  // a facet is worth offering when it splits the plays (or the coach already picked from it)
  const useful = (f: Facet) => options[f].length > 1 || (options[f][0] !== undefined && options[f][0].n < found.length) || (filter[f]?.length ?? 0) > 0;
  const shownFacets = FACETS.filter(useful);
  const more = shownFacets.filter((f) => !MAIN.includes(f));
  const grid: GridRow[] = found.slice(0, n).map((r) => ({
    id: r.id,
    name: r.name,
    tags: (["formation", "personnel", "motion", "concept", "scheme"] as Facet[])
      .flatMap((f) => (r.facets[f] ?? []).map((v) => v.label))
      .filter((x, i, a) => a.indexOf(x) === i)
      .join(" · "),
    approved: r.approved,
    inInstall: r.inInstall,
    data: r.data,
  }));
  const activeView = views.find((v) => v.query === query);

  const group = (f: Facet) => (
    <div key={f} className="flex flex-col gap-1">
      <span className="label">{FACET_LABEL[f]}</span>
      <div className="flex flex-wrap gap-1">
        {options[f].slice(0, 30).map((o) => (
          <Link key={o.value} href={href(filterQuery(toggle(filter, f, o.value), q))} className={chip(o.on)} aria-pressed={o.on} scroll={false}>
            {o.label}
            <span className={o.on ? "" : "text-muted"}>{o.n}</span>
          </Link>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {header}
      <p className="text-sm text-muted">
        {rows.length} plays. Pick anything below to narrow them down: picks in the same row mean any of them, picks in different rows mean all of them.
      </p>

      {views.length > 0 && (
        <div className="flex flex-wrap items-center gap-1" aria-label="Saved views">
          <span className="label mr-1">Views</span>
          <Link href={href("")} className={chip(!any)}>
            All plays
          </Link>
          {views.map((v) => (
            <span key={v.id} className={`${chip(activeView?.id === v.id)} pr-1`}>
              <Link href={href(v.query)}>{v.name}</Link>
              <DeleteView teamId={teamId} id={v.id} name={v.name} />
            </span>
          ))}
        </div>
      )}

      <form className="flex gap-2" action={`/t/${teamId}/plays`}>
        {FACETS.flatMap((f) => (filter[f] ?? []).map((v) => <input key={`${f}:${v}`} type="hidden" name={f} value={v} />))}
        <input className="input flex-1" name="q" defaultValue={q} placeholder="Find by name (e.g. 26 Power, Smash, Trips)" />
        <button className="btn btn-outline">Find</button>
      </form>

      <section className="card flex flex-col gap-3 p-3">
        {MAIN.filter((f) => shownFacets.includes(f)).map(group)}
        {more.length > 0 && (
          <details open={more.some((f) => filter[f]?.length)}>
            <summary className="cursor-pointer text-sm font-semibold">More filters: {more.map((f) => FACET_LABEL[f].toLowerCase()).join(", ")}</summary>
            <div className="mt-2 flex flex-col gap-3">{more.map(group)}</div>
          </details>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" aria-live="polite">
        <span className="font-semibold">
          {found.length} play{found.length === 1 ? "" : "s"}
          {any ? "" : " in all"}
        </span>
        {any && <span className="text-muted">{[filterSummary(filter, labelOf), q ? `“${q}”` : ""].filter(Boolean).join(" · ")}</span>}
        {any && (
          <Link href={href("")} className="text-muted underline">
            Clear
          </Link>
        )}
        {any && !activeView && <SaveView teamId={teamId} query={query} />}
        {found.length > 0 && (
          <Link href={`/t/${teamId}/plays/print${query ? `?${query}` : ""}`} className="font-semibold underline">
            Print {any ? "these" : "the playbook"}
          </Link>
        )}
        {found.length > 0 && (
          <Link href={`/t/${teamId}/plays/wristband${query ? `?${query}` : ""}`} className="font-semibold underline">
            Wristband
          </Link>
        )}
      </div>

      {found.length === 0 ? (
        <p className="card p-6 text-center text-muted">Nothing fits all of that. Take a pick off to see more.</p>
      ) : (
        <PlaybookGrid key={query} teamId={teamId} rows={grid} total={found.length} />
      )}
      {found.length > n && (
        <Link href={href([query, `n=${n + PAGE}`].filter(Boolean).join("&"))} className="btn btn-outline self-center" scroll={false}>
          Show more ({found.length - n} left)
        </Link>
      )}
    </div>
  );
}
