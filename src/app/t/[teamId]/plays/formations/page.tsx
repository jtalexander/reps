import Link from "next/link";
import { formationKey } from "@/domain/formations";
import { formationUse, listFormations, playbookFormations } from "@/server/formations";
import { requireCoach } from "@/server/teams";
import { FormationCards, FromPlaybook } from "./formations-client";

export const metadata = { title: "Formations" };

/**
 * The team's formations, saved once: every play can start from one, and
 * moving a player here can move him in every play drawn from it.
 */
export default async function Formations({ params }: PageProps<"/t/[teamId]/plays/formations">) {
  const { teamId } = await params;
  await requireCoach(teamId);
  const [saved, use, fromBook] = await Promise.all([listFormations(teamId), formationUse(teamId), playbookFormations(teamId)]);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/t/${teamId}/plays`} className="text-sm text-muted underline">
          Playbook
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-4xl">Formations</h1>
          <Link href={`/t/${teamId}/plays/build?newFormation=1`} className="text-sm font-semibold underline">
            Draw a new formation
          </Link>
        </div>
        <p className="text-sm text-muted">
          Save each formation once. Picking it in the play builder lines everyone up exactly here, and when you move a player in a formation you can move him in every play drawn from it.
        </p>
      </div>
      {saved.length > 0 ? (
        <FormationCards teamId={teamId} rows={saved.map((f) => ({ id: f.id, name: f.name, players: f.players, plays: use[formationKey(f.name)] ?? 0 }))} />
      ) : (
        <p className="card p-4 text-sm text-muted">No saved formations yet. Save the ones from your playbook below, or draw one.</p>
      )}
      {fromBook.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-2xl">From your playbook</h2>
          <p className="text-sm text-muted">Formation drawings RepWon read from your playbook. Tick the ones to keep as your formations.</p>
          <FromPlaybook teamId={teamId} rows={fromBook.map((f) => ({ id: f.id, name: f.name, players: f.data.players }))} />
        </section>
      )}
    </div>
  );
}
