import Link from "next/link";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { studySets } from "@/db/schema";
import { questions, topics } from "@/db/teach-schema";
import { requireCoach } from "@/server/teams";
import { createSetAction, deleteSetAction } from "../actions";

export const metadata = { title: "Study sets" };

const POSITION_GROUPS = ["QB", "RB", "WR", "TE", "OL"];

/** Assign topics (this week's game plan) with a due date; players practice just those. */
export default async function Sets({ params }: PageProps<"/t/[teamId]/sets">) {
  const { teamId } = await params;
  await requireCoach(teamId);
  const sets = await db.select().from(studySets).where(eq(studySets.teamId, teamId)).orderBy(desc(studySets.createdAt));
  // topics with approved quiz questions, install first
  const ready = await db
    .select({ id: topics.id, name: topics.name, inInstall: topics.inInstall, n: sql<number>`count(${questions.id})::int` })
    .from(topics)
    .innerJoin(questions, and(eq(questions.topicId, topics.id), eq(questions.status, "approved")))
    .where(and(eq(topics.teamId, teamId), eq(topics.archived, false)))
    .groupBy(topics.id)
    .orderBy(desc(topics.inInstall), asc(topics.sort));
  const names = new Map(ready.map((t) => [t.id, t.name]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-4xl">Study sets</h1>
        <p className="mt-1 text-sm text-muted">
          Assign topics, like this week&apos;s game plan, with a due date. Players see it first on their home screen and practice only those topics&apos; approved questions.
        </p>
      </div>
      {ready.length === 0 ? (
        <p className="card p-4 text-sm text-muted">
          Approve some topics in{" "}
          <Link className="font-semibold text-ink underline" href={`/t/${teamId}/teach`}>
            Teach
          </Link>{" "}
          first. Only topics with approved questions can go in a study set.
        </p>
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
            <legend className="label">Topics ({ready.length} approved{ready.some((t) => t.inInstall) ? ", install checked" : ""})</legend>
            <div className="grid max-h-80 gap-1 overflow-y-auto border border-line p-2 sm:grid-cols-2">
              {ready.map((t) => (
                <label key={t.id} className="flex min-h-9 items-center gap-2 text-sm">
                  <input type="checkbox" name="topicIds" value={t.id} defaultChecked={t.inInstall} className="h-5 w-5" />
                  <span className="truncate">
                    {t.name} <span className="text-xs text-muted">· {t.n}</span>
                    {t.inInstall && <span className="ml-1.5 bg-brand px-1 font-label text-[10px] font-bold tracking-widest text-brand-ink uppercase">Install</span>}
                  </span>
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
                  {s.topicIds.length ? `${s.topicIds.length} topic${s.topicIds.length === 1 ? "" : "s"}` : `${s.playIds.length} old plays`}
                  {s.dueDate ? ` · due ${s.dueDate}` : ""}
                  {s.positions.length ? ` · ${s.positions.join(", ")}` : " · everyone"}
                </div>
              </div>
              <form action={deleteSetAction.bind(null, teamId, s.id)}>
                <button className="text-sm text-muted underline">Delete</button>
              </form>
            </div>
            {s.topicIds.length > 0 && <p className="mt-1 text-xs text-muted">{s.topicIds.map((id) => names.get(id) ?? "(no approved questions)").join(" · ")}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
