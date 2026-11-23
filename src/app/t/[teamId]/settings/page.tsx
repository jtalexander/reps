import { LEVELS, LEVEL_LABEL } from "@/domain/readiness";
import { TermsSchema } from "@/domain/terms";
import { requireCoach } from "@/server/teams";
import { resetJoinCodeAction, saveSettingsAction } from "../actions";
import { TermsEditor } from "./terms-editor";

export const metadata = { title: "Settings" };

export default async function Settings({ params }: PageProps<"/t/[teamId]/settings">) {
  const { teamId } = await params;
  const { team } = await requireCoach(teamId);
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
        <button className="btn btn-primary self-start">Save</button>
      </form>
      <TermsEditor teamId={teamId} initial={TermsSchema.parse(team.terms ?? {})} />
    </div>
  );
}
