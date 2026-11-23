import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { studySets } from "@/db/schema";
import { inGroups, POSITION_GROUPS } from "@/domain/positions";
import { requirePlayer } from "@/server/player-session";
import { pageRefs } from "@/teach/page-images";
import { practiceSet } from "@/teach/service";
import { audienceOf } from "@/teach/types";
import { QuestionRunner } from "@/components/question-runner";

export const metadata = { title: "Practice" };

/** Ten questions due or new, from everything approved, or from one assigned study set (?set=). */
export default async function Practice({ searchParams }: PageProps<"/study/practice">) {
  const { set: setId } = await searchParams;
  const me = await requirePlayer();
  const group = audienceOf(me.position, POSITION_GROUPS);
  const [set] =
    typeof setId === "string" && /^[0-9a-f-]{36}$/i.test(setId)
      ? await db.select().from(studySets).where(and(eq(studySets.teamId, me.team.id), eq(studySets.id, setId)))
      : [];
  const assigned = set && set.topicIds.length > 0 && inGroups(me.position, set.positions) ? set : null;
  const qs = await practiceSet(me.team.id, me.player.id, group, 10, assigned?.topicIds);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-5">
      <Link href="/study" className="text-sm text-muted underline">
        Back
      </Link>
      <div>
        {assigned && <div className="eyebrow">Study set</div>}
        <h1 className="text-4xl">{assigned?.name ?? "Practice"}</h1>
      </div>
      {qs.length === 0 ? (
        <p className="card p-4 text-sm text-muted">No approved questions for your position {assigned ? "in this set" : ""} yet.</p>
      ) : (
        <QuestionRunner questions={qs} pages={await pageRefs(me.team.id)} mode="practice" />
      )}
    </main>
  );
}
