import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { players } from "@/db/schema";
import { QUIZ_TYPE_LABEL, type QuizType } from "@/domain/quiz";
import { pct, playerPlayResults, resultsByType } from "@/server/results";
import { requireCoach } from "@/server/teams";

export default async function PlayerResults({ params }: PageProps<"/t/[teamId]/results/[playerId]">) {
  const { teamId, playerId } = await params;
  await requireCoach(teamId);
  if (!/^[0-9a-f-]{36}$/i.test(playerId)) notFound();
  const [player] = await db.select().from(players).where(and(eq(players.teamId, teamId), eq(players.id, playerId)));
  if (!player) notFound();
  const byType = await resultsByType(teamId, playerId);
  const rows = await playerPlayResults(teamId, playerId);
  const byPlay = new Map<string, { name: string; types: Record<string, { c: number; t: number }> }>();
  for (const r of rows) {
    const e = byPlay.get(r.playId) ?? { name: r.name, types: {} };
    e.types[r.quizType] = { c: r.correct, t: r.total };
    byPlay.set(r.playId, e);
  }
  const types = [...new Set(rows.map((r) => r.quizType))];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/t/${teamId}/results`} className="text-sm text-muted underline">
          Results
        </Link>
        <h1 className="mt-1 text-4xl">
          {player.name} <span className="text-base font-normal text-muted">{player.positions.join(" ")}</span>
        </h1>
      </div>
      {byType.length === 0 ? (
        <p className="text-sm text-muted">No quizzes taken yet.</p>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {byType.map((r) => (
              <li key={r.quizType} className="card p-3">
                <div className="text-xs text-muted">{QUIZ_TYPE_LABEL[r.quizType as QuizType] ?? r.quizType}</div>
                <div className="text-xl font-bold">{pct(r.correct, r.total)}%</div>
                <div className="text-xs text-muted">
                  {r.total} · {(r.avgMs / 1000).toFixed(1)}s
                </div>
              </li>
            ))}
          </ul>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted uppercase">
                <tr>
                  <th className="p-2">Play</th>
                  {types.map((t) => (
                    <th key={t} className="p-2 text-right">
                      {QUIZ_TYPE_LABEL[t as QuizType] ?? t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...byPlay.entries()].map(([id, e]) => (
                  <tr key={id} className="border-t border-line">
                    <td className="p-2">{e.name}</td>
                    {types.map((t) => {
                      const v = e.types[t];
                      const p = v ? pct(v.c, v.t) : null;
                      return (
                        <td key={t} className={`p-2 text-right ${p != null && p < 70 ? "font-semibold text-bad" : ""}`}>
                          {v ? `${v.c}/${v.t}` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
