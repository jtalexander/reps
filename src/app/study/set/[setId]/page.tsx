import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { studySets } from "@/db/schema";
import { lessonProgress, topics } from "@/db/teach-schema";
import { inGroups, POSITION_GROUPS } from "@/domain/positions";
import { requirePlayer } from "@/server/player-session";
import { approvedFor, mastery } from "@/teach/service";
import { audienceOf } from "@/teach/types";

export const metadata = { title: "Study set" };

/** One assigned study set: its topics to learn one at a time, or practice the whole set. */
export default async function StudySet({ params }: PageProps<"/study/set/[setId]">) {
  const { setId } = await params;
  const me = await requirePlayer();
  if (!/^[0-9a-f-]{36}$/i.test(setId)) notFound();
  const [set] = await db.select().from(studySets).where(and(eq(studySets.teamId, me.team.id), eq(studySets.id, setId)));
  if (!set || set.topicIds.length === 0 || !inGroups(me.position, set.positions)) notFound();
  const group = audienceOf(me.position, POSITION_GROUPS);
  const { lessons, questions } = await approvedFor(me.team.id, group);
  const ts = await db
    .select()
    .from(topics)
    .where(and(eq(topics.teamId, me.team.id), inArray(topics.id, set.topicIds)))
    .orderBy(asc(topics.sort));
  const done = new Set(
    (await db.select({ id: lessonProgress.lessonId }).from(lessonProgress).where(eq(lessonProgress.playerId, me.player.id))).map((r) => r.id),
  );
  const m = new Map((await mastery(me.team.id)).filter((r) => r.playerId === me.player.id).map((r) => [r.topicId, r]));
  const total = ts.reduce((n, t) => n + questions.filter((q) => q.topicId === t.id).length, 0);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-5">
      <Link href="/study" className="text-sm text-muted underline">
        Back
      </Link>
      <div>
        <div className="eyebrow">Study set</div>
        <h1 className="text-4xl">{set.name}</h1>
        <p className="text-sm text-muted">
          {set.dueDate ? `Due ${new Date(set.dueDate + "T12:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ` : ""}
          {ts.length} topic{ts.length === 1 ? "" : "s"} · {total} question{total === 1 ? "" : "s"} for you
        </p>
      </div>
      <Link href={`/study/practice?set=${set.id}`} className="btn btn-primary min-h-12">
        Practice the whole set
      </Link>
      <p className="text-sm text-muted">Or one topic at a time:</p>
      <ul className="flex flex-col gap-2">
        {ts.map((t) => {
          const ls = lessons.filter((l) => l.topicId === t.id);
          const n = questions.filter((q) => q.topicId === t.id).length;
          const read = ls.length > 0 && ls.every((l) => done.has(l.id));
          const mm = m.get(t.id);
          const pct = mm ? Math.round(mm.score * 100) : null;
          return (
            <li key={t.id}>
              <Link href={`/study/learn/${t.id}`} className="card flex items-center justify-between gap-3 p-3 hover:border-ink">
                <div>
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-muted">
                    {read ? "Learned" : ls.length ? "Start here" : "Questions only"} · {n} question{n === 1 ? "" : "s"}
                  </div>
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
    </main>
  );
}
