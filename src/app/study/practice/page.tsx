import Link from "next/link";
import { POSITION_GROUPS } from "@/domain/positions";
import { requirePlayer } from "@/server/player-session";
import { pageRefs } from "@/teach/page-images";
import { practiceSet } from "@/teach/service";
import { audienceOf } from "@/teach/types";
import { QuestionRunner } from "@/components/question-runner";

export const metadata = { title: "Practice" };

export default async function Practice() {
  const me = await requirePlayer();
  const group = audienceOf(me.position, POSITION_GROUPS);
  const qs = await practiceSet(me.team.id, me.player.id, group, 10);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-5">
      <Link href="/study" className="text-sm text-muted underline">
        Back
      </Link>
      <h1 className="text-4xl">Practice</h1>
      {qs.length === 0 ? <p className="card p-4 text-sm text-muted">No approved questions for your position yet.</p> : <QuestionRunner questions={qs} pages={await pageRefs(me.team.id)} mode="practice" />}
    </main>
  );
}
