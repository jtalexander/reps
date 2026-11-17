import Link from "next/link";
import { redirect } from "next/navigation";
import { currentPlayer } from "@/server/player-session";

export default async function Home() {
  if (await currentPlayer()) redirect("/study");
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-12">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Reps</h1>
        <p className="mt-2 text-muted">Your playbook, turned into study and quizzes for every position.</p>
      </div>
      <div className="flex flex-col gap-3">
        <Link href="/join" className="btn btn-accent text-base">
          I&apos;m a player — join my team
        </Link>
        <Link href="/coach" className="btn btn-ghost text-base">
          Coach sign in
        </Link>
      </div>
    </main>
  );
}
