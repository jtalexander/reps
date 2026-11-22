import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { players } from "@/db/schema";
import { requireCoach } from "@/server/teams";
import { addPlayersAction, removePlayerAction, updatePlayerAction } from "../actions";

export const metadata = { title: "Roster" };

export default async function Roster({ params }: PageProps<"/t/[teamId]/roster">) {
  const { teamId } = await params;
  const { team } = await requireCoach(teamId);
  const list = await db
    .select()
    .from(players)
    .where(and(eq(players.teamId, teamId), eq(players.active, true)))
    .orderBy(asc(players.name));
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-4xl">Roster</h1>
        <p className="mt-1 text-sm text-muted">
          Players join at <strong>/join</strong> with code <span className="font-mono font-bold tracking-widest">{team.joinCode}</span>, then pick their name. First name and last initial is enough — nothing else is collected.
        </p>
      </div>
      <form action={addPlayersAction.bind(null, teamId)} className="card flex flex-col gap-3 p-4">
        <label className="label" htmlFor="players">
          Add players — one per line: name, positions
        </label>
        <textarea id="players" name="players" rows={4} className="input py-2 font-mono text-sm" placeholder={"Sam K 7, QB\nJayden R, X Z\nMarcus T 22, RB"} />
        <button className="btn btn-primary self-start">Add</button>
      </form>
      {list.length > 0 && (
        <ul className="flex flex-col gap-2">
          {list.map((p) => (
            <li key={p.id} className="card p-3">
              <form action={updatePlayerAction.bind(null, teamId, p.id)} className="flex flex-wrap items-end gap-2">
                <div className="min-w-32 flex-1">
                  <label className="label">Name</label>
                  <input name="name" defaultValue={p.name} className="input" />
                </div>
                <div className="w-16">
                  <label className="label">#</label>
                  <input name="jersey" defaultValue={p.jersey ?? ""} className="input" inputMode="numeric" />
                </div>
                <div className="min-w-28 flex-1">
                  <label className="label">Positions</label>
                  <input name="positions" defaultValue={p.positions.join(" ")} className="input uppercase" placeholder="QB" />
                </div>
                <button className="btn btn-ghost">Save</button>
                <Link href={`/t/${teamId}/results/${p.id}`} className="btn btn-ghost">
                  Results
                </Link>
                <button formAction={removePlayerAction.bind(null, teamId, p.id)} className="btn text-sm text-muted underline">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
