import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { players } from "@/db/schema";
import { askLog, topics } from "@/db/teach-schema";
import { requireCoach } from "@/server/teams";
import { mastery, openAnswers, weakSpots } from "@/teach/service";
import { GradeOverride } from "./grade-override";

export const metadata = { title: "Teach results" };

const tone = (p: number) => (p >= 85 ? "bg-ok-bg text-ok" : p >= 60 ? "bg-warn-bg text-warn" : "bg-bad-bg text-bad");

export default async function TeachResults({ params }: PageProps<"/t/[teamId]/teach/results">) {
  const { teamId } = await params;
  await requireCoach(teamId);
  const roster = await db.select().from(players).where(and(eq(players.teamId, teamId), eq(players.active, true))).orderBy(asc(players.name));
  const ts = await db.select().from(topics).where(and(eq(topics.teamId, teamId), eq(topics.archived, false))).orderBy(asc(topics.sort));
  const m = await mastery(teamId);
  const cell = new Map(m.map((r) => [`${r.playerId}:${r.topicId}`, r]));
  const weak = await weakSpots(teamId);
  const open = await openAnswers(teamId);
  const names = new Map(roster.map((p) => [p.id, p.name]));
  const topicName = new Map(ts.map((t) => [t.id, t.name]));
  const asks = await db.select().from(askLog).where(eq(askLog.teamId, teamId)).orderBy(desc(askLog.createdAt)).limit(30);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/t/${teamId}/teach`} className="text-sm text-muted underline">
          Teach
        </Link>
        <h1 className="text-4xl">Player results</h1>
        <p className="mt-1 text-sm text-muted">Mastery is each player&apos;s latest score on every question in a topic. Green 85%+, yellow 60%+.</p>
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Mastery by topic</h2>
        {roster.length === 0 || ts.length === 0 ? (
          <p className="text-sm text-muted">No players or topics yet.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="p-2">Player</th>
                  {ts.map((t) => (
                    <th key={t.id} className="p-2 text-center whitespace-nowrap">
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="p-2 whitespace-nowrap">
                      {p.name} <span className="text-xs text-muted">{p.positions.join(" ")}</span>
                    </td>
                    {ts.map((t) => {
                      const c = cell.get(`${p.id}:${t.id}`);
                      const pct = c ? Math.round(c.score * 100) : null;
                      return (
                        <td key={t.id} className="p-1 text-center">
                          {pct === null ? <span className="text-xs text-muted">—</span> : <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${tone(pct)}`}>{pct}%</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">What the team keeps missing</h2>
        {weak.length === 0 ? (
          <p className="text-sm text-muted">Not enough answers yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {weak.map((w) => (
              <li key={w.questionId} className="card flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="text-xs text-muted">{topicName.get(w.topicId)} · </span>
                  {w.prompt}
                </span>
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${tone(Math.round(w.avg * 100))}`}>
                  {Math.round(w.avg * 100)}% · {w.players} players
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Answers in players&apos; own words</h2>
        <p className="mb-2 text-sm text-muted">Graded by RepWon against your model answer. Change any grade you disagree with.</p>
        {open.length === 0 ? (
          <p className="text-sm text-muted">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map(({ attempt: a, prompt }) => (
              <li key={a.id} className="card p-3 text-sm">
                <div className="text-xs text-muted">
                  {names.get(a.playerId) ?? "Player"} · {new Date(a.createdAt).toLocaleDateString()}
                </div>
                <div className="font-semibold">{prompt}</div>
                <p className="mt-1">&ldquo;{String(a.given ?? "")}&rdquo;</p>
                {a.feedback && <p className="mt-1 text-muted">RepWon: {a.feedback}</p>}
                <GradeOverride teamId={teamId} attemptId={a.id} correct={a.correct} score={a.score} byCoach={a.gradedBy === "coach"} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">What players asked</h2>
        {asks.length === 0 ? (
          <p className="text-sm text-muted">No questions yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {asks.map((q) => (
              <li key={q.id} className="card p-3 text-sm">
                <div className="text-xs text-muted">
                  {names.get(q.playerId) ?? "Player"} · {new Date(q.createdAt).toLocaleDateString()}
                  {!q.answered && <span className="ml-1 font-semibold text-warn">· not in the playbook</span>}
                </div>
                <div className="font-semibold">{q.question}</div>
                <p className="mt-1 text-muted">{q.answer}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
