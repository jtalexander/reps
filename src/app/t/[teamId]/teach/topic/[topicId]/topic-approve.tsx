"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeCall } from "@/lib/safe-call";
import type { PageRef } from "@/teach/page-images";
import { AUDIENCE_LABEL, type QuestionData } from "@/teach/types";
import { approveTopicAction, reviewLessonAction, reviewQuestionAction } from "../../actions";
import { FORMAT_LABEL, LessonBody, LessonCard, QuestionCard, type LessonItem, type QuestionItem } from "../../review/review-queue";

const audienceText = (a: string[]) => a.map((x) => AUDIENCE_LABEL[x as keyof typeof AUDIENCE_LABEL] ?? x).join(", ");

/** The right answer in one line, so a question can be checked at a glance. */
function answerLine(d: QuestionData): string {
  if (d.kind === "choice") return d.choices.find((c) => c.id === d.answer)?.text ?? "";
  if (d.kind === "tap") return `Tap: ${d.targetLabel}`;
  if (d.kind === "order") return d.items.join(" → ");
  return d.modelAnswer;
}

export function TopicApprove({
  pile = "core",
  reserveLeft = 0,
  teamId,
  topicId,
  topicName,
  pages,
  lessons,
  questions,
  next,
}: {
  /** "core": lessons + must-know questions; "reserve": the extra questions */
  pile?: "core" | "reserve";
  /** reserve questions on this topic, shown after the core set is approved */
  reserveLeft?: number;
  teamId: string;
  topicId: string;
  topicName: string;
  pages: Record<number, PageRef>;
  lessons: LessonItem[];
  questions: QuestionItem[];
  next: { id: string; name: string } | null;
}) {
  const router = useRouter();
  // per item: "approved" | "rejected" | "editing"
  const [state, setState] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvedAll, setApprovedAll] = useState<{ lessons: number; questions: number } | null>(null);

  const waitingL = lessons.filter((l) => !state[l.id]).length;
  const waitingQ = questions.filter((q) => !state[q.id]).length;
  const editing = Object.entries(state).filter(([, v]) => v === "editing").map(([k]) => k);

  if (approvedAll || (lessons.length === 0 && questions.length === 0))
    return (
      <div className="card flex flex-col items-start gap-2 p-4 text-sm">
        {approvedAll ? (
          <p className="font-semibold text-ok">
            {topicName} is live: {approvedAll.lessons} lesson{approvedAll.lessons === 1 ? "" : "s"} and {approvedAll.questions} question{approvedAll.questions === 1 ? "" : "s"} approved.
          </p>
        ) : (
          <p className="text-muted">{pile === "reserve" ? "Nothing left in reserve on this topic." : "No drafts waiting on this topic."}</p>
        )}
        {pile === "core" && reserveLeft > 0 && (
          <p className="text-muted">
            {reserveLeft} more question{reserveLeft === 1 ? " waits" : "s wait"} in reserve for when players want more.
          </p>
        )}
        {next && (
          <Link className="btn btn-primary" href={`/t/${teamId}/teach/topic/${next.id}`}>
            Next: {next.name} →
          </Link>
        )}
      </div>
    );

  async function quick(it: LessonItem | QuestionItem, status: "rejected" | "draft") {
    const r =
      it.type === "lesson"
        ? await safeCall(() => reviewLessonAction(teamId, it.id, { status }), "Saving")
        : await safeCall(() => reviewQuestionAction(teamId, it.id, { status }), "Saving");
    if (!r.ok) return setError(r.error);
    setState((s) => {
      const rest = { ...s };
      if (status === "draft") delete rest[it.id];
      else rest[it.id] = status;
      return rest;
    });
  }

  async function move(q: QuestionItem) {
    const tier = pile === "core" ? "reserve" : "core";
    const r = await safeCall(() => reviewQuestionAction(teamId, q.id, { tier }), "Moving");
    if (!r.ok) return setError(r.error);
    setState((s) => ({ ...s, [q.id]: tier === "core" ? "moved to the core set" : "moved to reserve" }));
  }

  async function unmove(q: QuestionItem) {
    const r = await safeCall(() => reviewQuestionAction(teamId, q.id, { tier: pile }), "Moving");
    if (!r.ok) return setError(r.error);
    setState((s) => {
      const rest = { ...s };
      delete rest[q.id];
      return rest;
    });
  }

  const label = (v: string) => (v === "approved" ? "Approved" : v === "rejected" ? "Rejected" : v.charAt(0).toUpperCase() + v.slice(1));

  const handled = (id: string, label: string, it: LessonItem | QuestionItem) => (
    <div key={id} className="flex items-center justify-between rounded-lg border border-dashed border-line px-3 py-2 text-sm text-muted">
      <span>{label}</span>
      <button className="underline" onClick={() => (state[id]?.startsWith("moved") && it.type === "question" ? unmove(it) : quick(it, "draft"))}>
        Undo
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {pile === "reserve"
          ? "Approve the ones you want players to have too. Anything you leave here stays out of their quizzes."
          : "Skim everything below. Fix or reject anything that's wrong, then approve the rest with one tap at the bottom."}
      </p>

      {lessons.length > 0 && <h3 className="text-sm font-semibold">Lessons ({lessons.length})</h3>}
      {lessons.map((l) =>
        state[l.id] === "editing" ? (
          <LessonCard key={l.id} teamId={teamId} item={l} topic={topicName} mode="draft" startEditing onDone={(s) => setState((x) => ({ ...x, [l.id]: s }))} />
        ) : state[l.id] ? (
          handled(l.id, `${state[l.id] === "approved" ? "Approved" : "Rejected"}: ${l.lesson.title}`, l)
        ) : (
          <div key={l.id} className="card flex flex-col gap-2 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="font-semibold">{l.lesson.title}</h4>
              <span className="text-xs text-muted">
                for {audienceText([l.lesson.audience])} · p{l.lesson.sourcePages.join(", ")}
              </span>
            </div>
            <LessonBody text={l.lesson.body} />
            <div className="flex gap-3 text-sm">
              <button className="underline" onClick={() => setState((x) => ({ ...x, [l.id]: "editing" }))}>
                Edit
              </button>
              <button className="text-bad underline" onClick={() => quick(l, "rejected")}>
                Reject
              </button>
            </div>
          </div>
        ),
      )}

      {questions.length > 0 && <h3 className="text-sm font-semibold">Quiz questions ({questions.length})</h3>}
      <ul className="flex flex-col gap-2">
        {questions.map((q) =>
          state[q.id] === "editing" ? (
            <li key={q.id}>
              <QuestionCard teamId={teamId} item={q} topic={topicName} pages={pages} mode="draft" startEditing onDone={(s) => setState((x) => ({ ...x, [q.id]: s }))} />
            </li>
          ) : state[q.id] ? (
            <li key={q.id}>{handled(q.id, `${label(state[q.id]!)}: ${q.question.prompt}`, q)}</li>
          ) : (
            <li key={q.id} className="card flex flex-col gap-1 p-3 text-sm">
              <div className="flex flex-wrap gap-2 text-xs text-muted">
                <span className="rounded bg-brand px-1.5 font-semibold text-brand-ink">{FORMAT_LABEL[q.question.format] ?? q.question.format}</span>
                <span>for {audienceText(q.question.audience)}</span>
              </div>
              <div className="font-semibold">{q.question.prompt}</div>
              <div className="text-ok">✓ {answerLine(q.question.data)}</div>
              <div className="flex gap-3">
                <button className="underline" onClick={() => setState((x) => ({ ...x, [q.id]: "editing" }))}>
                  {q.question.format === "tap" ? "See diagram / edit" : "Edit"}
                </button>
                <button className="text-muted underline" onClick={() => move(q)}>
                  {pile === "core" ? "Move to reserve" : "Move to core"}
                </button>
                <button className="text-bad underline" onClick={() => quick(q, "rejected")}>
                  Reject
                </button>
              </div>
            </li>
          ),
        )}
      </ul>

      {error && <p className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
      {waitingL + waitingQ > 0 && (
        <button
          className="btn btn-primary sticky bottom-3 min-h-12 shadow-lg"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const r = await safeCall(() => approveTopicAction(teamId, topicId, editing, pile), "Approving");
            setBusy(false);
            if (!r.ok) return setError(r.error);
            if (editing.length) {
              // keep the open editors; mark the rest done
              setState((s) => ({ ...s, ...Object.fromEntries([...lessons, ...questions].filter((x) => !s[x.id]).map((x) => [x.id, "approved"])) }));
            } else setApprovedAll({ lessons: r.lessons, questions: r.questions });
            router.refresh();
          }}
        >
          {busy ? "Approving…" : `Approve ${pile === "reserve" ? "these " : ""}${[waitingL ? `${waitingL} lesson${waitingL === 1 ? "" : "s"}` : "", waitingQ ? `${waitingQ} question${waitingQ === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ")}`}
        </button>
      )}
    </div>
  );
}
