import Link from "next/link";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { answers, srsItems, studySets } from "@/db/schema";
import { inGroups } from "@/domain/positions";
import { QUIZ_TYPE_LABEL, typesForPositions } from "@/domain/quiz";
import { requirePlayer } from "@/server/player-session";
import { quizPlays } from "@/server/quiz";
import { leaveAction, startQuizAction, switchPositionAction } from "./actions";

export const metadata = { title: "Study" };

export default async function StudyHome({ searchParams }: PageProps<"/study">) {
  const { empty } = await searchParams;
  const me = await requirePlayer();
  const sets = (await db.select().from(studySets).where(eq(studySets.teamId, me.team.id)).orderBy(desc(studySets.createdAt))).filter((s) =>
    inGroups(me.position, s.positions),
  );
  const plays = await quizPlays(me.team.id);
  const [due] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(srsItems)
    .where(and(eq(srsItems.playerId, me.player.id), lte(srsItems.dueAt, new Date())));
  const [week] = await db
    .select({ t: sql<number>`count(*)::int`, c: sql<number>`count(*) filter (where ${answers.correct})::int` })
    .from(answers)
    .where(and(eq(answers.playerId, me.player.id), sql`${answers.createdAt} > now() - interval '7 days'`));
  const types = typesForPositions([me.position]);
  const otherPositions = me.player.positions.filter((p) => p !== me.position);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-sm text-muted">{me.team.name}</div>
          <h1 className="text-2xl font-bold">
            {me.player.name} <span className="rounded bg-brand px-2 py-0.5 align-middle text-sm text-brand-ink">{me.position}</span>
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
            <button key={p} name="position" value={p} className="rounded-full border border-line bg-card px-3 py-1">
              {p}
            </button>
          ))}
        </form>
      )}

      {empty && <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">No questions for that yet. Your coach may still be approving plays.</p>}

      {plays.length === 0 ? (
        <p className="card p-4 text-sm text-muted">Your coach hasn&apos;t approved any plays yet. Check back soon.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-3">
              <div className="text-xs text-muted">Due for review</div>
              <div className="text-2xl font-bold">{due?.n ?? 0}</div>
            </div>
            <div className="card p-3">
              <div className="text-xs text-muted">This week</div>
              <div className="text-2xl font-bold">{week?.t ? `${Math.round((week.c / week.t) * 100)}%` : "—"}</div>
              <div className="text-xs text-muted">{week?.t ?? 0} answers</div>
            </div>
          </div>

          {sets.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="font-semibold">Assigned</h2>
              {sets.map((s) => (
                <form key={s.id} action={startQuizAction} className="card flex items-center justify-between gap-3 p-3">
                  <input type="hidden" name="setId" value={s.id} />
                  <div>
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-xs text-muted">
                      {s.playIds.length} plays{s.dueDate ? ` · due ${new Date(s.dueDate + "T12:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}` : ""}
                    </div>
                  </div>
                  <button className="btn btn-accent">Start</button>
                </form>
              ))}
            </section>
          )}

          <form action={startQuizAction} className="flex flex-col gap-2">
            <button name="mode" value="mixed" className="btn btn-primary min-h-14 text-base">
              Quiz me — 10 questions
            </button>
            <button name="mode" value="speed" className="btn btn-accent min-h-14 text-base">
              ⚡ Speed round
            </button>
          </form>

          <Link href="/study/plays" className="btn btn-ghost min-h-12">
            Study my plays ({plays.length})
          </Link>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted">Practice one thing</h2>
            <form action={startQuizAction} className="grid grid-cols-2 gap-2">
              {types.map((t) => (
                <button key={t} name="mode" value={t} className="btn btn-ghost min-h-12 text-xs">
                  {QUIZ_TYPE_LABEL[t]}
                </button>
              ))}
            </form>
          </section>
        </>
      )}
    </main>
  );
}
