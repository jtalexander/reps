import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { players } from "@/db/schema";
import { QUIZ_TYPE_LABEL, type QuizType } from "@/domain/quiz";
import { listPlays } from "@/server/plays";
import { completeness, pct, resultsByPlay, resultsByType } from "@/server/results";
import { requireCoach } from "@/server/teams";

export default async function Dashboard({ params }: PageProps<"/t/[teamId]">) {
  const { teamId } = await params;
  const { team } = await requireCoach(teamId);
  const stats = await completeness(teamId);
  const plays = await listPlays(teamId);
  const needing = plays.filter((p) => p.status !== "approved").slice(0, 6);
  const byPlay = (await resultsByPlay(teamId, 14)).filter((r) => r.total >= 3);
  const teamMisses = byPlay.filter((r) => (pct(r.correct, r.total) ?? 100) < 70).slice(0, 6);
  const byType = await resultsByType(teamId);
  const roster = await db.select({ id: players.id }).from(players).where(and(eq(players.teamId, teamId), eq(players.active, true)));

  const steps = [
    { done: plays.length > 0, label: "Upload your playbook PDF", href: `/t/${teamId}/uploads` },
    { done: stats.approved > 0, label: "Review and approve plays", href: `/t/${teamId}/plays` },
    { done: roster.length > 0, label: "Add your players", href: `/t/${teamId}/roster` },
    { done: false, label: `Give players the join code: ${team.joinCode}`, href: `/t/${teamId}/settings` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="QB-ready" value={`${stats.qbReady} / ${stats.qbPlays}`} note="pass, RPO & option plays" />
        <Stat label="Approved" value={`${stats.approved} / ${stats.total}`} note="plays in quizzes" />
        <Stat label="Need your input" value={String(stats.needsInput + stats.pending)} note="missing reads or details" tone={stats.needsInput + stats.pending ? "warn" : undefined} />
        <Stat label="Join code" value={team.joinCode} note={`${roster.length} players`} mono />
      </section>

      {(plays.length === 0 || stats.approved === 0 || roster.length === 0) && (
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Get started</h2>
          <ol className="flex flex-col gap-2">
            {steps.map((s, i) => (
              <li key={i}>
                <Link href={s.href} className="flex items-center gap-2 text-sm">
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-ok-bg text-ok" : "bg-line"}`}>{s.done ? "✓" : i + 1}</span>
                  <span className={s.done ? "text-muted line-through" : "underline"}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {needing.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Plays still needing you</h2>
            <Link href={`/t/${teamId}/plays`} className="text-sm underline">
              All
            </Link>
          </div>
          <ul className="flex flex-col gap-1">
            {needing.map((p) => (
              <li key={p.id}>
                <Link href={`/t/${teamId}/plays/${p.id}`} className="card flex items-center justify-between px-3 py-2 text-sm hover:border-ink">
                  <span className="truncate">{p.name === "unknown" ? "Unnamed play" : p.name}</span>
                  <span className="shrink-0 text-xs text-warn">{p.status === "draft" && p.data ? "ready to approve" : "needs input"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Plays the team is missing (last 14 days)</h2>
        {teamMisses.length === 0 ? (
          <p className="text-sm text-muted">{byPlay.length ? "No play under 70% right now." : "No quiz results yet."}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {teamMisses.map((r) => (
              <li key={r.playId} className="card flex items-center justify-between px-3 py-2 text-sm">
                <Link href={`/t/${teamId}/plays/${r.playId}`} className="truncate underline">
                  {r.name}
                </Link>
                <span className="shrink-0 font-semibold text-bad">
                  {pct(r.correct, r.total)}% · {r.playersMissing} of {r.players} players missed it
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {byType.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">By quiz type</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {byType.map((r) => (
              <li key={r.quizType} className="card p-3">
                <div className="text-xs text-muted">{QUIZ_TYPE_LABEL[r.quizType as QuizType] ?? r.quizType}</div>
                <div className="text-lg font-bold">{pct(r.correct, r.total)}%</div>
                <div className="text-xs text-muted">
                  {r.total} answers · {(r.avgMs / 1000).toFixed(1)}s avg
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, note, tone, mono }: { label: string; value: string; note: string; tone?: "warn"; mono?: boolean }) {
  return (
    <div className={`card p-3 ${tone === "warn" ? "border-warn/50" : ""}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-2xl font-bold ${mono ? "font-mono tracking-widest" : ""} ${tone === "warn" ? "text-warn" : ""}`}>{value}</div>
      <div className="text-xs text-muted">{note}</div>
    </div>
  );
}
