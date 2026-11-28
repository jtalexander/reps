import Link from "next/link";
import { listOpponents } from "@/breakdown/scout/service";
import { requireCoach } from "@/shared/teams";
import { OpponentForm } from "./opponent-form";

export const metadata = { title: "Scout" };

/** Opponents by season, each with their staff and their scout playbook. */
export default async function Scout({ params }: PageProps<"/t/[teamId]/scout">) {
  const { teamId } = await params;
  await requireCoach(teamId);
  const opponents = await listOpponents(teamId);
  const thisSeason = new Date().getFullYear();
  const seasons = [...new Set(opponents.map((o) => o.season))];
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-4xl">Scout</h1>
        <p className="max-w-prose text-sm text-muted">
          Each opponent has a playbook for your scout team, kept by season and by who is coaching them. Their plays never mix with your own playbook or your players&rsquo; quizzes.
        </p>
      </div>
      {opponents.length === 0 && <p className="card p-4 text-sm text-muted">No opponents yet. Add the first one below.</p>}
      {seasons.map((season) => (
        <section key={season} className="flex flex-col gap-2">
          <h2 className="text-2xl">{season}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {opponents
              .filter((o) => o.season === season)
              .map((o) => (
                <li key={o.id}>
                  <Link href={`/t/${teamId}/scout/${o.id}`} className="card flex flex-col gap-1 p-4 hover:border-brand">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-xl">{o.name}</span>
                      <span className="text-sm text-muted">
                        {o.plays} play{o.plays === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="text-sm text-muted">
                      {[o.headCoach && `HC ${o.headCoach}`, o.offensiveCoordinator && `OC ${o.offensiveCoordinator}`, o.defensiveCoordinator && `DC ${o.defensiveCoordinator}`].filter(Boolean).join(" · ") || "Staff not entered"}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-2xl">Add an opponent</h2>
        <OpponentForm teamId={teamId} opponentId={null} season={thisSeason} />
      </section>
    </div>
  );
}
