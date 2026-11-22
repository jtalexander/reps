import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { topics } from "@/db/teach-schema";
import { POSITION_GROUPS } from "@/domain/positions";
import { requirePlayer } from "@/server/player-session";
import { pageRefs } from "@/teach/page-images";
import { approvedFor, practiceSet } from "@/teach/service";
import { audienceOf } from "@/teach/types";
import { LearnFlow } from "./learn-flow";

export const metadata = { title: "Learn" };

export default async function Learn({ params }: PageProps<"/study/learn/[topicId]">) {
  const { topicId } = await params;
  const me = await requirePlayer();
  if (!/^[0-9a-f-]{36}$/i.test(topicId)) notFound();
  const [topic] = await db.select().from(topics).where(and(eq(topics.teamId, me.team.id), eq(topics.id, topicId)));
  if (!topic) notFound();
  const group = audienceOf(me.position, POSITION_GROUPS);
  const { lessons } = await approvedFor(me.team.id, group);
  const mine = lessons.filter((l) => l.topicId === topicId).sort((a, b) => (a.audience === "ALL" ? -1 : 1) - (b.audience === "ALL" ? -1 : 1));
  const check = await practiceSet(me.team.id, me.player.id, group, 4, topicId);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-5">
      <Link href="/study" className="text-sm text-muted underline">
        Back
      </Link>
      <h1 className="text-4xl">{topic.name}</h1>
      <LearnFlow
        lessons={mine.map((l) => ({ id: l.id, title: l.title, body: l.body, audience: l.audience, sourcePages: l.sourcePages }))}
        check={check}
        pages={await pageRefs(me.team.id)}
      />
    </main>
  );
}
