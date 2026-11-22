import Link from "next/link";
import { pct, resultsByPlay, resultsByPlayer } from "@/server/results";
import { requireCoach } from "@/server/teams";

export const metadata = { title: "Results" };

export default async function Results({ params }: PageProps<"/t/[teamId]/results">) {
  const { teamId } = await params;
  await requireCoach(teamId);
  const byPlayer = await resultsByPlayer(teamId);
  const byPlay = await resultsByPlay(teamId);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-4xl">Results</h1>
      <section>
        <h2 className="mb-2 font-semibold">Players</h2>
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
        <h2 className="mb-2 font-semibold">Plays, hardest first</h2>
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
