import Link from "next/link";
import { scoutInstall } from "@/breakdown/scout/service";
import { PlaySvg } from "@/components/play-svg";
import { requirePlayer } from "@/shared/teams";

export const metadata = { title: "Scout team" };

/** This week's scout cards: the opponent's plays the scout team runs in practice. Cards to look at, never quizzed. */
export default async function ScoutCards() {
  const me = await requirePlayer();
  const rows = await scoutInstall(me.team.id);
  const groups = [...new Set(rows.map((r) => `${r.opponent} ${r.season}`))];
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6">
      <header>
        <Link href="/study" className="text-sm text-muted underline">
          Study
        </Link>
        <h1 className="mt-1 text-4xl">Scout team</h1>
        <p className="text-sm text-muted">The other team&rsquo;s plays, for running the look in practice.</p>
      </header>
      {rows.length === 0 && <p className="card p-4 text-sm text-muted">Your coach hasn&rsquo;t put out scout cards this week.</p>}
      {groups.map((g) => (
        <section key={g} className="flex flex-col gap-3">
          <h2 className="text-2xl">{g}</h2>
          {rows
            .filter((r) => `${r.opponent} ${r.season}` === g)
            .map((r) => (
              <article key={r.play.id} className="card flex flex-col gap-2 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-lg">{r.play.name && r.play.name !== "unknown" ? r.play.name : "Unnamed"}</h3>
                  <span className="text-xs text-muted">{r.play.side === "offense" ? "Their offense" : "Their defense"}</span>
                </div>
                <PlaySvg data={r.play.data} fit className="block w-full" />
              </article>
            ))}
        </section>
      ))}
    </main>
  );
}
