import Link from "next/link";
import { lookLabel } from "@/domain/matchups";
import { getPlan, installNameFor, listPlans, planPlays, planSuggestions } from "@/server/game-plans";
import { conceptsForTeam } from "@/server/plays";
import { playbookPlays } from "@/server/playbook";
import { requireCoach } from "@/server/teams";
import { NewPlan, PlanEditor } from "./plan-client";
import { QuickLook } from "./quick-look";

export const metadata = { title: "Game plan" };

/**
 * Game plans, one per opponent: what they show, our plays built for it, plays
 * picked from anywhere or drawn new, sent to the players as the week's install.
 */
export default async function GamePlans({ params, searchParams }: PageProps<"/t/[teamId]/gameplan">) {
  const { teamId } = await params;
  const sp = await searchParams;
  await requireCoach(teamId);
  const planId = typeof sp.plan === "string" ? sp.plan : null;
  const plan = planId ? await getPlan(teamId, planId) : null;

  if (plan) {
    const [sugg, inPlan, all, concepts] = await Promise.all([planSuggestions(teamId, plan), planPlays(teamId, plan), playbookPlays(teamId), conceptsForTeam(teamId)]);
    const labels = Object.fromEntries([...plan.theyShow, ...plan.theyRun].map((k) => [k, lookLabel(k, concepts)]));
    return (
      <div className="flex flex-col gap-4">
        <Link href={`/t/${teamId}/gameplan`} className="text-sm text-muted underline">
          All game plans
        </Link>
        <PlanEditor
          teamId={teamId}
          plan={{ id: plan.id, opponent: plan.opponent, gameDate: plan.gameDate, theyShow: plan.theyShow, theyRun: plan.theyRun, notes: plan.notes, playIds: plan.playIds, sentAt: plan.sentAt?.toISOString() ?? null }}
          installName={installNameFor(plan)}
          labels={labels}
          suggestions={sugg}
          inPlan={inPlan}
          all={all.map((r) => ({ id: r.id, name: r.name, side: r.facets.side?.[0]?.value === "defense" ? "defense" : "offense" }))}
        />
      </div>
    );
  }

  const plans = await listPlans(teamId);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-4xl">Game plan</h1>
          <p className="text-sm text-muted">Make a plan for each opponent: what they show, the plays you&apos;ll run at them, and send it to your players as the week&apos;s install.</p>
        </div>
        <NewPlan teamId={teamId} />
        {plans.length > 0 && (
          <ul className="flex flex-col">
            {plans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line py-2">
                <Link href={`/t/${teamId}/gameplan?plan=${p.id}`} className="font-semibold underline">
                  vs {p.opponent}
                </Link>
                <span className="text-sm text-muted">
                  {p.gameDate ? `${p.gameDate} · ` : ""}
                  {p.playIds.length} play{p.playIds.length === 1 ? "" : "s"}
                  {p.sentAt ? " · sent to players" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <QuickLook teamId={teamId} sp={sp} />
    </div>
  );
}
