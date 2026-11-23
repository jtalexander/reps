import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { plays } from "@/db/schema";
import { PageView } from "@/components/page-view";
import { requireCoach } from "@/server/teams";
import { matches, playbookDrawings, type Drawing } from "@/teach/drawings";
import { pageRefs } from "@/teach/page-images";
import { OldPlays } from "./old-plays";

export const metadata = { title: "Playbook" };

const chip = (on: boolean) => `shrink-0 px-3 py-1.5 font-label text-xs font-bold tracking-widest uppercase ${on ? "bg-brand text-brand-ink" : "border border-line bg-card"}`;

/**
 * Every drawing Reps found in the playbook (formations, plays, blocking vs
 * fronts), by topic, cropped from the coach's own pages.
 */
export default async function Playbook({ params, searchParams }: PageProps<"/t/[teamId]/plays">) {
  const { teamId } = await params;
  const sp = await searchParams;
  await requireCoach(teamId);
  if (sp.view === "old") return <OldPlays teamId={teamId} sp={sp} />;

  const all = await playbookDrawings(teamId);
  const [old] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false)));
  const refs = await pageRefs(teamId);
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";

  // topics in playbook order, the install first
  const topics = new Map<string, { id: string; name: string; inInstall: boolean; n: number }>();
  for (const d of all) {
    const id = d.topicId ?? "none";
    const t = topics.get(id) ?? { id, name: d.topicName ?? "No topic", inInstall: d.inInstall, n: 0 };
    t.n++;
    topics.set(id, t);
  }
  const list = [...topics.values()].sort((a, b) => Number(b.inInstall) - Number(a.inInstall));
  const install = list.filter((t) => t.inInstall);
  const pick = typeof sp.topic === "string" ? sp.topic : install.length ? "install" : (list[0]?.id ?? "");
  const shown: Drawing[] = q
    ? all.filter((d) => matches(d, q)).slice(0, 60)
    : pick === "install"
      ? all.filter((d) => d.inInstall)
      : all.filter((d) => (d.topicId ?? "none") === pick);
  const pages = new Set(all.map((d) => d.pageNo)).size;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-4xl">Playbook</h1>
        <p className="text-sm text-muted">
          {all.length
            ? `${all.length} drawings Reps found on ${pages} pages of your playbook. Tap one to see it bigger with what Reps read from its page.`
            : "Reps hasn't read any pages yet."}
        </p>
      </div>

      {all.length === 0 ? (
        <p className="card p-6 text-center text-muted">
          Upload your playbook, then tap <b>Read the whole playbook</b> on{" "}
          <Link className="font-semibold text-ink underline" href={`/t/${teamId}/teach`}>
            Teach
          </Link>
          . Every formation and play it finds shows up here.
        </p>
      ) : (
        <>
          <form className="flex gap-2" action={`/t/${teamId}/plays`}>
            <input className="input flex-1" name="q" defaultValue={q} placeholder="Find a play or formation (e.g. Smash, Trips Right, Veer vs 4-3)" />
            <button className="btn btn-outline">Find</button>
          </form>
          {!q && (
            <div className="flex gap-1 overflow-x-auto pb-1">
              {install.length > 0 && (
                <Link href={`/t/${teamId}/plays?topic=install`} className={chip(pick === "install")}>
                  Install · {all.filter((d) => d.inInstall).length}
                </Link>
              )}
              {list.map((t) => (
                <Link key={t.id} href={`/t/${teamId}/plays?topic=${t.id}`} className={chip(pick === t.id)}>
                  {t.name} · {t.n}
                </Link>
              ))}
            </div>
          )}
          {q && (
            <p className="text-sm text-muted">
              {shown.length ? `${shown.length}${shown.length === 60 ? "+" : ""} match${shown.length === 1 ? "" : "es"} for “${q}”.` : `Nothing matches “${q}”.`}{" "}
              <Link className="underline" href={`/t/${teamId}/plays`}>
                Clear
              </Link>
            </p>
          )}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((d) => {
              const ref = refs[d.pageNo];
              return (
                <li key={d.key}>
                  <Link href={`/t/${teamId}/plays/page/${d.pageNo}?d=${encodeURIComponent(d.key)}`} className="card flex h-full flex-col gap-2 p-2 hover:border-brand">
                    {ref ? (
                      <PageView url={ref.url} width={ref.width} height={ref.height} crop={d.box} className="max-h-56 w-full border border-line" />
                    ) : (
                      <div className="h-32 bg-line" />
                    )}
                    <div className="px-1">
                      <div className="font-semibold">{d.label}</div>
                      <div className="text-xs text-muted">
                        {d.topicName ?? "No topic"} · page {d.pageNo}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {(old?.n ?? 0) > 0 && (
        <Link href={`/t/${teamId}/plays?view=old`} className="self-start text-sm text-muted underline">
          Older play cards from before Teach ({old!.n})
        </Link>
      )}
    </div>
  );
}
