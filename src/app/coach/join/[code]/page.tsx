import Link from "next/link";
import { redirect } from "next/navigation";
import { joinAsCoach } from "@/server/coaches";
import { requireUser } from "@/server/teams";

export const metadata = { title: "Join as a coach" };

/** An assistant coach's invite link: sign in (or make an account), then you're on the team. */
export default async function CoachJoin({ params }: PageProps<"/coach/join/[code]">) {
  const { code } = await params;
  const user = await requireUser(`/coach/join/${encodeURIComponent(code)}`);
  const teamId = await joinAsCoach(code, user.id);
  if (teamId) redirect(`/t/${teamId}`);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 py-10">
      <h1 className="text-4xl">That link doesn&apos;t work</h1>
      <p className="text-sm text-muted">The coach who sent it may have made a new one. Ask them for the current link.</p>
      <Link href="/coach" className="btn btn-primary self-start">
        My teams
      </Link>
    </main>
  );
}
