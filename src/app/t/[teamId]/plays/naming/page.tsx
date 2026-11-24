import Link from "next/link";
import { requestOrigin } from "@/lib/origin";
import { requireCoach } from "@/server/teams";
import { getNaming } from "@/teach/naming";
import { ensureNamingDraft } from "@/teach/naming-auto";
import { NamingCard } from "./naming-card";
import { NamingEditor } from "./naming-editor";

export const metadata = { title: "Naming rules" };

/** The team's naming rules: Reps drafts them from the playbook, the coach fixes and confirms. */
export default async function NamingPage({ params }: PageProps<"/t/[teamId]/plays/naming">) {
  const { teamId } = await params;
  await requireCoach(teamId);
  const status = await ensureNamingDraft(teamId, await requestOrigin());
  const { naming, approvedAt } = await getNaming(teamId);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/t/${teamId}/plays`} className="text-sm text-muted underline">
          Playbook
        </Link>
        <h1 className="text-4xl">Naming rules</h1>
        <p className="text-sm text-muted">
          How your offense names things: position letters, formation words, tags, motions, plays and the order of a call. Reps uses these to name players and plays when
          it turns your drawings into plays.
        </p>
      </div>
      {naming && !approvedAt && (
        <Link href={`/t/${teamId}/plays/naming/check`} className="btn btn-primary self-start">
          Check it step by step
        </Link>
      )}
      {!naming && status.state === "drafting" ? (
        <NamingCard teamId={teamId} status={status} />
      ) : (
        <NamingEditor teamId={teamId} initial={naming} approvedAt={approvedAt ? approvedAt.toISOString() : null} />
      )}
    </div>
  );
}
