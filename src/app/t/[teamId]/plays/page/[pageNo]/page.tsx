import Link from "next/link";
import { notFound } from "next/navigation";
import { PageView } from "@/components/page-view";
import { requireCoach } from "@/server/teams";
import { playbookPages } from "@/teach/drawings";
import { pageRefs } from "@/teach/page-images";

export const metadata = { title: "Playbook page" };

/** One playbook page: the chosen drawing big, the page's other drawings, and what Reps read from it. */
export default async function PlaybookPage({ params, searchParams }: PageProps<"/t/[teamId]/plays/page/[pageNo]">) {
  const { teamId, pageNo: raw } = await params;
  const { d, full } = await searchParams;
  await requireCoach(teamId);
  const pageNo = Number(raw);
  if (!Number.isInteger(pageNo) || pageNo < 1) notFound();
  const pages = await playbookPages(teamId);
  const i = pages.findIndex((p) => p.pageNo === pageNo);
  const page = pages[i];
  const ref = (await pageRefs(teamId))[pageNo];
  if (!page || !ref) notFound();
  const chosen = page.drawings.find((x) => x.key === d) ?? page.drawings[0] ?? null;
  const showFull = full === "1" || !chosen;
  const prev = pages[i - 1];
  const next = pages[i + 1];
  const topic = page.drawings[0];
  const href = (p: number, key?: string) => `/t/${teamId}/plays/page/${p}${key ? `?d=${encodeURIComponent(key)}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/t/${teamId}/plays${topic?.topicId ? `?topic=${topic.topicId}` : ""}`} className="text-sm text-muted underline">
          Playbook
        </Link>
        <h1 className="text-4xl">{chosen?.label ?? `Page ${pageNo}`}</h1>
        <p className="text-sm text-muted">
          Page {pageNo}
          {page.section ? ` · ${page.section}` : ""}
          {topic?.topicId ? (
            <>
              {" · "}
              <Link className="underline" href={`/t/${teamId}/teach/topic/${topic.topicId}`}>
                {topic.topicName} in Teach
              </Link>
            </>
          ) : null}
        </p>
      </div>

      <PageView url={ref.url} width={ref.width} height={ref.height} crop={showFull ? null : chosen?.box} className="w-full border border-line" />
      <div className="flex flex-wrap gap-3 text-sm">
        {chosen && (
          <Link className="underline" href={showFull ? href(pageNo, chosen.key) : `${href(pageNo, chosen.key)}&full=1`}>
            {showFull ? "Show just this drawing" : "Show the whole page"}
          </Link>
        )}
        {prev && (
          <Link className="text-muted underline" href={href(prev.pageNo)}>
            ← Page {prev.pageNo}
          </Link>
        )}
        {next && (
          <Link className="text-muted underline" href={href(next.pageNo)}>
            Page {next.pageNo} →
          </Link>
        )}
      </div>

      {page.drawings.length > 1 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-2xl">Also on this page</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {page.drawings.map((x) => (
              <li key={x.key}>
                <Link href={href(pageNo, x.key)} className={`card flex flex-col gap-1 p-1.5 hover:border-brand ${x.key === chosen?.key ? "border-brand" : ""}`}>
                  <PageView url={ref.url} width={ref.width} height={ref.height} crop={x.box} className="max-h-28 w-full" />
                  <span className="truncate px-1 text-xs font-semibold">{x.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(page.summary || page.facts.length > 0) && (
        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-2xl">What Reps read from this page</h2>
          {page.summary && <p className="text-sm">{page.summary}</p>}
          <ul className="flex flex-col gap-1.5 text-sm">
            {page.facts.map((f) => (
              <li key={f.id} className="flex gap-2">
                <span className="shrink-0 font-label text-[11px] font-bold tracking-widest text-muted uppercase">{f.appliesTo.join(", ") || "All"}</span>
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">This is Reps&apos; reading of your page, used to write the lessons. Fix anything wrong in the topic&apos;s lessons before you approve them.</p>
        </section>
      )}
    </div>
  );
}
