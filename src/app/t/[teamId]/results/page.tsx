import Link from "next/link";
import { pct, resultsByPlay, resultsByPlayer } from "@/server/results";
import { requireCoach } from "@/server/teams";
import { gameReady, setProgress } from "@/teach/progress";

const tone = (p: number) => (p >= 85 ? "bg-ok-bg text-ok" : p >= 60 ? "bg-warn-bg text-warn" : "bg-bad-bg text-bad");

export const metadata = { title: "Results" };

export default async function Results({ params }: PageProps<"/t/[teamId]/results">) {
  const { teamId } = await params;
  await requireCoach(teamId);
  const byPlayer = await resultsByPlayer(teamId);
  const byPlay = await resultsByPlay(teamId);
  const ready = await gameReady(teamId);
  const sets = await setProgress(teamId);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-4xl">Results</h1>
        <p className="mt-1 text-sm text-muted">
          A topic counts as known at 85%+ once a player has answered at least 3 of its questions.{" "}
          <Link className="underline" href={`/t/${teamId}/teach/results`}>
            Mastery by topic, weak spots and own-words answers
          </Link>
        </p>
      </div>

      {ready && (
        <section>
          <h2 className="mb-2 font-semibold">
            Game-ready on this week&apos;s install · {ready.ready} of {ready.rows.length} players
          </h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="p-2">Player</th>
                  <th className="p-2">Ready</th>
                  {ready.topics.map((t) => (
                    <th key={t.id} className="p-2 text-center whitespace-nowrap">
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ready.rows.map((r) => (
                  <tr key={r.playerId} className="border-t border-line">
                    <td className="p-2 whitespace-nowrap">
                      <Link href={`/t/${teamId}/results/${r.playerId}`} className="underline">
                        {r.name}
                      </Link>{" "}
                      <span className="text-xs text-muted">{r.positions.join(" ")}</span>
                    </td>
                    <td className={`p-2 font-semibold ${r.ready ? "text-ok" : "text-muted"}`}>{r.ready ? "Ready" : `${r.known} of ${ready.topics.length}`}</td>
                    {r.topics.map((t) => (
                      <td key={t.topicId} className="p-1 text-center">
                        {t.score === null ? (
                          <span className="text-xs text-muted">—</span>
                        ) : (
                          <span className={`inline-block min-w-11 px-1.5 py-0.5 text-xs font-bold ${tone(Math.round(t.score * 100))}`}>{Math.round(t.score * 100)}%</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {sets.map((s) => (
        <section key={s.id}>
          <h2 className="mb-2 font-semibold">
            {s.name} · {s.done} of {s.rows.length} done{s.dueDate ? ` · due ${s.dueDate}` : ""}
          </h2>
          {s.rows.length === 0 ? (
            <p className="text-sm text-muted">No players at these positions yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {s.rows.map((r) => (
                <li key={r.playerId} className="card flex items-center gap-3 px-3 py-2 text-sm">
                  <Link href={`/t/${teamId}/results/${r.playerId}`} className="min-w-0 flex-1 truncate underline">
                    {r.name} <span className="text-xs text-muted no-underline">{r.positions.join(" ")}</span>
                  </Link>
                  <div className="hidden h-2 w-32 overflow-hidden bg-line sm:block">
                    <div className={`h-full ${r.known === s.topics ? "bg-ok" : "bg-brand"}`} style={{ width: `${Math.round((r.known / s.topics) * 100)}%` }} />
                  </div>
                  <span className="w-28 text-right">
                    {r.known === s.topics ? <b className="text-ok">Done</b> : r.started ? `${r.known} of ${s.topics} topics` : <span className="text-muted">not started</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section>
        <h2 className="mb-2 font-semibold">Real plays: players</h2>
        {byPlayer.length === 0 ? (
          <p className="text-sm text-muted">No players yet.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted uppercase">
                <tr>
                  <th className="p-2">Player</th>
                  <th className="p-2">Pos</th>
                  <th className="p-2 text-right">Answers</th>
                  <th className="p-2 text-right">Right</th>
                  <th className="p-2 text-right">Avg time</th>
                  <th className="p-2 text-right">Last</th>
                </tr>
              </thead>
              <tbody>
                {byPlayer.map((r) => (
                  <tr key={r.playerId} className="border-t border-line">
                    <td className="p-2">
                      <Link href={`/t/${teamId}/results/${r.playerId}`} className="font-medium underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="p-2 text-muted">{r.positions.join(" ")}</td>
                    <td className="p-2 text-right">{r.total}</td>
                    <td className="p-2 text-right font-semibold">{r.total ? `${pct(r.correct, r.total)}%` : "—"}</td>
                    <td className="p-2 text-right">{r.total ? `${(r.avgMs / 1000).toFixed(1)}s` : "—"}</td>
                    <td className="p-2 text-right text-muted">{r.lastAt ? new Date(r.lastAt).toLocaleDateString() : "never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Real plays, hardest first</h2>
        {byPlay.length === 0 ? (
          <p className="text-sm text-muted">No answers yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {byPlay.map((r) => {
              const p = pct(r.correct, r.total) ?? 0;
              return (
                <li key={r.playId} className="card flex items-center gap-3 px-3 py-2 text-sm">
                  <Link href={`/t/${teamId}/plays/${r.playId}`} className="min-w-0 flex-1 truncate underline">
                    {r.name}
                  </Link>
                  <div className="hidden h-2 w-32 overflow-hidden rounded bg-line sm:block">
                    <div className={`h-full ${p < 70 ? "bg-bad" : "bg-ok"}`} style={{ width: `${p}%` }} />
                  </div>
                  <span className={`w-12 text-right font-semibold ${p < 70 ? "text-bad" : ""}`}>{p}%</span>
                  <span className="w-28 text-right text-xs text-muted">
                    {r.playersMissing}/{r.players} missed
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
