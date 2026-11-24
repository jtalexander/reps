import Link from "next/link";
import { redirect } from "next/navigation";
import { ROUTES } from "@/domain/routes";
import { term, TermsSchema } from "@/domain/terms";
import { requireCoach } from "@/server/teams";
import { getNaming } from "@/teach/naming";
import { pageRefs } from "@/teach/page-images";
import { NamingCheck } from "./naming-check";

export const metadata = { title: "Check your naming rules" };

/**
 * The guided check: one section of the naming rules at a time, in plain
 * words, with a Yes and a Fix. Built for a coach on a phone in two minutes.
 */
export default async function CheckNaming({ params }: PageProps<"/t/[teamId]/plays/naming/check">) {
  const { teamId } = await params;
  const { team } = await requireCoach(teamId);
  const { naming } = await getNaming(teamId);
  if (!naming) redirect(`/t/${teamId}/plays/naming`);
  const terms = TermsSchema.parse(team.terms ?? {});
  const routes = ROUTES.filter((r) => r.key !== "screen").map((r) => ({ key: r.key, label: term(terms, "routes", r.key) }));
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div>
        <Link href={`/t/${teamId}/teach`} className="text-sm text-muted underline">
          Teach
        </Link>
        <h1 className="text-4xl">Your naming rules</h1>
        <p className="text-sm text-muted">Reps read these out of your playbook. Tap Yes when a section is right; tap Fix to change it.</p>
      </div>
      <NamingCheck teamId={teamId} initial={naming} pages={await pageRefs(teamId)} routes={routes} hasRouteTree={Boolean(team.routeTree)} />
    </div>
  );
}
