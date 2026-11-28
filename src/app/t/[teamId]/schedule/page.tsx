import Link from "next/link";
import { listGames, listOpponents } from "@/breakdown/scout/service";
import { requireCoach, teamsForUser } from "@/shared/teams";
import { GameForm, RemoveGame } from "./game-form";

export const metadata = { title: "Schedule" };

const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const where = (h: string) => (h === "home" ? "vs" : h === "away" ? "at" : "vs (neutral)");

/**
 * This team's games, and the games of every other team the coach is on: a
 * school with two freshman teams and two JV teams has a team for each, and
 * sees them all here.
 */
export default async function Schedule({ params }: PageProps<"/t/[teamId]/schedule">) {
  const { teamId } = await params;
  const { user, team } = await requireCoach(teamId);
  const [games, opponents, mine] = await Promise.all([listGames(teamId), listOpponents(teamId), teamsForUser(user.id)]);
  const others = await Promise.all(mine.filter((t) => t.id !== teamId).map(async (t) => ({ team: t, games: await listGames(t.id) })));
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = games.filter((g) => g.game.gameDate >= today);
  const played = games.filter((g) => g.game.gameDate < today).reverse();

  const row = (g: (typeof games)[number], own: boolean) => (
    <li key={g.game.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line py-2 first:border-t-0">
      <span className="w-44 shrink-0 tabular-nums text-muted">{day(g.game.gameDate)}</span>
      <span className="min-w-0 flex-1">
        {where(g.game.homeAway)}{" "}
        {own ? (
          <Link href={`/t/${teamId}/scout/${g.opponent.id}`} className="font-semibold underline">
            {g.opponent.name}
          </Link>
        ) : (
          <span className="font-semibold">{g.opponent.name}</span>
        )}
        <span className="text-muted">{[g.game.kickoff, g.game.location].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
      </span>
      {own && <RemoveGame teamId={teamId} gameId={g.game.id} label={`${g.opponent.name}, ${day(g.game.gameDate)}`} />}
    </li>
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-4xl">Schedule</h1>
        <p className="max-w-prose text-sm text-muted">{team.name}&rsquo;s games. Each opponent links to the playbook your scout team runs that week.</p>
      </div>

      <section className="card flex flex-col gap-1 p-4 text-sm">
        <h2 className="text-2xl">Coming up</h2>
        {upcoming.length ? <ul>{upcoming.map((g) => row(g, true))}</ul> : <p className="text-muted">No games ahead. Add one below.</p>}
      </section>

      {played.length > 0 && (
        <section className="card flex flex-col gap-1 p-4 text-sm">
          <h2 className="text-2xl">Played</h2>
          <ul>{played.map((g) => row(g, true))}</ul>
        </section>
      )}

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-2xl">Add a game</h2>
        <GameForm teamId={teamId} opponents={opponents.map((o) => ({ id: o.id, name: o.name, season: o.season }))} season={new Date().getFullYear()} />
      </section>

      {others.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl">Your other teams</h2>
          {others.map((o) => (
            <div key={o.team.id} className="card flex flex-col gap-1 p-4 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-xl">{o.team.name}</h3>
                <Link href={`/t/${o.team.id}/schedule`} className="underline">
                  Open
                </Link>
              </div>
              {o.games.length ? <ul>{o.games.map((g) => row(g, false))}</ul> : <p className="text-muted">No games entered.</p>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
