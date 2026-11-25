import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { plays } from "@/db/schema";
import { requireCoach } from "@/server/teams";
import { OldPlays } from "./old-plays";
import { PagesView } from "./pages-view";
import { PlaysView } from "./plays-view";

export const metadata = { title: "Playbook" };

const tab = (on: boolean) => `px-3 py-1.5 text-sm font-semibold ${on ? "bg-brand text-brand-ink" : "border border-line"}`;

/**
 * The playbook: every play, findable by anything it is (the Plays view), or
 * the coach's own pages with every drawing RepWon found on them (Pages).
 */
export default async function Playbook({ params, searchParams }: PageProps<"/t/[teamId]/plays">) {
  const { teamId } = await params;
  const sp = await searchParams;
  await requireCoach(teamId);
  if (sp.view === "old") return <OldPlays teamId={teamId} sp={sp} />;

  const [c] = await db
    .select({ n: sql<number>`count(*) filter (where jsonb_array_length(coalesce(${plays.data}->'players', '[]'::jsonb)) > 0)::int` })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false)));
  const pages = sp.view === "pages" || !c?.n;

  const header = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-4xl">Playbook</h1>
        <span className="flex flex-wrap gap-3 text-sm font-semibold">
          <Link href={`/t/${teamId}/plays/build`} className="underline">
            Draw a play
          </Link>
          <Link href={`/t/${teamId}/plays/build?side=defense`} className="underline">
            Draw a defensive call
          </Link>
          <Link href={`/t/${teamId}/plays/formations`} className="underline">
            Formations
          </Link>
          <Link href={`/t/${teamId}/plays/blocking`} className="underline">
            Blocking schemes
          </Link>
          <Link href={`/t/${teamId}/plays/naming`} className="underline">
            Naming rules
          </Link>
        </span>
      </div>
      {(c?.n ?? 0) > 0 && (
        <div className="flex self-start" role="group" aria-label="Show">
          <Link href={`/t/${teamId}/plays`} className={tab(!pages)} aria-pressed={!pages}>
            Plays
          </Link>
          <Link href={`/t/${teamId}/plays?view=pages`} className={tab(pages)} aria-pressed={pages}>
            Pages
          </Link>
        </div>
      )}
    </div>
  );

  return pages ? <PagesView teamId={teamId} sp={sp} header={header} /> : <PlaysView teamId={teamId} sp={sp} header={header} />;
}
