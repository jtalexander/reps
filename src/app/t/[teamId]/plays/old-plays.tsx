import Link from "next/link";
import { readiness } from "@/domain/readiness";
import { title } from "@/domain/terms";
import { listPlays } from "@/server/plays";
import { completeness } from "@/server/results";
import { requireCoach } from "@/server/teams";

const FILTERS = [
  ["todo", "Needs input"],
  ["ready", "Ready to approve"],
  ["approved", "Approved"],
  ["all", "All"],
] as const;

/** Play cards from the old play reader (before Teach). Kept for teams that have some. */
export async function OldPlays({ teamId, sp }: { teamId: string; sp: Record<string, string | string[] | undefined> }) {
  const { team } = await requireCoach(teamId);
  const filter = (typeof sp.f === "string" ? sp.f : "todo") as (typeof FILTERS)[number][0];
  const upload = typeof sp.upload === "string" ? sp.upload : null;
  const all = (await listPlays(teamId)).filter((p) => !upload || p.uploadId === upload);
  const stats = await completeness(teamId);
  const shown = all.filter((p) =>
    filter === "all" ? true : filter === "approved" ? p.status === "approved" : filter === "ready" ? p.status === "draft" && p.data : p.status === "needs_coach_input" || !p.data,
  );
  const counts = {
    todo: all.filter((p) => p.status === "needs_coach_input" || !p.data).length,
    ready: all.filter((p) => p.status === "draft" && p.data).length,
    approved: all.filter((p) => p.status === "approved").length,
    all: all.length,
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-4xl">Older play cards</h1>
          <p className="text-sm text-muted">
            {stats.qbReady} of {stats.qbPlays} QB plays QB-ready · {stats.approved} of {stats.total} plays approved
          </p>
        </div>
        <Link href={`/t/${teamId}/uploads`} className="btn btn-ghost">
          Upload PDF
        </Link>
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {FILTERS.map(([key, label]) => (
          <Link
            key={key}
            href={`/t/${teamId}/plays?view=old&f=${key}${upload ? `&upload=${upload}` : ""}`}
            className={`shrink-0 px-3 py-1.5 font-label text-xs font-bold tracking-widest uppercase ${filter === key ? "bg-brand text-brand-ink" : "border border-line bg-card"}`}
          >
            {label} · {counts[key]}
          </Link>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="card p-6 text-center text-muted">
          {all.length === 0 ? (
            <>
              No drawn plays here. Your playbook&apos;s content is in{" "}
              <Link className="font-semibold text-ink underline" href={`/t/${teamId}/teach`}>
                Teach
              </Link>
              .
            </>
          ) : (
            "Nothing here."
          )}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {shown.map((p) => {
            const r = p.data ? readiness(p.data, team.level) : null;
            return (
              <li key={p.id}>
                <Link href={`/t/${teamId}/plays/${p.id}`} className="card flex gap-3 p-2 hover:border-ink">
                  {p.cropKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/media/${p.cropKey.split("/").map(encodeURIComponent).join("/")}`} alt="" className="h-16 w-24 shrink-0 rounded object-cover object-top" loading="lazy" />
                  ) : (
                    <div className="h-16 w-24 shrink-0 rounded bg-line" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.name === "unknown" ? "Unnamed play" : p.name}</div>
                    <div className="text-xs text-muted">
                      {p.playType !== "unknown" ? title(p.playType) : "Type ?"}
                      {p.sourcePage ? ` · page ${p.sourcePage}` : ""}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[11px] font-semibold">
                      {p.status === "approved" ? (
                        <span className="rounded bg-ok-bg px-1.5 text-ok">Approved{p.qbReady ? " · QB-ready" : ""}</span>
                      ) : !p.data ? (
                        <span className="rounded bg-warn-bg px-1.5 text-warn">{p.extraction === "failed" ? "Couldn't read" : p.extraction === "running" ? "Reading…" : "Not read yet"}</span>
                      ) : r && r.missing.length ? (
                        <span className="rounded bg-warn-bg px-1.5 text-warn">{r.missing.length} to finish</span>
                      ) : (
                        <span className="rounded bg-suggest-bg px-1.5 text-suggest">Ready to approve</span>
                      )}
                      {r && r.lowConfidence.length > 0 && p.status !== "approved" && <span className="rounded bg-bad-bg px-1.5 text-bad">{r.lowConfidence.length} unsure</span>}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
