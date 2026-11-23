import Link from "next/link";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { focusTopicIds } from "@/teach/service";
import { db } from "@/db";
import { gaps, topics } from "@/db/teach-schema";
import { requireCoach } from "@/server/teams";
import { pageRefs } from "@/teach/page-images";
import { InterviewQueue } from "./interview-queue";

export const metadata = { title: "Questions for the coach" };

export default async function Interview({ params, searchParams }: PageProps<"/t/[teamId]/teach/interview">) {
  const { teamId } = await params;
  const { topic, show, pile } = await searchParams;
  const optionalPile = pile === "optional";
  await requireCoach(teamId);
  const topicId = typeof topic === "string" && /^[0-9a-f-]{36}$/i.test(topic) ? topic : null;
  const statuses = show === "done" ? (["answered", "approved", "skipped"] as const) : (["open"] as const);
  const where = [eq(gaps.teamId, teamId), inArray(gaps.status, [...statuses])];
  if (topicId) where.push(eq(gaps.topicId, topicId));
  const focus = topicId ? null : await focusTopicIds(teamId);
  if (focus) where.push(inArray(gaps.topicId, [...focus]));
  // open questions: the main ones by default, the optional pile on request; repeats are answered through the original
  if (show !== "done") where.push(eq(gaps.priority, optionalPile ? "optional" : "key"), isNull(gaps.dupOf));
  const rows = await db
    .select({ gap: gaps, topicName: topics.name, topicSort: topics.sort })
    .from(gaps)
    .innerJoin(topics, eq(topics.id, gaps.topicId))
    .where(and(...where))
    .orderBy(asc(topics.sort), asc(gaps.sort));
  const refs = await pageRefs(teamId);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/t/${teamId}/teach`} className="text-sm text-muted underline">
            Teach
          </Link>
          <h1 className="text-4xl">{show === "done" ? "Answered questions" : optionalPile ? "Optional questions" : "Questions for you"}</h1>
        </div>
        <Link href={`/t/${teamId}/teach/interview?${topicId ? `topic=${topicId}&` : ""}show=${show === "done" ? "open" : "done"}`} className="text-sm underline">
          {show === "done" ? "Show open questions" : "Show answered and skipped"}
        </Link>
      </div>
      <p className="text-sm text-muted">
        {optionalPile
          ? "Nice-to-know questions. Answer any you like; the rest are simply left out."
          : "These are things a player needs that your playbook doesn't say. Your answers become part of the playbook for lessons and questions. Skipped questions are simply left out."}
      </p>
      <InterviewQueue
        teamId={teamId}
        doneMode={show === "done"}
        items={rows.map((r) => ({
          id: r.gap.id,
          topic: r.topicName,
          question: r.gap.question,
          why: r.gap.why,
          appliesTo: r.gap.appliesTo,
          suggestion: r.gap.suggestion,
          status: r.gap.status,
          answer: r.gap.answer,
          page: r.gap.pageNo ? refs[r.gap.pageNo] ?? null : null,
        }))}
      />
    </div>
  );
}
