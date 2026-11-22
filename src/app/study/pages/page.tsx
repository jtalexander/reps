import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { topics } from "@/db/teach-schema";
import { POSITION_GROUPS } from "@/domain/positions";
import { requirePlayer } from "@/server/player-session";
import { PageView } from "@/components/page-view";
import { pageRefs } from "@/teach/page-images";
import { approvedFor } from "@/teach/service";
import { audienceOf } from "@/teach/types";

export const metadata = { title: "My playbook pages" };

/** The coach's own pages, grouped by topic, for topics with approved material for this player. */
export default async function Pages({ searchParams }: PageProps<"/study/pages">) {
  const { topic } = await searchParams;
  const me = await requirePlayer();
  const group = audienceOf(me.position, POSITION_GROUPS);
  const { lessons, questions } = await approvedFor(me.team.id, group);
  const live = new Set([...lessons.map((l) => l.topicId), ...questions.map((q) => q.topicId)]);
  const ts = (await db.select().from(topics).where(and(eq(topics.teamId, me.team.id), eq(topics.archived, false))).orderBy(asc(topics.sort))).filter((t) => live.has(t.id));
  const refs = await pageRefs(me.team.id);
  const current = ts.find((t) => t.id === topic) ?? ts[0];
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-5">
      <Link href="/study" className="text-sm text-muted underline">
        Back
      </Link>
      <h1 className="text-4xl">Playbook pages</h1>
      {ts.length === 0 ? (
        <p className="card p-4 text-sm text-muted">Nothing approved yet.</p>
      ) : (
        <>
          <div className="flex gap-1 overflow-x-auto text-sm">
            {ts.map((t) => (
              <Link key={t.id} href={`/study/pages?topic=${t.id}`} className={`shrink-0 px-3 py-1.5 font-label text-xs font-bold tracking-widest uppercase ${current?.id === t.id ? "bg-brand text-brand-ink" : "border border-line bg-card"}`}>
                {t.name}
              </Link>
            ))}
          </div>
          {current?.pageNos.map((p) =>
            refs[p] ? (
              <div key={p}>
                <div className="mb-1 text-xs text-muted">Page {p}</div>
                <PageView url={refs[p].url} width={refs[p].width} height={refs[p].height} className="w-full rounded border border-line" />
              </div>
            ) : null,
          )}
        </>
      )}
    </main>
  );
}
