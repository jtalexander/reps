import Link from "next/link";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { studySets } from "@/db/schema";
import { lessonProgress, questionSrs, topics } from "@/db/teach-schema";
import { inGroups, POSITION_GROUPS } from "@/domain/positions";
import { approvedFor, mastery } from "@/teach/service";
import { audienceOf, AUDIENCE_LABEL } from "@/teach/types";

/** The player's home for Teach: topics to learn (with mastery), practice, ask, pages. */
export async function TeachSection({ teamId, playerId, position }: { teamId: string; playerId: string; position: string }) {
  const group = audienceOf(position, POSITION_GROUPS);
  const { lessons, questions } = await approvedFor(teamId, group);
  if (lessons.length === 0 && questions.length === 0) {
    return <p className="card p-4 text-sm text-muted">Your coach hasn&apos;t approved anything to learn yet. Check back soon.</p>;
  }
  const topicIds = [...new Set([...lessons.map((l) => l.topicId), ...questions.map((q) => q.topicId)])];
  const ts = await db.select().from(topics).where(and(eq(topics.teamId, teamId), inArray(topics.id, topicIds))).orderBy(asc(topics.sort));
  // this week's install first
  ts.sort((a, b) => Number(b.inInstall) - Number(a.inInstall));
  const done = new Set(
    (await db.select({ id: lessonProgress.lessonId }).from(lessonProgress).where(eq(lessonProgress.playerId, playerId))).map((r) => r.id),
  );
  const m = new Map((await mastery(teamId)).filter((r) => r.playerId === playerId).map((r) => [r.topicId, r]));
  const [due] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(questionSrs)
    .where(and(eq(questionSrs.playerId, playerId), lte(questionSrs.dueAt, new Date())));

  // study sets the coach assigned to this player's position
  const sets = (
    await db
      .select()
      .from(studySets)
      .where(and(eq(studySets.teamId, teamId), sql`cardinality(${studySets.topicIds}) > 0`))
      .orderBy(desc(studySets.createdAt))
  ).filter((s) => inGroups(position, s.positions));
  const names = new Map(ts.map((t) => [t.id, t.name]));
  const setScore = (ids: string[]) => {
    const rows = ids.flatMap((id) => (m.has(id) ? [m.get(id)!] : []));
    return rows.length ? Math.round((rows.reduce((a, r) => a + r.score, 0) / ids.length) * 100) : null;
  };

  return (
    <section className="flex flex-col gap-3">
      {sets.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold">Assigned</h2>
          {sets.map((s) => {
            const pct = setScore(s.topicIds);
            return (
              <Link key={s.id} href={`/study/practice?set=${s.id}`} className="card flex items-center justify-between gap-3 border-brand p-3">
                <div className="min-w-0">
                  <div className="font-semibold">{s.name}</div>
                  <div className="truncate text-xs text-muted">
                    {s.dueDate ? `Due ${new Date(s.dueDate + "T12:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ` : ""}
                    {s.topicIds.map((id) => names.get(id)).filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span className="btn btn-accent shrink-0 px-3">{pct === null ? "Start" : `${pct}%`}</span>
              </Link>
            );
          })}
        </div>
      )}
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Learn your offense</h2>
        <span className="text-xs text-muted">{AUDIENCE_LABEL[group]}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {ts.map((t) => {
          const ls = lessons.filter((l) => l.topicId === t.id);
          const read = ls.length > 0 && ls.every((l) => done.has(l.id));
          const mm = m.get(t.id);
          const pct = mm ? Math.round(mm.score * 100) : null;
          return (
            <li key={t.id}>
              <Link href={`/study/learn/${t.id}`} className="card flex items-center justify-between gap-3 p-3 hover:border-ink">
                <div>
                  <div className="font-semibold">
                    {t.name}
                    {t.inInstall && <span className="ml-2 bg-brand px-1.5 py-0.5 align-middle font-label text-[10px] font-bold tracking-widest text-brand-ink uppercase">Install</span>}
                  </div>
                  <div className="text-xs text-muted">{read ? "Learned" : ls.length ? "Start here" : "Questions only"}</div>
                </div>
                {pct !== null ? (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${pct >= 85 ? "bg-ok-bg text-ok" : pct >= 60 ? "bg-warn-bg text-warn" : "bg-bad-bg text-bad"}`}>{pct}%</span>
                ) : (
                  <span className="text-xs text-muted">new</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Link href="/study/practice" className="btn btn-primary min-h-12">
          Practice{due?.n ? ` (${due.n} due)` : ""}
        </Link>
        <Link href="/study/ask" className="btn btn-accent min-h-12">
          Ask the playbook
        </Link>
        <Link href="/study/pages" className="btn btn-ghost col-span-2 min-h-11">
          My playbook: plays and pages
        </Link>
      </div>
    </section>
  );
}
