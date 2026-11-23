import { LEVELS, LEVEL_LABEL } from "@/domain/readiness";
import { TermsSchema } from "@/domain/terms";
import { requireCoach } from "@/server/teams";
import { headers } from "next/headers";
import Link from "next/link";
import { listCoaches } from "@/server/coaches";
import { playerDataCounts } from "@/server/player-data";
import {
  deleteAllPlayersAction,
  newCoachInviteAction,
  removeCoachAction,
  resetJoinCodeAction,
  saveSettingsAction,
  stopCoachInviteAction,
} from "../actions";
import { TermsEditor } from "./terms-editor";

export const metadata = { title: "Settings" };

export default async function Settings({ params, searchParams }: PageProps<"/t/[teamId]/settings">) {
  const { teamId } = await params;
  const { deleted } = await searchParams;
  const { team, role, user } = await requireCoach(teamId);
  const owner = role === "owner";
  const coaches = await listCoaches(teamId);
  const data = await playerDataCounts(teamId);
  const h = await headers();
  const site = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
  const inviteUrl = team.coachInviteCode ? `${site}/coach/join/${team.coachInviteCode}` : null;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-4xl">Settings</h1>
      <section className="card flex flex-col gap-2 p-4">
        <h2 className="font-semibold">Join code</h2>
        <p className="font-mono text-3xl font-bold tracking-[0.3em]">{team.joinCode}</p>
        <p className="text-sm text-muted">Players go to this site, tap &ldquo;I&apos;m a player&rdquo;, and type the code. Resetting it signs every player out; they rejoin with the new code.</p>
        <form action={resetJoinCodeAction.bind(null, teamId)}>
          <button className="btn btn-ghost">Reset code</button>
        </form>
      </section>
      <form action={saveSettingsAction.bind(null, teamId)} className="card flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Team</h2>
        <div>
          <label className="label" htmlFor="name">
            Name
          </label>
          <input id="name" name="name" defaultValue={team.name} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="level">
            Level
          </label>
          <select id="level" name="level" defaultValue={team.level} className="input">
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">
            Youth: 1 read per pass play, basic route names, longer speed-round timer. Middle school: 2 reads. High school: 2 reads plus best throws vs coverages.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="allowFlip" defaultChecked={team.allowFlip} className="h-5 w-5" /> Flip some quiz diagrams so players learn plays from both sides
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="groupFronts" defaultChecked={team.groupFronts} className="h-5 w-5" /> Show a play drawn against several fronts (Veer vs 4-3, vs 5-2…) as one play
          with a version for each front
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="shareAnswers" defaultChecked={team.shareAnswers} className="mt-0.5 h-5 w-5" />
          <span>
            Let my approved answers help Reps suggest better answers to other coaches. Reps learns the football (how a concept is run), never your team&apos;s name,
            players or results, and suggestions never say where they came from.
          </span>
        </label>
        <button className="btn btn-primary self-start">Save</button>
      </form>
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Coaches</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {coaches.map((c) => (
            <li key={c.userId} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1.5">
              <span>
                <b>{c.name}</b> <span className="text-muted">{c.email}</span> {c.role === "owner" && <span className="text-xs text-muted">· owner</span>}
                {c.userId === user.id && <span className="text-xs text-muted"> · you</span>}
              </span>
              {owner && c.role === "coach" && (
                <form action={removeCoachAction.bind(null, teamId, c.userId)}>
                  <button className="text-sm text-muted underline">Remove</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {owner ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">
              Add assistant coaches: send them this link. They sign in or make an account, and they&apos;re on the team with everything you can do except manage coaches
              and delete all player data.
            </p>
            {inviteUrl ? (
              <>
                <p className="border border-line bg-card px-3 py-2 font-mono text-sm break-all select-all">{inviteUrl}</p>
                <div className="flex flex-wrap gap-3">
                  <form action={newCoachInviteAction.bind(null, teamId)}>
                    <button className="text-sm underline">Make a new link (the old one stops working)</button>
                  </form>
                  <form action={stopCoachInviteAction.bind(null, teamId)}>
                    <button className="text-sm text-muted underline">Turn the link off</button>
                  </form>
                </div>
              </>
            ) : (
              <form action={newCoachInviteAction.bind(null, teamId)}>
                <button className="btn btn-outline">Make an invite link</button>
              </form>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">The team&apos;s owner adds and removes coaches.</p>
        )}
      </section>

      <section id="players" className="card flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Player data</h2>
        <p className="text-sm">
          For each player Reps keeps only what coaching needs: the name and positions you enter (first name and last initial is enough), their answers and practice
          schedule, lessons they&apos;ve read, questions they ask the playbook and questions they flag. No email, password, birthday or contact information.{" "}
          <Link className="underline" href="/privacy">
            What players and parents see
          </Link>
        </p>
        <p className="text-sm text-muted">
          {data.players} player{data.players === 1 ? "" : "s"} on file{data.removed ? `, ${data.removed} removed from the roster but still holding their answers` : ""}. To
          delete one player and everything about them, use <b>Delete for good</b> on the Roster.
        </p>
        {typeof deleted === "string" && (
          <p className={`px-3 py-2 text-sm ${deleted === "no" ? "bg-warn-bg text-warn" : "bg-ok-bg text-ok"}`}>
            {deleted === "no" ? "Nothing was deleted: type DELETE to confirm." : `Deleted ${deleted} players and all their data.`}
          </p>
        )}
        {owner && data.players > 0 && (
          <form action={deleteAllPlayersAction.bind(null, teamId)} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label" htmlFor="confirm">
                Delete every player on this team and all their data. Type DELETE
              </label>
              <input id="confirm" name="confirm" className="input w-40" autoComplete="off" />
            </div>
            <button className="btn btn-outline text-bad">Delete all player data</button>
          </form>
        )}
      </section>

      <TermsEditor teamId={teamId} initial={TermsSchema.parse(team.terms ?? {})} />
    </div>
  );
}
