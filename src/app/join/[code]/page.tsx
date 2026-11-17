import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { players, teams } from "@/db/schema";
import { setPlayerCookie } from "@/server/player-session";
import { normalizeJoinCode } from "@/server/teams";

export const metadata = { title: "Who are you?" };

async function pick(code: string, fd: FormData) {
  "use server";
  const [team] = await db.select().from(teams).where(eq(teams.joinCode, normalizeJoinCode(code)));
  if (!team) redirect("/join?e=1");
  const playerId = String(fd.get("playerId") ?? "");
  const position = String(fd.get("position") ?? "").toUpperCase().slice(0, 4);
  const [player] = await db
    .select()
    .from(players)
    .where(and(eq(players.teamId, team.id), eq(players.id, playerId), eq(players.active, true)));
  if (!player) redirect(`/join/${code}`);
  await setPlayerCookie({ playerId: player.id, teamId: team.id, v: team.joinCodeVersion, position: position || player.positions[0] || "QB" });
  redirect("/study");
}

export default async function Pick({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  const [team] = await db.select().from(teams).where(eq(teams.joinCode, normalizeJoinCode(code)));
  if (!team) notFound();
  const roster = await db
    .select()
    .from(players)
    .where(and(eq(players.teamId, team.id), eq(players.active, true)))
    .orderBy(asc(players.name));
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <Link href="/join" className="text-sm text-muted underline">
        Different code
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{team.name}</h1>
      <p className="mb-4 text-muted">Tap your name, then your position.</p>
      {roster.length === 0 && <p className="card p-4 text-sm text-muted">Your coach hasn&apos;t added players yet.</p>}
      <ul className="flex flex-col gap-2">
        {roster.map((p) => (
          <li key={p.id} className="card p-3">
            <div className="mb-2 font-semibold">
              {p.name} {p.jersey && <span className="text-muted">#{p.jersey}</span>}
            </div>
            <form action={pick.bind(null, code)} className="flex flex-wrap gap-2">
              <input type="hidden" name="playerId" value={p.id} />
              {(p.positions.length ? p.positions : ["QB", "RB", "WR"]).map((pos) => (
                <button key={pos} name="position" value={pos} className="btn btn-accent min-w-16">
                  {pos}
                </button>
              ))}
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
