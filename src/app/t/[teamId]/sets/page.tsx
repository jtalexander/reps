import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { studySets } from "@/db/schema";
import { approvedPlays } from "@/server/plays";
import { requireCoach } from "@/server/teams";
import { createSetAction, deleteSetAction } from "../actions";

export const metadata = { title: "Study sets" };

const POSITION_GROUPS = ["QB", "RB", "WR", "TE", "OL"];

export default async function Sets({ params }: PageProps<"/t/[teamId]/sets">) {
  const { teamId } = await params;
  await requireCoach(teamId);
  const sets = await db.select().from(studySets).where(eq(studySets.teamId, teamId)).orderBy(desc(studySets.createdAt));
  const approved = await approvedPlays(teamId);
  const names = new Map(approved.map((p) => [p.id, p.name]));
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-4xl">Study sets</h1>
        <p className="mt-1 text-sm text-muted">Assign a group of approved plays — this week&apos;s game plan — with a due date. Players see it first on their home screen.</p>
      </div>
      {approved.length === 0 ? (
        <p className="card p-4 text-sm text-muted">Approve some plays first. Only approved plays can go in a study set.</p>
      ) : (
        <form action={createSetAction.bind(null, teamId)} className="card flex flex-col gap-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">
                Name
              </label>
              <input id="name" name="name" className="input" placeholder="Week 6 game plan" required />
            </div>
            <div>
              <label className="label" htmlFor="dueDate">
                Due
              </label>
              <input id="dueDate" name="dueDate" type="date" className="input" />
            </div>
          </div>
          <fieldset>
            <legend className="label">Plays ({approved.length} approved)</legend>
            <div className="grid max-h-72 gap-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">
              {approved.map((p) => (
                <label key={p.id} className="flex min-h-9 items-center gap-2 text-sm">
                  <input type="checkbox" name="playIds" value={p.id} className="h-5 w-5" />
                  <span className="truncate">{p.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="label">For (leave empty for everyone)</legend>
            <div className="flex flex-wrap gap-3">
              {POSITION_GROUPS.map((g) => (
                <label key={g} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" name="positions" value={g} className="h-5 w-5" /> {g}
                </label>
              ))}
            </div>
          </fieldset>
          <button className="btn btn-primary self-start">Assign study set</button>
        </form>
      )}
      <ul className="flex flex-col gap-2">
        {sets.map((s) => (
          <li key={s.id} className="card p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{s.name}</div>
                <div className="text-xs text-muted">
                  {s.playIds.length} plays{s.dueDate ? ` · due ${s.dueDate}` : ""}
                  {s.positions.length ? ` · ${s.positions.join(", ")}` : " · everyone"}
                </div>
              </div>
              <form action={deleteSetAction.bind(null, teamId, s.id)}>
                <button className="text-sm text-muted underline">Delete</button>
              </form>
            </div>
            <p className="mt-1 text-xs text-muted">{s.playIds.map((id) => names.get(id) ?? "(unapproved)").join(" · ")}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
