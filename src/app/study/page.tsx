import Link from "next/link";
import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { answers, srsItems } from "@/db/schema";
import { candidates, QUIZ_TYPE_LABEL, typesForPositions } from "@/domain/quiz";
import { requirePlayer } from "@/server/player-session";
import { contextFor, quizPlays } from "@/server/quiz";
import { installPlayIds } from "@/teach/install";
import { scoutInstall } from "@/breakdown/scout/service";
import { leaveAction, startQuizAction, switchPositionAction } from "./actions";
import { TeachSection } from "./teach-section";

export const metadata = { title: "Study" };

export default async function StudyHome({ searchParams }: PageProps<"/study">) {
  const { empty } = await searchParams;
  const me = await requirePlayer();
  const plays = await quizPlays(me.team.id);
  const thisWeek = await installPlayIds(me.team.id);
  const weekPlays = plays.filter((p) => thisWeek.has(p.id));
  // the opponent's plays the scout team runs this week (cards only, never quizzed)
  const scoutCards = (await scoutInstall(me.team.id)).length;
  const [due] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(srsItems)
    .where(and(eq(srsItems.playerId, me.player.id), lte(srsItems.dueAt, new Date())));
  const [week] = await db
    .select({ t: sql<number>`count(*)::int`, c: sql<number>`count(*) filter (where ${answers.correct})::int` })
    .from(answers)
    .where(and(eq(answers.playerId, me.player.id), sql`${answers.createdAt} > now() - interval '7 days'`));
  // only the kinds of question this player's plays can ask (a defender gets defense questions, a receiver offense)
  const asked = new Set(candidates(plays, contextFor(me.team, me.position)).map((c) => c.type));
  const types = typesForPositions([me.position]).filter((t) => asked.has(t));
  const otherPositions = me.player.positions.filter((p) => p !== me.position);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6">
      <header className="flex items-start justify-between">
        <div>
          <div className="eyebrow">{me.team.name}</div>
          <h1 className="mt-1 text-4xl">
            {me.player.name} <span className="bg-brand px-2 py-0.5 align-middle font-label text-sm font-bold tracking-widest text-brand-ink">{me.position}</span>
          </h1>
        </div>
        <form action={leaveAction}>
          <button className="text-sm text-muted underline">Not you?</button>
        </form>
      </header>

      {otherPositions.length > 0 && (
        <form action={switchPositionAction} className="flex items-center gap-2 text-sm">
          <span className="text-muted">Study as:</span>
          {otherPositions.map((p) => (
            <button key={p} name="position" value={p} className="border border-line bg-card px-3 py-1 font-label text-xs font-bold tracking-widest uppercase hover:border-brand">
              {p}
            </button>
          ))}
        </form>
      )}

      {(weekPlays.length > 0 || me.team.installName) && (
        <section className="card flex flex-col gap-2 border-brand p-4">
          <p className="eyebrow">
            <span className="h-px w-6 bg-brand" />
            This week
          </p>
          {me.team.installName && <h2 className="text-2xl">{me.team.installName}</h2>}
          {weekPlays.length > 0 ? (
            <>
              <form action={startQuizAction}>
                <input type="hidden" name="install" value="1" />
                <button name="mode" value="mixed" className="btn btn-primary min-h-12 w-full">
                  Quiz me on this week&apos;s plays ({weekPlays.length})
                </button>
              </form>
              <Link href="/study/plays?week=1" className="btn btn-ghost min-h-11">
                See this week&apos;s plays
              </Link>
            </>
          ) : (
            <p className="text-sm text-muted">Your coach&apos;s install topics come first below.</p>
          )}
        </section>
      )}

      {scoutCards > 0 && (
        <Link href="/study/scout" className="btn btn-ghost min-h-11">
          Scout team cards ({scoutCards})
        </Link>
      )}

      <TeachSection teamId={me.team.id} playerId={me.player.id} position={me.position} />

      {empty && <p className="bg-warn-bg px-3 py-2 text-sm text-warn">No questions for that yet. Your coach may still be approving plays.</p>}

      {plays.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Real plays</h2>
            <span className="text-xs text-muted">
              {plays.length} approved · {due?.n ?? 0} due{week?.t ? ` · ${Math.round((week.c / week.t) * 100)}% this week` : ""}
            </span>
          </div>
          <form action={startQuizAction} className="grid grid-cols-2 gap-2">
            <button name="mode" value="mixed" className="btn btn-primary min-h-12">
              Quiz me on plays
            </button>
            <button name="mode" value="speed" className="btn btn-accent min-h-12">
              ⚡ Speed round
            </button>
          </form>
          <Link href="/study/plays" className="btn btn-ghost min-h-11">
            See my plays ({plays.length})
          </Link>
          <details>
            <summary className="cursor-pointer text-sm text-muted">Practice one kind of question</summary>
            <form action={startQuizAction} className="mt-2 grid grid-cols-2 gap-2">
              {types.map((t) => (
                <button key={t} name="mode" value={t} className="btn btn-ghost min-h-11 text-xs">
                  {QUIZ_TYPE_LABEL[t]}
                </button>
              ))}
            </form>
          </details>
        </section>
      )}
    </main>
  );
}
