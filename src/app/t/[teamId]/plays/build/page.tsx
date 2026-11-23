import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { plays } from "@/db/schema";
import type { PlayData } from "@/domain/play";
import { getPlay, isConverted } from "@/server/plays";
import { requireCoach } from "@/server/teams";
import { getNaming } from "@/teach/naming";
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
  await requireCoach(teamId);
  const { naming } = await getNaming(teamId);
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
  // formations the team already has as real plays (drawings with no lines)
  const lineups = await db
    .select({ id: plays.id, name: plays.name })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false), eq(plays.extraction, "done"), sql`${plays.aiRaw} is not null`, eq(plays.playType, "unknown")))
    .orderBy(asc(plays.name))
    .limit(300);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/t/${teamId}/plays`} className="text-sm text-muted underline">
          Playbook
        </Link>
        <h1 className="text-4xl">{editing ? "Edit play" : "Draw a play"}</h1>
        <p className="text-sm text-muted">
          Drag players into place. Tap one to give him a route, block or carry. Build the name from your naming rules, then save and approve it like any play.
        </p>
      </div>
      <PlayBuilder teamId={teamId} naming={naming} start={start} playId={editing} lineups={lineups} fromId={fromId} />
    </div>
  );
}
