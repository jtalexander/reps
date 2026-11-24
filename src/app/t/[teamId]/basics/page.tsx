import Link from "next/link";
import { LEVEL_LABEL } from "@/domain/readiness";
import { CATEGORY_LABEL, SIDE_LABEL } from "@/library";
import { allStyles, contentFor, libraryState, styleChoice, topicsFor } from "@/library/sync";
import type { Side } from "@/library/types";
import { requireCoach } from "@/server/teams";
import { AUDIENCE_LABEL } from "@/teach/types";
import { SubmitButton } from "@/components/submit-button";
import { addBasicsAction, removeBasicsAction, setBasicsStyleAction } from "./actions";

export const metadata = { title: "Football basics" };

const SIDES: Side[] = ["general", "offense", "defense", "special"];

/**
 * The built-in library: general football, offense, defense and special teams
 * concepts and technique. Adding a topic puts it in front of players as an
 * approved topic, like one Reps wrote from the playbook.
 */
export default async function Basics({ params }: PageProps<"/t/[teamId]/basics">) {
  const { teamId } = await params;
  const { team } = await requireCoach(teamId);
  const usable = topicsFor(team.level);
  const state = await libraryState(teamId);
  const picks = team.libraryStyles;
  const styles = allStyles().filter((s) => usable.some((t) => t.styles?.some((x) => x.key === s.key)));
  const live = (key: string) => {
    const s = state.get(key);
    return s && !s.archived ? s : null;
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-4xl">Football basics</h1>
        <p className="mt-1 text-sm text-muted">
          Lessons and quizzes on the game itself: offense, defense and special teams, concepts and technique, for {LEVEL_LABEL[team.level].toLowerCase()} players. Add a topic and your
          players can learn it and get quizzed on it like your own topics. Use it in study sets and installs too.
        </p>
      </div>

      {styles.length > 0 && (
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="font-semibold">How you teach it</h2>
          <p className="text-sm text-muted">Coaches teach some things differently. Pick yours and Reps teaches your players your way.</p>
          {styles.map((s) => {
            const current = styleChoice(s, picks);
            return (
              <form key={s.key} action={setBasicsStyleAction.bind(null, teamId, s.key)} className="flex flex-col gap-2 border-t border-line pt-3">
                <p className="text-sm font-semibold">{s.question}</p>
                {s.options.map((o) => (
                  <label key={o.key} className="flex items-start gap-2 text-sm">
                    <input type="radio" name="option" value={o.key} defaultChecked={o.key === current} className="mt-1 h-4 w-4" />
                    <span>
                      <b>{o.label}</b> <span className="text-muted">{o.summary}</span>
                    </span>
                  </label>
                ))}
                <SubmitButton className="btn btn-outline self-start" pending="Saving…">Save</SubmitButton>
              </form>
            );
          })}
        </section>
      )}

      {SIDES.map((side) => {
        const list = usable.filter((t) => t.side === side);
        if (!list.length) return null;
        const missing = list.filter((t) => !live(t.key)).map((t) => t.key);
        return (
          <section key={side} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-2xl">{SIDE_LABEL[side]}</h2>
              {missing.length > 0 && (
                <form action={addBasicsAction.bind(null, teamId, missing)}>
                  <SubmitButton className="btn btn-outline" pending="Adding…">
                    Add all {missing.length} {missing.length === 1 ? "topic" : "topics"}
                  </SubmitButton>
                </form>
              )}
            </div>
            <ul className="flex flex-col gap-2">
              {list.map((t) => {
                const s = live(t.key);
                const c = contentFor(t, team.level, picks);
                const old = s && (s.version ?? 0) < t.version;
                return (
                  <li key={t.key} className={`card flex flex-col gap-2 p-4 ${s ? "border-ok" : ""}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {t.name} <span className="text-xs font-normal text-muted">· {CATEGORY_LABEL[t.category]}</span>
                        </p>
                        <p className="text-sm text-muted">{t.summary}</p>
                        <p className="mt-1 text-xs text-muted">
                          For {t.for.map((a) => AUDIENCE_LABEL[a].toLowerCase()).join(", ")} · {c.lessons.length} lessons · {c.questions.length} questions
                          {t.styles?.length ? " · taught your way" : ""}
                        </p>
                      </div>
                      {s && <span className="text-sm font-semibold text-ok">{old ? "Update ready" : "Added"}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/t/${teamId}/basics/${t.key}`} className="text-sm underline">
                        Look through it
                      </Link>
                      <span className="ml-auto flex gap-2">
                        {(!s || old) && (
                          <form action={addBasicsAction.bind(null, teamId, [t.key])}>
                            <SubmitButton className="btn btn-primary" pending={old ? "Updating…" : "Adding…"}>{old ? "Update" : "Add"}</SubmitButton>
                          </form>
                        )}
                        {s && (
                          <form action={removeBasicsAction.bind(null, teamId, t.key)}>
                            <SubmitButton className="btn btn-outline" pending="Removing…">Remove</SubmitButton>
                          </form>
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
