import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getOpponent, getScoutPlay } from "@/breakdown/scout/service";
import { emptyPlay, isDefense, type PlayData, type Player } from "@/shared/football";
import { getBlocking, getNaming, listFormations, requireCoach } from "@/shared/teams";
import { DefenseBuilder } from "../../../plays/build/defense-builder";
import { PlayBuilder } from "../../../plays/build/play-builder";
import { saveScoutPlayAction } from "../../actions";

export const metadata = { title: "Draw a scout play" };

/** A lineup handed over from the film marking page: letter, yards from the ball, on the line or off. */
const Lineup = z.array(z.tuple([z.string().max(4), z.number().min(-40).max(40), z.number().min(-20).max(5), z.boolean()])).min(5).max(12);

function lineupFrom(raw: unknown): Player[] | null {
  if (typeof raw !== "string") return null;
  try {
    return Lineup.parse(JSON.parse(raw)).map(([id, x, y, on]) => ({
      id,
      position: id,
      x,
      y,
      on_ball: on,
      side: x < -1 ? ("left" as const) : x > 1 ? ("right" as const) : ("middle" as const),
      split: null,
      assignment_type: "unknown" as const,
      route: null,
      block: null,
      path: null,
      notes: null,
    }));
  } catch {
    return null;
  }
}

/**
 * The play builder, saving into an opponent's scout playbook instead of ours.
 * `?play=` edits one of their plays; `?lineup=` starts from a snap marked on
 * film; `?side=defense` draws one of their defensive calls.
 */
export default async function DrawScoutPlay({ params, searchParams }: PageProps<"/t/[teamId]/scout/[opponentId]/draw">) {
  const { teamId, opponentId } = await params;
  const sp = await searchParams;
  const { team } = await requireCoach(teamId);
  const opponent = await getOpponent(teamId, opponentId);
  if (!opponent) notFound();
  const [{ naming }, blocking, formations] = await Promise.all([getNaming(teamId), getBlocking(teamId), listFormations(teamId)]);

  let start: PlayData | null = null;
  let editing: string | null = null;
  if (typeof sp.play === "string") {
    const row = await getScoutPlay(teamId, sp.play);
    if (row && row.opponentId === opponentId && !row.archived) {
      start = row.data;
      editing = row.id;
    }
  }
  const fromFilm = !start ? lineupFrom(sp.lineup) : null;
  if (fromFilm) start = { ...emptyPlay("unknown"), players: fromFilm };

  const back = `/t/${teamId}/scout/${opponentId}`;
  const save = saveScoutPlayAction.bind(null, teamId, opponentId, fromFilm ? "film" : "drawn");
  const defense = sp.side === "defense" || (start !== null && isDefense(start));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={back} className="text-sm text-muted underline">
          {opponent.name} {opponent.season}
        </Link>
        <h1 className="text-4xl">{editing ? "Edit their play" : defense ? "Draw their defensive call" : "Draw their play"}</h1>
        <p className="max-w-prose text-sm text-muted">
          {fromFilm
            ? "The lineup came from the snap you marked on film. Draw what each player did, name it, and save it to their playbook."
            : "Draw it the way they run it. It saves to their scout playbook, not yours. Formation names come from your own naming, so they will be close but not exact."}
        </p>
      </div>
      {defense ? (
        <DefenseBuilder teamId={teamId} naming={naming} start={start && isDefense(start) ? start : null} playId={editing} formations={formations.map((f) => ({ id: f.id, name: f.name, players: f.players }))} save={save} doneHref={back} />
      ) : (
        <PlayBuilder teamId={teamId} naming={naming} start={start} playId={editing} schemes={blocking.schemes} fronts={blocking.fronts} routeTree={team.routeTree ?? null} formationMode={null} save={save} doneHref={back} />
      )}
    </div>
  );
}
