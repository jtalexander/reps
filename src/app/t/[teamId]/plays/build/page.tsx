import Link from "next/link";
import { isDefense, type PlayData } from "@/domain/play";
import { getPlay, isConverted } from "@/server/plays";
import { requireCoach } from "@/server/teams";
import { getBlocking } from "@/server/blocking";
import { listFormations } from "@/server/formations";
import { emptyPlay } from "@/domain/play";
import { getNaming } from "@/teach/naming";
import { DefenseBuilder } from "./defense-builder";
import { PlayBuilder } from "./play-builder";

export const metadata = { title: "Draw a play" };

/**
 * The play builder: start from a blank lineup or one of the team's formations,
 * drag players, give each one a route or block, and name the play from the
 * team's naming rules. `?play=` edits a drawn or converted play; `?from=`
 * starts a new play from another play's lineup.
 */
export default async function Build({ params, searchParams }: PageProps<"/t/[teamId]/plays/build">) {
  const { teamId } = await params;
  const sp = await searchParams;
  const { team } = await requireCoach(teamId);
  const { naming } = await getNaming(teamId);
  const blocking = await getBlocking(teamId);
  const id = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

  let start: PlayData | null = null;
  let editing: string | null = null;
  const editId = id(sp.play);
  if (editId) {
    const row = await getPlay(teamId, editId);
    if (row?.data && isConverted(row)) {
      start = row.data;
      editing = row.id;
    }
  }
  // a copy to change: the whole play (every job and line), saved as a new play
  const copyId = id(sp.copy);
  if (!start && copyId) {
    const row = await getPlay(teamId, copyId);
    if (row?.data) start = { ...row.data, name: row.data.name && row.data.name !== "unknown" ? `${row.data.name} (copy)` : "unknown", blocking: row.data.blocking ? { ...row.data.blocking, drawn: false } : row.data.blocking };
  }
  // a saved formation: change it (?formation=), start a play from it (?startFormation=), or draw a new one (?newFormation=1)
  const formations = await listFormations(teamId);
  const fEdit = typeof sp.formation === "string" ? formations.find((f) => f.id === sp.formation) : undefined;
  const fStart = typeof sp.startFormation === "string" ? formations.find((f) => f.id === sp.startFormation) : undefined;
  let formationMode: { id?: string; name: string } | null = null;
  if (!start && fEdit) {
    start = { ...emptyPlay("unknown"), formation: { ...emptyPlay().formation, name: fEdit.name }, players: fEdit.players };
    formationMode = { id: fEdit.id, name: fEdit.name };
  } else if (!start && sp.newFormation) {
    // the builder starts from its blank lineup
    formationMode = { name: "" };
  } else if (!start && fStart) start = { ...emptyPlay("unknown"), formation: { ...emptyPlay().formation, name: fStart.name }, players: fStart.players };
  const planId = id(sp.plan);
  const fromId = id(sp.from);
  if (!start && fromId) {
    const row = await getPlay(teamId, fromId);
    // the lineup only: players where they stand, no lines
    if (row?.data)
      start = {
        ...row.data,
        name: "unknown",
        motion: null,
        run_details: null,
        option_details: null,
        pass_details: null,
        coaching_points: [],
        players: row.data.players.map((p) => ({ ...p, assignment_type: "unknown", route: null, block: null, path: null })),
      };
  }
  // a defensive call (new, or one being edited) opens the defense builder
  if (sp.side === "defense" || (start && isDefense(start))) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <Link href={`/t/${teamId}/plays`} className="text-sm text-muted underline">
            Playbook
          </Link>
          <h1 className="text-4xl">{editing ? "Edit call" : "Draw a defensive call"}</h1>
          <p className="text-sm text-muted">Pick the front and coverage and RepWon lines your defense up with their jobs. Drag anyone, draw lines, and tap a defender to change his job.</p>
        </div>
        <DefenseBuilder teamId={teamId} naming={naming} start={start && isDefense(start) ? start : null} playId={start && isDefense(start) ? editing : null} formations={formations.map((f) => ({ id: f.id, name: f.name, players: f.players }))} planId={planId} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/t/${teamId}/plays`} className="text-sm text-muted underline">
          Playbook
        </Link>
        <h1 className="text-4xl">{formationMode ? (formationMode.id ? `Formation: ${formationMode.name}` : "New formation") : editing ? "Edit play" : "Draw a play"}</h1>
        <p className="text-sm text-muted">
          Drag players into place, then draw each line by hand or tap a player to pick his job. RepWon names the play from your naming rules. Save and approve it like any play.
        </p>
      </div>
      <PlayBuilder teamId={teamId} naming={naming} start={start} playId={editing} schemes={blocking.schemes} fronts={blocking.fronts} routeTree={team.routeTree ?? null} formationMode={formationMode} planId={planId} />
    </div>
  );
}
