import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { normalizeJoinCode } from "@/server/teams";

export const metadata = { title: "Join your team" };

async function go(fd: FormData) {
  "use server";
  const code = normalizeJoinCode(String(fd.get("code") ?? ""));
  if (!code) redirect("/join?e=1");
  const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.joinCode, code));
  if (!team) redirect("/join?e=1");
  redirect(`/join/${code}`);
}

export default async function Join({ searchParams }: PageProps<"/join">) {
  const { e } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-4xl">Join your team</h1>
      <form action={go} className="flex flex-col gap-3">
        <label className="label" htmlFor="code">
          Team code from your coach
        </label>
        <input id="code" name="code" className="input text-center font-mono text-2xl tracking-[0.3em] uppercase" maxLength={8} autoComplete="off" autoCapitalize="characters" required />
        {e && <p className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">That code didn&apos;t match a team. Check it with your coach.</p>}
        <button className="btn btn-accent text-base">Next</button>
      </form>
      <p className="mt-auto pt-6 text-xs text-muted">
        RepWon saves your name, position and answers so your coach can see how you&apos;re doing.{" "}
        <a className="underline" href="/privacy">
          Privacy
        </a>
      </p>
    </main>
  );
}
