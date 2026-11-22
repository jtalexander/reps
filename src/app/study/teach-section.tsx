import Link from "next/link";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { lessonProgress, questionSrs, topics } from "@/db/teach-schema";
import { POSITION_GROUPS } from "@/domain/positions";
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
  const done = new Set(
    (await db.select({ id: lessonProgress.lessonId }).from(lessonProgress).where(eq(lessonProgress.playerId, playerId))).map((r) => r.id),
  );
  const m = new Map((await mastery(teamId)).filter((r) => r.playerId === playerId).map((r) => [r.topicId, r]));
  const [due] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(questionSrs)
    .where(and(eq(questionSrs.playerId, playerId), lte(questionSrs.dueAt, new Date())));

  return (
    <section className="flex flex-col gap-3">
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
                  <div className="font-semibold">{t.name}</div>
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
          Read the playbook pages
        </Link>
      </div>
    </section>
  );
}
