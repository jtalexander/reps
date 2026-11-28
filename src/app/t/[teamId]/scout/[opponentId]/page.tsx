import Link from "next/link";
import { notFound } from "next/navigation";
import { getOpponent, listScoutPlays } from "@/breakdown/scout/service";
import { requireCoach } from "@/shared/teams";
import { PrintButton } from "../../plays/print/print-button";
import { OpponentForm } from "../opponent-form";
import { ScoutCards } from "./scout-cards";

export const metadata = { title: "Scout playbook" };

/** One opponent in one season: their staff and the plays the scout team runs. */
export default async function OpponentPlaybook({ params }: PageProps<"/t/[teamId]/scout/[opponentId]">) {
  const { teamId, opponentId } = await params;
  await requireCoach(teamId);
  const opponent = await getOpponent(teamId, opponentId);
  if (!opponent) notFound();
  const plays = await listScoutPlays(teamId, opponentId);
  const cards = (side: "offense" | "defense") => plays.filter((p) => p.side === side).map((p) => ({ id: p.id, name: p.name, data: p.data, inInstall: p.inInstall, source: p.source }));
  const base = `/t/${teamId}/scout/${opponentId}`;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/t/${teamId}/scout`} className="text-sm text-muted underline print:hidden">
          Scout
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-4xl">
            {opponent.name} <span className="text-muted">{opponent.season}</span>
          </h1>
          <PrintButton />
        </div>
        <p className="text-sm text-muted">
          {[opponent.headCoach && `HC ${opponent.headCoach}`, opponent.offensiveCoordinator && `OC ${opponent.offensiveCoordinator}`, opponent.defensiveCoordinator && `DC ${opponent.defensiveCoordinator}`].filter(Boolean).join(" · ") || "Staff not entered yet."}
        </p>
      </div>

      {(["offense", "defense"] as const).map((side) => (
        <section key={side} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-2xl">{side === "offense" ? "Their offense" : "Their defense"}</h2>
            <Link href={`${base}/draw${side === "defense" ? "?side=defense" : ""}`} className="text-sm font-semibold underline print:hidden">
              {side === "offense" ? "Draw one of their plays" : "Draw one of their defensive calls"}
            </Link>
          </div>
          {cards(side).length > 0 ? (
            <ScoutCards teamId={teamId} opponentId={opponentId} cards={cards(side)} />
          ) : (
            <p className="card p-4 text-sm text-muted print:hidden">
              {side === "offense" ? "No plays yet. Draw one while you watch their film, or start one from a snap on the film marking page." : "No defensive calls yet."}
            </p>
          )}
        </section>
      ))}

      <section className="card flex flex-col gap-3 p-4 print:hidden">
        <h2 className="text-2xl">Opponent and staff</h2>
        <OpponentForm
          teamId={teamId}
          opponentId={opponentId}
          season={opponent.season}
          start={{ name: opponent.name, season: opponent.season, headCoach: opponent.headCoach, offensiveCoordinator: opponent.offensiveCoordinator, defensiveCoordinator: opponent.defensiveCoordinator, notes: opponent.notes }}
        />
      </section>
    </div>
  );
}
