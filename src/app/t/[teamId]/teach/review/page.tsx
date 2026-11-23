import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { lessons, questions, topics } from "@/db/teach-schema";
import { requireCoach } from "@/server/teams";
import { pageRefs } from "@/teach/page-images";
import { focusTopicIds, inPile } from "@/teach/service";
import { ReviewQueue } from "./review-queue";

export const metadata = { title: "Approve lessons and questions" };

export default async function Review({ params, searchParams }: PageProps<"/t/[teamId]/teach/review">) {
  const { teamId } = await params;
  const { topic, show, more } = await searchParams;
  await requireCoach(teamId);
  const topicId = typeof topic === "string" && /^[0-9a-f-]{36}$/i.test(topic) ? topic : null;
  const status = show === "approved" ? "approved" : "draft";
  const ts = await db.select().from(topics).where(and(eq(topics.teamId, teamId), eq(topics.archived, false))).orderBy(asc(topics.sort));
  const lw = [eq(lessons.teamId, teamId), eq(lessons.status, status)];
  // reserve drafts aren't waiting on the coach; they're reviewed from their topic's reserve pile
  const qw = [eq(questions.teamId, teamId), eq(questions.status, status), ...(status === "draft" ? [inPile("core")] : [])];
  if (topicId) {
    lw.push(eq(lessons.topicId, topicId));
    qw.push(eq(questions.topicId, topicId));
  }
  const focus = topicId ? null : await focusTopicIds(teamId);
  if (focus) {
    lw.push(inArray(lessons.topicId, [...focus]));
    qw.push(inArray(questions.topicId, [...focus]));
  }
  const ls = await db.select().from(lessons).where(and(...lw)).orderBy(asc(lessons.sort));
  const qs = await db.select().from(questions).where(and(...qw)).orderBy(asc(questions.sort));
  const order = new Map(ts.map((t, i) => [t.id, i]));
  const refs = await pageRefs(teamId);
  const items = [
    ...ls.map((l) => ({ type: "lesson" as const, id: l.id, topicId: l.topicId, lesson: { title: l.title, body: l.body, audience: l.audience, sourcePages: l.sourcePages } })),
    ...qs.map((q) => ({
      type: "question" as const,
      id: q.id,
      topicId: q.topicId,
      question: { prompt: q.prompt, format: q.format, data: q.data, explanation: q.explanation, audience: q.audience, sourcePages: q.sourcePages, image: q.image ?? null },
    })),
  ].sort((a, b) => (order.get(a.topicId) ?? 0) - (order.get(b.topicId) ?? 0) || (a.type === b.type ? 0 : a.type === "lesson" ? -1 : 1));
  // A whole playbook can have hundreds of drafts; show them in pages of 30.
  const PAGE = 30;
  const limit = PAGE * Math.max(1, Number(typeof more === "string" ? more : 1) || 1);
  const shown = items.slice(0, limit);
  const perTopic = new Map<string, number>();
  for (const it of items) perTopic.set(it.topicId, (perTopic.get(it.topicId) ?? 0) + 1);
  const qs0 = `${topicId ? `topic=${topicId}&` : ""}${show ? `show=${show}&` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/t/${teamId}/teach`} className="text-sm text-muted underline">
            Teach
          </Link>
          <h1 className="text-4xl">{status === "approved" ? "Live lessons and questions" : "Approve lessons and questions"}</h1>
        </div>
        <Link href={`/t/${teamId}/teach/review?${topicId ? `topic=${topicId}&` : ""}show=${status === "approved" ? "draft" : "approved"}`} className="text-sm underline">
          {status === "approved" ? "Show drafts" : "Show what's live"}
        </Link>
      </div>
      <div className="flex flex-wrap gap-1 text-sm">
        <Link href={`/t/${teamId}/teach/review${show ? `?show=${show}` : ""}`} className={`shrink-0 px-3 py-1.5 font-label text-xs font-bold tracking-widest uppercase ${!topicId ? "bg-brand text-brand-ink" : "border border-line bg-card"}`}>
          All topics
        </Link>
        {ts.filter((t) => topicId === t.id || (perTopic.get(t.id) ?? 0) > 0 || !!topicId).map((t) => (
          <Link
            key={t.id}
            href={`/t/${teamId}/teach/review?topic=${t.id}${show ? `&show=${show}` : ""}`}
            className={`shrink-0 px-3 py-1.5 font-label text-xs font-bold tracking-widest uppercase ${topicId === t.id ? "bg-brand text-brand-ink" : "border border-line bg-card"}`}
          >
            {t.name}
            {!topicId && perTopic.get(t.id) ? <span className="ml-1 opacity-70">{perTopic.get(t.id)}</span> : null}
          </Link>
        ))}
      </div>
      <ReviewQueue teamId={teamId} items={shown} topics={Object.fromEntries(ts.map((t) => [t.id, t.name]))} pages={refs} live={status === "approved"} />
      {items.length > shown.length && (
        <Link href={`/t/${teamId}/teach/review?${qs0}more=${limit / PAGE + 1}`} className="btn btn-ghost">
          Show more ({items.length - shown.length} left)
        </Link>
      )}
    </div>
  );
}
