import Link from "next/link";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { teachPages } from "@/db/teach-schema";
import { hasApiKey } from "@/ingest/extract";
import { requireCoach } from "@/server/teams";
import { lastRun, runProgress } from "@/teach/playbook-run";
import { openFlags, topicOverview } from "@/teach/service";
import { TriageButton } from "./triage-button";
import { DecodePanel } from "./decode-panel";
import { PlaybookRunCard } from "./playbook-run-card";
import { TopicRow } from "./topic-row";

export const metadata = { title: "Teach" };

export default async function TeachHub({ params, searchParams }: PageProps<"/t/[teamId]/teach">) {
  const { teamId } = await params;
  const sp = await searchParams;
  const preUpload = typeof sp.upload === "string" ? sp.upload : null;
  const prePages = typeof sp.pages === "string" ? sp.pages : "";
  await requireCoach(teamId);
  // Reading splits any page it needs, so partly split uploads count too.
  const ups = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.teamId, teamId), inArray(uploads.status, ["rendering", "ready"]), sql`${uploads.pageCount} > 0`))
    .orderBy(desc(uploads.createdAt));
  const pageStats = await db
    .select({ status: teachPages.status, n: sql<number>`count(*)::int` })
    .from(teachPages)
    .where(eq(teachPages.teamId, teamId))
    .groupBy(teachPages.status);
  const failed = await db
    .select({ id: teachPages.id, pageNo: teachPages.pageNo, error: teachPages.error })
    .from(teachPages)
    .where(and(eq(teachPages.teamId, teamId), eq(teachPages.status, "failed")))
    .orderBy(asc(teachPages.pageNo));
  const topics = await topicOverview(teamId);
  const totals = topics.reduce(
    (a, t) => ({ gaps: a.gaps + t.gapsOpen, drafts: a.drafts + t.lessonsDraft + t.questionsDraft, live: a.live + t.lessonsApproved + t.questionsApproved }),
    { gaps: 0, drafts: 0, live: 0 },
  );
  const decoded = pageStats.find((s) => s.status === "decoded")?.n ?? 0;
  const flagged = new Set((await openFlags(teamId)).map((f) => f.question.id)).size;
  const optional = topics.reduce((a, t) => a + t.gapsOptional, 0);
  const run = await runProgress(teamId);
  const last = run ? null : await lastRun(teamId);
  const lead = ups[0];
  const leadRead = lead
    ? (
        await db
          .select({ n: sql<number>`count(*)::int` })
          .from(teachPages)
          .where(and(eq(teachPages.teamId, teamId), eq(teachPages.uploadId, lead.id), inArray(teachPages.status, ["decoded", "not_playbook"])))
      )[0]!.n
    : 0;
  const pagesLeft = lead ? Math.max(0, lead.pageCount - leadRead) : 0;
  const topicsLeft = topics.filter((t) => !t.gapsFoundAt || !t.generatedAt).length;
  const firstTodo = topics.find((t) => t.gapsOpen > 0 || t.lessonsDraft + t.questionsDraft > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-4xl">Teach</h1>
        <p className="mt-1 text-sm text-muted">
          Reps reads your playbook, asks you about what isn&apos;t written down, then writes lessons and questions for each position. Nothing reaches players until you approve it.
        </p>
      </div>

      {!hasApiKey() && <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">The server has no Anthropic API key, so Reps can&apos;t read pages yet.</p>}

      {flagged > 0 && (
        <Link href={`/t/${teamId}/teach/flags`} className="rounded-lg bg-warn-bg px-3 py-2 text-sm font-semibold text-warn">
          Players flagged {flagged} question{flagged === 1 ? "" : "s"} as wrong. Take a look →
        </Link>
      )}

      <PlaybookRunCard
        teamId={teamId}
        uploads={ups.map((u) => ({ id: u.id, filename: u.filename, pageCount: u.pageCount }))}
        progress={run && { stage: run.stage, pages: run.pages, topics: run.topics, running: run.running, stalled: run.stalled }}
        pagesLeft={pagesLeft}
        topicsLeft={topicsLeft}
        last={last}
      />

      {firstTodo && (
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <div className="flex-1">
            <div className="font-semibold">Go topic by topic</div>
            <p className="text-sm text-muted">
              Each topic is one page: answer Reps&apos; few questions, skim the lessons and quiz questions, approve them all with one tap.
            </p>
          </div>
          <Link href={`/t/${teamId}/teach/topic/${firstTodo.id}`} className="btn btn-primary">
            Start with {firstTodo.name} →
          </Link>
        </div>
      )}

      <ol className="grid gap-3 sm:grid-cols-3">
        <Step n={1} title="Read pages" note={`${decoded} pages read`} />
        <Link href={`/t/${teamId}/teach/interview`} className="card p-3 hover:border-ink">
          <div className="text-xs text-muted">Step 2</div>
          <div className="font-semibold">Answer Reps&apos; questions</div>
          <div className={`text-sm ${totals.gaps ? "font-semibold text-warn" : "text-muted"}`}>
            {totals.gaps} waiting{optional ? <span className="font-normal text-muted"> · {optional} optional</span> : null}
          </div>
        </Link>
        <Link href={`/t/${teamId}/teach/review`} className="card p-3 hover:border-ink">
          <div className="text-xs text-muted">Step 3</div>
          <div className="font-semibold">Approve lessons & questions</div>
          <div className={`text-sm ${totals.drafts ? "font-semibold text-warn" : "text-muted"}`}>
            {totals.drafts} to review · {totals.live} live
          </div>
        </Link>
      </ol>

      {ups.length === 0 ? (
        <p className="card p-4 text-sm text-muted">
          Upload your playbook first on the <Link className="underline" href={`/t/${teamId}/uploads`}>Upload</Link> tab.
        </p>
      ) : (
        <DecodePanel
          teamId={teamId}
          uploads={ups.map((u) => ({ id: u.id, filename: u.filename, pageCount: u.pageCount }))}
          failed={failed}
          initialUpload={preUpload}
          initialPages={prePages}
        />
      )}

      {topics.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Topics</h2>
          <p className="text-sm text-muted">One topic per thing players learn, named from your playbook. Rename or merge them, then find gaps and write lessons for each.</p>
          <ul className="flex flex-col gap-2">
            {topics.map((t) => (
              <TopicRow
                key={t.id}
                teamId={teamId}
                topic={{
                  id: t.id,
                  name: t.name,
                  pageNos: t.pageNos,
                  gapsFound: Boolean(t.gapsFoundAt),
                  generated: Boolean(t.generatedAt),
                  gapsOpen: t.gapsOpen,
                  gapsDone: t.gapsDone,
                  drafts: t.lessonsDraft + t.questionsDraft,
                  live: t.lessonsApproved + t.questionsApproved,
                }}
                others={topics.filter((o) => o.id !== t.id).map((o) => ({ id: o.id, name: o.name }))}
              />
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <Link href={`/t/${teamId}/teach/results`} className="text-sm underline">
              Player results →
            </Link>
            <TriageButton teamId={teamId} />
          </div>
        </section>
      )}
    </div>
  );
}

function Step({ n, title, note }: { n: number; title: string; note: string }) {
  return (
    <li className="card p-3">
      <div className="text-xs text-muted">Step {n}</div>
      <div className="font-semibold">{title}</div>
      <div className="text-sm text-muted">{note}</div>
    </li>
  );
}
