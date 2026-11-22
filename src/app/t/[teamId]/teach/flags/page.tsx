import Link from "next/link";
import { requireCoach } from "@/server/teams";
import { pageRefs } from "@/teach/page-images";
import { openFlags } from "@/teach/service";
import { FlagList } from "./flag-list";

export const metadata = { title: "Flagged questions" };

export default async function Flags({ params }: PageProps<"/t/[teamId]/teach/flags">) {
  const { teamId } = await params;
  await requireCoach(teamId);
  const rows = await openFlags(teamId);
  // one entry per question, with every player's note
  const byQ = new Map<string, { row: (typeof rows)[number]; notes: Array<{ player: string; note: string | null }> }>();
  for (const r of rows) {
    const e = byQ.get(r.question.id) ?? { row: r, notes: [] };
    e.notes.push({ player: r.player, note: r.flag.note });
    byQ.set(r.question.id, e);
  }
  const refs = await pageRefs(teamId);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/t/${teamId}/teach`} className="text-sm text-muted underline">
          Teach
        </Link>
        <h1 className="text-4xl">Flagged by players</h1>
        <p className="mt-1 text-sm text-muted">Questions players think are wrong. Keep it, fix it, or take it off.</p>
      </div>
      <FlagList
        teamId={teamId}
        pages={refs}
        items={[...byQ.values()].map(({ row, notes }) => ({
          notes,
          topic: row.topic,
          status: row.question.status,
          item: {
            type: "question" as const,
            id: row.question.id,
            topicId: row.question.topicId,
            question: {
              prompt: row.question.prompt,
              format: row.question.format,
              data: row.question.data,
              explanation: row.question.explanation,
              audience: row.question.audience,
              sourcePages: row.question.sourcePages,
              image: row.question.image ?? null,
            },
          },
        }))}
      />
    </div>
  );
}
