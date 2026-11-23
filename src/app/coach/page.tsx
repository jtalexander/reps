import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { LEVELS, LEVEL_LABEL, type Level } from "@/domain/readiness";
import { createTeam, requireUser, teamsForUser } from "@/server/teams";
import { SignOut } from "./sign-out";

export const metadata = { title: "Your teams" };

async function create(fd: FormData) {
  "use server";
  const user = await requireUser();
  const name = String(fd.get("name") ?? "").trim();
  const level = String(fd.get("level")) as Level;
  if (!name || !LEVELS.includes(level)) return;
  const team = await createTeam(db, user.id, name.slice(0, 80), level);
  redirect(`/t/${team.id}`);
}

export default async function CoachHome() {
  const user = await requireUser();
  const teams = await teamsForUser(user.id);
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-4xl">Your teams</h1>
        <SignOut />
      </div>
      {teams.length > 0 && (
        <ul className="mb-8 flex flex-col gap-2">
          {teams.map((t) => (
            <li key={t.id}>
              <Link href={`/t/${t.id}`} className="card flex items-center justify-between p-4 hover:border-ink">
                <span className="font-semibold">{t.name}</span>
                <span className="text-right text-sm text-muted">
                  {LEVEL_LABEL[t.level]}                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <form action={create} className="card flex flex-col gap-3 p-4">
        <h2 className="font-semibold">{teams.length ? "Add a team" : "Start your first team"}</h2>
        <div>
          <label className="label" htmlFor="name">
            Team name
          </label>
          <input id="name" name="name" className="input" placeholder="Hawks 7th grade" required maxLength={80} />
        </div>
        <div>
          <label className="label" htmlFor="level">
            Level
          </label>
          <select id="level" name="level" className="input" defaultValue="youth">
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary">Create team</button>
      </form>
    </main>
  );
}
