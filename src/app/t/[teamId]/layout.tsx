import Link from "next/link";
import { requireCoach } from "@/server/teams";
import { TeamNav } from "./team-nav";

export default async function TeamLayout({ children, params }: LayoutProps<"/t/[teamId]">) {
  const { teamId } = await params;
  const { team } = await requireCoach(teamId);
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 bg-brand text-brand-ink">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href={`/t/${team.id}`} className="truncate font-bold">
            {team.name}
          </Link>
          <Link href="/coach" className="shrink-0 text-xs opacity-80 underline">
            Teams
          </Link>
        </div>
        <TeamNav teamId={team.id} />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
