import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { plays } from "@/db/schema";
import { TermsSchema } from "@/domain/terms";
import { hasApiKey } from "@/ingest/extract";
import { conceptsForTeam, getPlay, isBuilt, isConverted } from "@/server/plays";
import { requireCoach } from "@/server/teams";
import { startBlankAction } from "../../actions";
import { isDefense } from "@/domain/play";
import { playLooks } from "@/server/matchups";
import { DefenseReview } from "./defense-review";
import { GoodVs } from "./good-vs";
import { BlockingView } from "./blocking-view";
import { getBlocking } from "@/server/blocking";
import { PlayReview } from "./play-review";

export const metadata = { title: "Review play" };

export default async function PlayPage({ params }: PageProps<"/t/[teamId]/plays/[playId]">) {
  const { teamId, playId } = await params;
  const { team } = await requireCoach(teamId);
  const play = await getPlay(teamId, playId);
  if (!play) notFound();
  const siblings = await db
    .select({ id: plays.id, status: plays.status })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false)))
    .orderBy(asc(plays.sourcePage), asc(plays.boxIndex), asc(plays.createdAt));
  const idx = siblings.findIndex((s) => s.id === playId);
  const nextNeeding = [...siblings.slice(idx + 1), ...siblings.slice(0, idx)].find((s) => s.status !== "approved");
  const cropUrl = play.cropKey ? `/media/${play.cropKey.split("/").map(encodeURIComponent).join("/")}` : null;

  if (!play.data) {
    return (
      <div className="flex flex-col gap-4">
        <Link href={`/t/${teamId}/plays`} className="text-sm text-muted underline">
          Playbook
        </Link>
        {cropUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cropUrl} alt="Original play" className="card max-w-2xl" />
        )}
        <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
          {play.extraction === "failed"
            ? `Reps couldn't read this play. ${play.extractionError ?? ""}`
            : play.extraction === "not_a_play"
              ? "This box didn't look like a play, so it was skipped."
              : hasApiKey()
                ? "This play hasn't been read yet. Go back to the upload and read the remaining plays."
                : "No API key on the server yet, so plays are entered by hand."}
        </p>
        <form action={startBlankAction.bind(null, teamId, playId)}>
          <button className="btn btn-primary">Fill this play in by hand</button>
        </form>
      </div>
    );
  }

  const looks = await playLooks(teamId, playId);
  const goodVs = looks && <GoodVs teamId={teamId} playId={playId} initial={looks} />;
  if (isDefense(play.data))
    return (
      <div className="flex flex-col gap-4">
        <DefenseReview teamId={teamId} playId={playId} initial={play.data} status={play.status} cropUrl={cropUrl} nextId={nextNeeding?.id ?? null} />
        {goodVs}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
    <PlayReview
      teamId={teamId}
      playId={playId}
      level={team.level}
      initial={play.data}
      status={play.status}
      cropUrl={cropUrl}
      sourceText={play.sourceText}
      concepts={(await conceptsForTeam(teamId)).map((c) => ({ key: c.key, name: c.name, kind: c.kind }))}
      terms={TermsSchema.parse(team.terms ?? {})}
      position={{ index: idx + 1, total: siblings.length }}
      nextId={nextNeeding?.id ?? null}
      converted={isConverted(play)}
      built={isBuilt(play)}
    />
    {play.data.blocking && <BlockingView teamId={teamId} playId={playId} data={play.data} fronts={(await getBlocking(teamId)).fronts} />}
    {goodVs}
    </div>
  );
}
