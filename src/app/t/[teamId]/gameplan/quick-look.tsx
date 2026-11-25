import Link from "next/link";
import type { Side } from "@/domain/matchups";
import { gamePlan, LOOK_KEY, tagsInUse } from "@/server/matchups";

/**
 * The game plan: tap what the opponent shows, see our plays built for it.
 * Uses only the tags the coach kept on each play ("Good against" on the play page).
 */
export async function QuickLook({ teamId, sp }: { teamId: string; sp: Record<string, string | string[] | undefined> }) {
  const side: Side = sp.side === "defense" ? "defense" : "offense";
  const want = (typeof sp.vs === "string" ? sp.vs.split(",") : []).filter((k) => LOOK_KEY.test(k)).slice(0, 12);
  const tags = await tagsInUse(teamId, side);
  const rows = await gamePlan(teamId, side, want);
  const href = (s: Side, vs: string[]) => `/t/${teamId}/gameplan?side=${s}${vs.length ? `&vs=${encodeURIComponent(vs.join(","))}` : ""}`;
  const toggle = (k: string) => (want.includes(k) ? want.filter((x) => x !== k) : [...want, k]);
  const groups = [...new Set(tags.map((t) => t.group))];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl">Quick look</h2>
        <p className="text-sm text-muted">Tap what a defense or offense shows. Reps lists your plays tagged as good against it, most matches first.</p>
      </div>
      <div className="flex overflow-hidden rounded border border-line text-sm" role="group" aria-label="Which side">
        {(
          [
            ["offense", "Our offense vs their defense"],
            ["defense", "Our defense vs their offense"],
          ] as const
        ).map(([s, label]) => (
          <Link key={s} href={href(s, [])} className={`flex-1 px-3 py-2 text-center ${side === s ? "bg-brand text-brand-ink" : ""}`} aria-current={side === s ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </div>

      {tags.length === 0 ? (
        <p className="card p-4 text-sm text-muted">
          No {side === "offense" ? "plays" : "defensive calls"} are tagged yet. Open a play from your{" "}
          <Link className="underline" href={`/t/${teamId}/plays`}>
            Playbook
          </Link>{" "}
          and keep the &quot;Good against&quot; tags Reps suggests, or add your own.
        </p>
      ) : (
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="font-semibold">{side === "offense" ? "They're showing" : "They're running"}</h2>
          {groups.map((g) => (
            <div key={g} className="flex flex-col gap-1">
              <span className="text-xs text-muted">{g}</span>
              <div className="flex flex-wrap gap-2">
                {tags
                  .filter((t) => t.group === g)
                  .map((t) => (
                    <Link
                      key={t.key}
                      href={href(side, toggle(t.key))}
                      className={`border px-3 py-1.5 text-sm ${want.includes(t.key) ? "border-brand bg-brand text-brand-ink" : "border-line"}`}
                      aria-pressed={want.includes(t.key)}
                    >
                      {t.label}
                    </Link>
                  ))}
              </div>
            </div>
          ))}
          {want.length > 0 && (
            <Link href={href(side, [])} className="self-start text-sm text-muted underline">
              Clear
            </Link>
          )}
        </section>
      )}

      {tags.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">
            {want.length ? `${rows.length} ${side === "offense" ? "play" : "call"}${rows.length === 1 ? "" : "s"} built for it` : `Every tagged ${side === "offense" ? "play" : "call"}`}
          </h2>
          {rows.length === 0 ? (
            <p className="card p-4 text-sm text-muted">Nothing tagged for that yet.</p>
          ) : (
            <ul className="flex flex-col">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line py-2">
                  <span className="min-w-0">
                    <Link href={`/t/${teamId}/plays/${r.id}`} className="font-semibold underline">
                      {r.name}
                    </Link>
                    {!r.approved && <span className="text-xs text-warn"> · not approved yet</span>}
                    <span className="block text-xs text-muted">Good against: {r.tags.join(", ")}</span>
                  </span>
                  {want.length > 0 && <span className="text-sm font-semibold">{r.hits.length === want.length ? "Beats all of it" : `${r.hits.length} of ${want.length}`}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
