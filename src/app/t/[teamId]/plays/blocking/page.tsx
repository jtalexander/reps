import Link from "next/link";
import { getBlocking } from "@/server/blocking";
import { requireCoach } from "@/server/teams";
import { SchemeEditor } from "./scheme-editor";

export const metadata = { title: "Blocking schemes" };

/**
 * The team's run blocking: each scheme's rule for every blocker, set once and
 * used on every play that runs it, previewed against any front.
 */
export default async function BlockingSchemes({ params, searchParams }: PageProps<"/t/[teamId]/plays/blocking">) {
  const { teamId } = await params;
  const sp = await searchParams;
  await requireCoach(teamId);
  const { schemes, fronts } = await getBlocking(teamId);
  const pick = typeof sp.scheme === "string" && schemes.some((s) => s.key === sp.scheme) ? sp.scheme : schemes[0]!.key;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/t/${teamId}/plays`} className="text-sm text-muted underline">
          Playbook
        </Link>
        <h1 className="text-4xl">Blocking schemes</h1>
        <p className="text-sm text-muted">
          Give each blocker his rule once. Reps works out who he blocks against every front, on every play that runs the scheme. Fix any single play in the builder.
        </p>
      </div>
      <SchemeEditor teamId={teamId} schemes={schemes} fronts={fronts} initial={pick} />
    </div>
  );
}
