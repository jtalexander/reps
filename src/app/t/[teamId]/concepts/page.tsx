import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { plays, teamConcepts } from "@/db/schema";
import { TermsSchema, term } from "@/domain/terms";
import { conceptsForTeam } from "@/server/plays";
import { requireCoach } from "@/server/teams";
import { ConceptEditor } from "./concept-editor";

export const metadata = { title: "Concepts" };

export default async function Concepts({ params }: PageProps<"/t/[teamId]/concepts">) {
  const { teamId } = await params;
  const { team } = await requireCoach(teamId);
  const terms = TermsSchema.parse(team.terms ?? {});
  const concepts = await conceptsForTeam(teamId);
  const edited = new Set((await db.select({ k: teamConcepts.conceptKey }).from(teamConcepts).where(eq(teamConcepts.teamId, teamId))).map((r) => r.k));
  const usage = new Map(
    (
      await db
        .select({ k: plays.conceptKey, n: sql<number>`count(*)::int` })
        .from(plays)
        .where(and(eq(plays.teamId, teamId), eq(plays.archived, false)))
        .groupBy(plays.conceptKey)
    ).map((r) => [r.k, r.n]),
  );
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Concepts</h1>
        <p className="mt-1 text-sm text-muted">
          Standard reads Reps suggests when it recognizes a concept. Edit any of them to match how you teach it — the change flows into every play that uses the concept. Values you typed on a play stay as you wrote them.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {concepts.map((c) => (
          <li key={c.key}>
            <ConceptEditor teamId={teamId} concept={c} label={term(terms, "concepts", c.key) || c.name} edited={edited.has(c.key)} plays={usage.get(c.key) ?? 0} />
          </li>
        ))}
      </ul>
    </div>
  );
}
