import Link from "next/link";
import { TermsSchema } from "@/domain/terms";
import { requirePlayer } from "@/server/player-session";
import { quizPlays } from "@/server/quiz";
import { PlayCards } from "./play-cards";

export const metadata = { title: "My plays" };

export default async function MyPlays() {
  const me = await requirePlayer();
  const plays = await quizPlays(me.team.id);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 py-4">
      <Link href="/study" className="text-sm text-muted underline">
        Back
      </Link>
      <h1 className="text-3xl">My plays · {me.position}</h1>
      {plays.length === 0 ? (
        <p className="card p-4 text-sm text-muted">No approved plays yet.</p>
      ) : (
        <PlayCards plays={plays.map((p) => ({ id: p.id, data: p.data }))} position={me.position} terms={TermsSchema.parse(me.team.terms ?? {})} />
      )}
    </main>
  );
}
