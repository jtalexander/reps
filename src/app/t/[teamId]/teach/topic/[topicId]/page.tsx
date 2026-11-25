import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { gaps, lessons, questions, topics } from "@/db/teach-schema";
import { requireCoach } from "@/server/teams";
import { pageRefs } from "@/teach/page-images";
import { inPile, topicOverview } from "@/teach/service";
import { InstallToggle } from "../../install-button";
import { RewriteButton } from "./rewrite-button";
import { TopicApprove } from "./topic-approve";
import { TopicGaps } from "./topic-gaps";

export const metadata = { title: "Topic" };

/**
 * Everything for one topic on one page: the few questions RepWon needs
 * answered, then every draft lesson and question to skim and approve at once.
 */
export default async function TopicPage({ params, searchParams }: PageProps<"/t/[teamId]/teach/topic/[topicId]">) {
  const { teamId, topicId } = await params;
  const pile = (await searchParams).pile === "reserve" ? "reserve" : "core";
  await requireCoach(teamId);
  if (!/^[0-9a-f-]{36}$/i.test(topicId)) notFound();
  const [topic] = await db.select().from(topics).where(and(eq(topics.teamId, teamId), eq(topics.id, topicId)));
  if (!topic) notFound();

  const allGaps = await db.select().from(gaps).where(and(eq(gaps.teamId, teamId), eq(gaps.topicId, topicId))).orderBy(asc(gaps.sort));
  const asked = allGaps.filter((g) => g.status === "open" && g.priority === "key" && !g.dupOf);
  const optional = allGaps.filter((g) => g.status === "open" && g.priority === "optional" && !g.dupOf).length;
  // other topics' repeats of these questions: answering here answers those too
  const repeats = asked.length
    ? await db
        .select({ dupOf: gaps.dupOf, topic: topics.name })
        .from(gaps)
        .innerJoin(topics, eq(topics.id, gaps.topicId))
        .where(and(eq(gaps.teamId, teamId), inArray(gaps.dupOf, asked.map((g) => g.id))))
    : [];
  const lastAnswer = allGaps
    .filter((g) => g.status !== "open" && g.status !== "skipped" && g.answeredAt)
    .reduce<Date | null>((a, g) => (!a || g.answeredAt! > a ? g.answeredAt! : a), null);
  const answersSinceWrite = !!lastAnswer && (!topic.generatedAt || lastAnswer > topic.generatedAt);
  const answeredCount = allGaps.filter((g) => g.status === "answered" || g.status === "approved").length;

  // the core pile carries the lessons; the reserve pile is questions only
  const ls =
    pile === "core"
      ? await db
          .select()
          .from(lessons)
          .where(and(eq(lessons.teamId, teamId), eq(lessons.topicId, topicId), eq(lessons.status, "draft")))
          .orderBy(asc(lessons.sort))
      : [];
  const qs = await db
    .select()
    .from(questions)
    .where(and(eq(questions.teamId, teamId), eq(questions.topicId, topicId), eq(questions.status, "draft"), inPile(pile)))
    .orderBy(asc(questions.sort));
  const [reserve] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(questions)
    .where(and(eq(questions.teamId, teamId), eq(questions.topicId, topicId), eq(questions.status, "draft"), inPile("reserve")));
  const [live] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(questions)
    .where(and(eq(questions.teamId, teamId), eq(questions.topicId, topicId), eq(questions.status, "approved"), isNotNull(questions.approvedAt)));
  const [liveL] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lessons)
    .where(and(eq(lessons.teamId, teamId), eq(lessons.topicId, topicId), eq(lessons.status, "approved")));
  const refs = await pageRefs(teamId);

  // the next topic that still needs the coach
  const all = await topicOverview(teamId);
  const idx = all.findIndex((t) => t.id === topicId);
  const waiting = (t: (typeof all)[number]) => t.gapsOpen > 0 || t.lessonsDraft + t.questionsDraft > 0;
  const after = [...all.slice(idx + 1), ...all.slice(0, Math.max(0, idx))];
  // finish the install before anything else
  const next = after.find((t) => t.inInstall && waiting(t)) ?? after.find(waiting);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/t/${teamId}/teach`} className="text-sm text-muted underline">
          Teach
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h1 className="text-4xl">{topic.name}</h1>
          <span className="text-sm text-muted">
            Playbook p{topic.pageNos.join(", ")} · {(live?.n ?? 0) + (liveL?.n ?? 0)} live
          </span>
        </div>
        <div className="mt-2">
          <InstallToggle teamId={teamId} topicId={topicId} on={topic.inInstall} size="md" />
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">1. RepWon&apos;s questions for you</h2>
        <TopicGaps
          teamId={teamId}
          topicId={topicId}
          items={asked.map((g) => ({
            id: g.id,
            question: g.question,
            why: g.why,
            suggestion: g.suggestion,
            appliesTo: g.appliesTo,
            page: g.pageNo ? refs[g.pageNo] ?? null : null,
            alsoIn: [...new Set(repeats.filter((r) => r.dupOf === g.id).map((r) => r.topic))],
          }))}
          optional={optional}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">2. Fold your answers into the drafts</h2>
        <RewriteButton teamId={teamId} topicId={topicId} answersSinceWrite={answersSinceWrite} answered={answeredCount} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{pile === "reserve" ? "Reserve questions" : "3. Skim and approve"}</h2>
        {pile === "reserve" ? (
          <p className="text-sm text-muted">
            Extra questions RepWon wrote beyond the core set. Players never see them unless you approve them, so come back when players have the core down and want more.{" "}
            <Link className="underline" href={`/t/${teamId}/teach/topic/${topicId}`}>
              Back to the core set
            </Link>
          </p>
        ) : (
          (reserve?.n ?? 0) > 0 && (
            <p className="text-sm text-muted">
              Showing the lessons and the few must-know questions. {reserve!.n} more question{reserve!.n === 1 ? " is" : "s are"} in reserve; players won&apos;t see them unless you
              approve them.{" "}
              <Link className="underline" href={`/t/${teamId}/teach/topic/${topicId}?pile=reserve`}>
                Look through the reserve
              </Link>
            </p>
          )
        )}
        <TopicApprove
          pile={pile}
          teamId={teamId}
          topicId={topicId}
          topicName={topic.name}
          pages={refs}
          lessons={ls.map((l) => ({ type: "lesson" as const, id: l.id, topicId, lesson: { title: l.title, body: l.body, audience: l.audience, sourcePages: l.sourcePages } }))}
          questions={qs.map((q) => ({
            type: "question" as const,
            id: q.id,
            topicId,
            question: { prompt: q.prompt, format: q.format, data: q.data, explanation: q.explanation, audience: q.audience, sourcePages: q.sourcePages, image: q.image ?? null },
          }))}
          reserveLeft={pile === "core" ? (reserve?.n ?? 0) : 0}
          next={next ? { id: next.id, name: next.name } : null}
        />
        <Link href={`/t/${teamId}/teach/review?topic=${topicId}&show=approved`} className="self-start text-sm text-muted underline">
          See what&apos;s live for {topic.name}
        </Link>
      </section>
    </div>
  );
}
