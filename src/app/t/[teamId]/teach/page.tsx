import Link from "next/link";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { plays, uploads } from "@/db/schema";
import { teachPages } from "@/db/teach-schema";
import { hasApiKey } from "@/ingest/extract";
import { requireCoach, teamsForUser } from "@/server/teams";
import { lastRun, runProgress } from "@/teach/playbook-run";
import { openFlags, topicOverview } from "@/teach/service";
import { aiBlockedReason } from "@/teach/usage";
import { libraryState } from "@/library/sync";
import { requestOrigin } from "@/lib/origin";
import { ensureNamingDraft } from "@/teach/naming-auto";
import { NamingCard } from "../plays/naming/naming-card";
import { TriageButton } from "./triage-button";
import { DecodePanel } from "./decode-panel";
import { ClearInstall, InstallOnlyToggle, InstallToggle as InstallToggleInline } from "./install-button";
import { PlaybookRunCard } from "./playbook-run-card";
import { CopyFromTeam } from "./copy-from-team";
import { TopicRow } from "./topic-row";

export const metadata = { title: "Teach" };

export default async function TeachHub({ params, searchParams }: PageProps<"/t/[teamId]/teach">) {
  const { teamId } = await params;
  const sp = await searchParams;
  const preUpload = typeof sp.upload === "string" ? sp.upload : null;
  const prePages = typeof sp.pages === "string" ? sp.pages : "";
  const { team, user } = await requireCoach(teamId);
  const otherTeams = (await teamsForUser(user.id)).filter((t) => t.id !== teamId);
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
  // the install comes first everywhere; otherwise playbook order
  topics.sort((a, b) => Number(b.inInstall) - Number(a.inInstall));
  const sum = (ts: typeof topics) =>
    ts.reduce(
      (a, t) => ({
        gaps: a.gaps + t.gapsOpen,
        drafts: a.drafts + t.lessonsDraft + t.questionsDraft,
        reserve: a.reserve + t.questionsReserve,
        live: a.live + t.lessonsApproved + t.questionsApproved,
      }),
      { gaps: 0, drafts: 0, reserve: 0, live: 0 },
    );
  const install = topics.filter((t) => t.inInstall);
  const [pickedRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.inInstall, true), eq(plays.archived, false)));
  const picked = pickedRow?.n ?? 0;
  // "only the install": Teach's counts, next step and list are the install; the rest wait
  const focused = team.installOnly && install.length > 0;
  const working = focused ? install : topics;
  const totals = sum(working);
  const installTotals = sum(install);
  const decoded = pageStats.find((s) => s.status === "decoded")?.n ?? 0;
  const flagged = new Set((await openFlags(teamId)).map((f) => f.question.id)).size;
  const optional = working.reduce((a, t) => a + t.gapsOptional, 0);
  const blocked = await aiBlockedReason(teamId);
  const basicsAdded = [...(await libraryState(teamId)).values()].filter((s) => !s.archived).length;
  // naming rules draft themselves once pages are read; the coach only checks them
  const naming = await ensureNamingDraft(teamId, await requestOrigin());
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
  const topicsLeft = working.filter((t) => !t.gapsFoundAt || !t.generatedAt || t.questionsUnsorted > 0).length;
  const firstTodo = working.find((t) => t.gapsOpen > 0 || t.lessonsDraft + t.questionsDraft > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-4xl">Teach</h1>
        <p className="mt-1 text-sm text-muted">
          RepWon reads your playbook, asks you about what isn&apos;t written down, then writes lessons and questions for each position. Nothing reaches players until you approve it.
        </p>
      </div>

      {!hasApiKey() && <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">The server has no Anthropic API key, so RepWon can&apos;t read pages yet.</p>}

      {blocked && <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm font-semibold text-warn">{blocked}</p>}

      <NamingCard teamId={teamId} status={naming} />

      <Link href={`/t/${teamId}/basics`} className="card flex items-center justify-between gap-3 p-4 hover:border-ink">
        <span>
          <span className="block font-semibold">Football basics</span>
          <span className="block text-sm text-muted">
            Ready-made lessons and quizzes on offense, defense and special teams, concepts and technique.{" "}
            {basicsAdded ? `${basicsAdded} topic${basicsAdded === 1 ? "" : "s"} added.` : "Nothing added yet."}
          </span>
        </span>
        <span aria-hidden>→</span>
      </Link>

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
              Each topic is one page: answer RepWon&apos;s few questions, skim the lessons and its core quiz questions, approve them all with one tap.
              {firstTodo.inInstall ? " Your install comes first." : ""}
            </p>
          </div>
          <Link href={`/t/${teamId}/teach/topic/${firstTodo.id}`} className="btn btn-primary">
            Start with {firstTodo.name} →
          </Link>
        </div>
      )}

      {topics.length > 0 && (
        <section className="card flex flex-col gap-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="eyebrow">
              <span className="h-px w-6 bg-brand" />
              {team.installName || "This week’s install"}
            </p>
            <span className="flex items-center gap-3">
              {(install.length > 0 || picked > 0) && <ClearInstall teamId={teamId} count={install.length + picked} />}
              <Link href={`/t/${teamId}/install`} className="btn btn-outline min-h-9 px-3 text-sm">
                {picked ? `${picked} play${picked === 1 ? "" : "s"} picked · Pick plays` : "Pick plays"}
              </Link>
            </span>
          </div>
          {install.length > 0 && <InstallOnlyToggle teamId={teamId} on={team.installOnly} />}
          {install.length === 0 ? (
            <p className="text-sm text-muted">
              Pick what you&apos;re teaching now: <b>Pick plays</b> one by one (find them by formation, motion or concept), or tap <b>+ Add to install</b> on whole topics below.
              They come first here, in your review, and on your players&apos; Study page.
            </p>
          ) : (
            <>
              <p className="text-sm">
                {install.length} topic{install.length === 1 ? "" : "s"}
                {installTotals.gaps ? <span className="font-semibold text-warn"> · {installTotals.gaps} questions for you</span> : null}
                {installTotals.drafts ? <span className="font-semibold text-warn"> · {installTotals.drafts} to review</span> : null}
                <span className="text-muted"> · {installTotals.live} live</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {install.map((t) => (
                  <Link key={t.id} href={`/t/${teamId}/teach/topic/${t.id}`} className="border border-line px-2 py-1 text-sm hover:border-brand">
                    {t.name}
                    {t.gapsOpen + t.lessonsDraft + t.questionsDraft === 0 ? <span className="text-ok"> ✓</span> : null}
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <ol className="grid gap-3 sm:grid-cols-3">
        <Step n={1} title="Read pages" note={`${decoded} pages read`} />
        <Link href={`/t/${teamId}/teach/interview`} className="card p-3 hover:border-ink">
          <div className="text-xs text-muted">Step 2</div>
          <div className="font-semibold">Answer RepWon&apos;s questions</div>
          <div className={`text-sm ${totals.gaps ? "font-semibold text-warn" : "text-muted"}`}>
            {totals.gaps} waiting{optional ? <span className="font-normal text-muted"> · {optional} optional</span> : null}
          </div>
        </Link>
        <Link href={`/t/${teamId}/teach/review`} className="card p-3 hover:border-ink">
          <div className="text-xs text-muted">Step 3</div>
          <div className="font-semibold">Approve lessons & questions</div>
          <div className={`text-sm ${totals.drafts ? "font-semibold text-warn" : "text-muted"}`}>
            {totals.drafts} to review · {totals.live} live
            {totals.reserve ? <span className="block font-normal text-muted">{totals.reserve} more questions in reserve</span> : null}
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
          <p className="text-sm text-muted">
            One topic per thing players learn, named from your playbook.{focused ? " Only this week's install is shown; RepWon asks about and writes for these first." : ""}
          </p>
          <ul className="flex flex-col gap-2">
            {working.map((t) => (
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
                  reserve: t.questionsReserve,
                  live: t.lessonsApproved + t.questionsApproved,
                  inInstall: t.inInstall,
                }}
                others={topics.filter((o) => o.id !== t.id).map((o) => ({ id: o.id, name: o.name }))}
              />
            ))}
          </ul>
          {focused && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">
                {topics.length - install.length} other topics wait until you add them to an install
              </summary>
              <ul className="mt-2 flex flex-col gap-1">
                {topics
                  .filter((t) => !t.inInstall)
                  .map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 border-t border-line py-1.5">
                      <Link href={`/t/${teamId}/teach/topic/${t.id}`} className="underline">
                        {t.name}
                      </Link>
                      <InstallToggleInline teamId={teamId} topicId={t.id} on={false} />
                    </li>
                  ))}
              </ul>
            </details>
          )}
          {otherTeams.length > 0 && <CopyFromTeam teamId={teamId} teams={otherTeams.map((t) => ({ id: t.id, name: t.name }))} />}
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
