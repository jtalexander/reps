import Link from "next/link";
import { requireCoach } from "@/server/teams";
import { TeamNav } from "./team-nav";

export default async function TeamLayout({ children, params }: LayoutProps<"/t/[teamId]">) {
  const { teamId } = await params;
  const { team } = await requireCoach(teamId);
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pt-3 pb-2">
          <Link href={`/t/${team.id}`} className="flex min-w-0 flex-col leading-none">
            <span className="truncate font-display text-xl font-black tracking-wide uppercase">{team.name}</span>
            <span className="font-display text-sm font-black tracking-wide text-brand uppercase">RepWon Install</span>
          </Link>
          <Link href="/coach" className="shrink-0 font-label text-xs font-bold tracking-widest text-muted uppercase hover:text-brand">
            Teams
          </Link>
        </div>
        <TeamNav teamId={team.id} />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
