import Link from "next/link";
import { TermsSchema } from "@/domain/terms";
import { requirePlayer } from "@/server/player-session";
import { quizPlays } from "@/server/quiz";
import { installPlayIds } from "@/teach/install";
import { PlayCards } from "./play-cards";

export const metadata = { title: "My plays" };

export default async function MyPlays({ searchParams }: PageProps<"/study/plays">) {
  const { play, week: onlyWeek } = await searchParams;
  const me = await requirePlayer();
  const week = await installPlayIds(me.team.id);
  const approved = await quizPlays(me.team.id);
  // this week's plays first (or only them)
  const plays = onlyWeek === "1" && approved.some((p) => week.has(p.id)) ? approved.filter((p) => week.has(p.id)) : [...approved].sort((a, b) => Number(week.has(b.id)) - Number(week.has(a.id)));
  const title = plays.length < approved.length ? `This week · ${me.position}` : `My plays · ${me.position}`;
  const start = Math.max(0, plays.findIndex((p) => p.id === play));
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 py-4">
      <Link href="/study" className="text-sm text-muted underline">
        Back
      </Link>
      <h1 className="text-3xl">{title}</h1>
      {plays.length === 0 ? (
        <p className="card p-4 text-sm text-muted">No approved plays yet.</p>
      ) : (
        <PlayCards plays={plays.map((p) => ({ id: p.id, data: p.data }))} start={start} position={me.position} terms={TermsSchema.parse(me.team.terms ?? {})} />
      )}
    </main>
  );
}
