import Link from "next/link";
import { callKey, splitCall } from "@/domain/calling";
import { filterFrom, filterQuery, fits } from "@/domain/facets";
import { cleanTree } from "@/domain/route-tree";
import { TermsSchema } from "@/domain/terms";
import { bandOf } from "@/domain/wristband";
import { getPlan, installNameFor } from "@/server/game-plans";
import { playbookPlays } from "@/server/playbook";
import { requireCoach } from "@/server/teams";
import { ensureNumbers, getWristband } from "@/server/wristband";
import { WristbandBuilder, type BandCall } from "./wristband-client";

export const metadata = { title: "Wristband" };

/**
 * Wristband inserts made from the install, a game plan or any set of plays
 * found on the Playbook: band setups for each coach, how plays are called
 * with each band, a numbered card for the QB and coaches, a card for each
 * position with only his job, signals, and a call sheet with the same numbers.
 */
export default async function WristbandPage({ params, searchParams }: PageProps<"/t/[teamId]/plays/wristband">) {
  const { teamId } = await params;
  const sp = await searchParams;
  const { team } = await requireCoach(teamId);
  const plan = typeof sp.plan === "string" ? await getPlan(teamId, sp.plan) : null;
  const all = await playbookPlays(teamId);

  let rows: typeof all;
  let title: string;
  let from: string;
  let back: { href: string; label: string };
  const filter = filterFrom(sp);
  const q = typeof sp.q === "string" ? sp.q : "";
  const query = filterQuery(filter, q);
  if (plan) {
    const byId = new Map(all.map((r) => [r.id, r]));
    rows = plan.playIds.map((id) => byId.get(id)).filter((r): r is (typeof all)[number] => Boolean(r));
    title = installNameFor(plan);
    from = `the game plan vs ${plan.opponent}`;
    back = { href: `/t/${teamId}/gameplan?plan=${plan.id}`, label: "Back to the game plan" };
  } else {
    rows = all.filter((r) => fits(r.facets, r.name, filter, q));
    const installOnly = filter.install?.length === 1 && filter.install[0] === "in" && Object.keys(filter).length === 1 && !q;
    title = installOnly ? team.installName || "This week's install" : team.name;
    from = installOnly ? "this week's install" : query ? "your Playbook filter" : "your whole playbook";
    back = installOnly ? { href: `/t/${teamId}/install`, label: "Back to the install" } : { href: `/t/${teamId}/plays${query ? `?${query}` : ""}`, label: "Back to the Playbook" };
  }

  const calls: BandCall[] = rows.map((r) => {
    const s = splitCall(r.name, r.facets.formation?.[0]?.value ?? null);
    return { id: r.id, name: r.name, data: r.data, formation: s.formation, play: s.play };
  });
  const before = await getWristband(teamId);
  const wristband = await ensureNumbers(
    teamId,
    calls.map((c) => callKey(c.id, c.play, before.numbersBy)),
  );
  const band = bandOf(wristband, typeof sp.band === "string" ? sp.band : null);
  const terms = TermsSchema.safeParse(team.terms);
  const tree = team.routeTree ? cleanTree(team.routeTree) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="no-print">
        <Link href={back.href} className="text-sm text-muted underline">
          {back.label}
        </Link>
        <h1 className="text-4xl">Wristband</h1>
        <p className="text-sm text-muted">
          {calls.length} call{calls.length === 1 ? "" : "s"} from {from}. Every call keeps its number from week to week, so players don&apos;t relearn the band.
        </p>
      </div>
      {calls.length === 0 ? (
        <p className="card p-6 text-center text-muted">
          No plays here yet.{" "}
          <Link href={`/t/${teamId}/plays`} className="underline">
            Find some on the Playbook
          </Link>
          .
        </p>
      ) : (
        <WristbandBuilder key={`${wristband.numbersBy}:${band.id}`} teamId={teamId} title={title} calls={calls} initial={wristband} bandId={band.id} terms={terms.success ? terms.data : null} tree={tree} />
      )}
    </div>
  );
}
