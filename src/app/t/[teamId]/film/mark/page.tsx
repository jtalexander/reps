import { MarkClient } from "@/breakdown/marking/mark-client";
import { listOpponents } from "@/breakdown/scout/service";
import { listFormations, requireCoach } from "@/shared/teams";

export const metadata = { title: "Mark a snap" };

/**
 * Breakdown, milestone 0: mark pre-snap frames by hand and see whether the
 * formation rules read them right. An internal test page, not linked from the
 * coach's menu. The film stays in the browser; nothing is uploaded.
 */
export default async function MarkSnaps({ params }: PageProps<"/t/[teamId]/film/mark">) {
  const { teamId } = await params;
  await requireCoach(teamId);
  const [formations, opponents] = await Promise.all([listFormations(teamId), listOpponents(teamId)]);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-4xl">Mark a snap</h1>
        <p className="max-w-prose text-sm text-muted">
          A test of the formation rules. Open a game video from this computer, stop just before the snap, mark a few painted spots on the field, the ball and the eleven on offense, then say what the formation really was. The video is never uploaded.
        </p>
      </div>
      <MarkClient teamId={teamId} opponents={opponents.map((o) => ({ id: o.id, label: `${o.name} ${o.season}` }))} formations={formations.map((f) => ({ name: f.name, players: f.players.map(({ id, x, y }) => ({ id, x, y })) }))} />
    </div>
  );
}
