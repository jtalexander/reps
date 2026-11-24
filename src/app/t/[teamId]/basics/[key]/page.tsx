import Link from "next/link";
import { notFound } from "next/navigation";
import { FieldDiagram } from "@/components/field-diagram";
import { CATEGORY_LABEL, LIBRARY_BY_KEY, SIDE_LABEL } from "@/library";
import { contentFor, libraryState, styleChoice, topicsFor } from "@/library/sync";
import { requireCoach } from "@/server/teams";
import { AUDIENCE_LABEL } from "@/teach/types";
import { LessonBody } from "../../teach/review/review-queue";
import { SubmitButton } from "@/components/submit-button";
import { addBasicsAction } from "../actions";
import { playsByConcept } from "@/library/concept-plays";

export const metadata = { title: "Football basics" };

/** Everything in one library topic as this team's players would get it (level and style picks applied). */
export default async function BasicsTopic({ params }: PageProps<"/t/[teamId]/basics/[key]">) {
  const { teamId, key } = await params;
  const { team } = await requireCoach(teamId);
  const t = LIBRARY_BY_KEY.get(key);
  if (!t || !topicsFor(team.level).includes(t)) notFound();
  const c = contentFor(t, team.level, team.libraryStyles, { routeTree: team.routeTree ?? null, terms: team.terms });
  const ours = await playsByConcept(
    teamId,
    c.lessons.map((l) => l.concept ?? ""),
  );
  const s = (await libraryState(teamId)).get(t.key);
  const added = s && !s.archived;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/t/${teamId}/basics`} className="text-sm text-muted underline">
          Football basics
        </Link>
        <p className="eyebrow">
          {SIDE_LABEL[t.side]} · {CATEGORY_LABEL[t.category]}
        </p>
        <h1 className="text-4xl">{t.name}</h1>
        <p className="text-sm text-muted">{t.summary}</p>
        {(t.styles ?? []).map((st) => (
          <p key={st.key} className="mt-1 text-sm">
            Taught your way: <b>{st.options.find((o) => o.key === styleChoice(st, team.libraryStyles))?.label}</b>{" "}
            <Link href={`/t/${teamId}/basics`} className="text-muted underline">
              change
            </Link>
          </p>
        ))}
      </div>
      {!added && (
        <form action={addBasicsAction.bind(null, teamId, [t.key])}>
          <SubmitButton className="btn btn-primary" pending="Adding…">
            Add to my team
          </SubmitButton>
        </form>
      )}

      <h2 className="text-2xl">Lessons</h2>
      {c.lessons.map((l, i) => (
        <article key={i} className="card flex flex-col gap-2 p-4">
          <div className="text-xs text-muted">{AUDIENCE_LABEL[l.audience]}</div>
          <h3 className="text-lg font-semibold">{l.title}</h3>
          <LessonBody text={l.body} />
          {l.diagram && <FieldDiagram diagram={l.diagram} />}
          {l.concept && (
            <div className="flex flex-col gap-1">
              <p className="eyebrow">Our plays that use this</p>
              {(ours[l.concept] ?? []).length ? (
                <div className="flex flex-wrap gap-1.5">
                  {ours[l.concept]!.map((p) => (
                    <Link key={p.id} href={`/t/${teamId}/plays/${p.id}`} className="border border-line bg-card px-2 py-1 font-label text-xs font-bold tracking-wide uppercase hover:border-brand">
                      {p.name}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">None of your approved plays use it yet. When one does, players see it here.</p>
              )}
            </div>
          )}
        </article>
      ))}

      <h2 className="text-2xl">Questions</h2>
      <ol className="flex flex-col gap-2">
        {c.questions.map((q, i) => (
          <li key={i} className="card flex flex-col gap-2 p-4 text-sm">
            <p className="text-xs text-muted">
              {q.audience.map((a) => AUDIENCE_LABEL[a]).join(", ")}
              {q.core ? " · must-know" : ""}
            </p>
            <p className="font-semibold">{q.prompt}</p>
            {q.diagram && <FieldDiagram diagram={q.diagram} />}
            {q.data.kind === "choice" && (
              <ul className="flex flex-col gap-1">
                {q.data.choices.map((ch) => (
                  <li key={ch.id} className={ch.id === (q.data as { answer: string }).answer ? "font-semibold text-ok" : "text-muted"}>
                    {ch.id === (q.data as { answer: string }).answer ? "✓ " : "· "}
                    {ch.text}
                  </li>
                ))}
              </ul>
            )}
            {q.data.kind === "order" && (
              <ol className="list-decimal pl-5 text-muted">
                {q.data.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ol>
            )}
            {q.data.kind === "open" && <p className="text-muted">Answer: {q.data.modelAnswer}</p>}
            <p className="text-xs text-muted">{q.explanation}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
