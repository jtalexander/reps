"use client";
/**
 * Runs a list of Teach questions in any format: multiple choice, tap the
 * diagram, put in order, answer in your own words. Grading happens on the
 * server; the answer key only arrives after the player answers.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { flagQuestionAction, gradeAction } from "@/app/study/teach-actions";
import { PageView } from "@/components/page-view";
import { VoiceButton } from "@/components/voice-button";
import type { PageRef } from "@/teach/page-images";
import type { PublicQuestion } from "@/teach/service";
import type { Box } from "@/teach/types";

type Graded = {
  correct: boolean;
  score: number;
  feedback: string | null;
  explanation: string;
  answer?: string;
  order?: string[];
  target?: Box;
  targetLabel?: string;
  modelAnswer?: string;
  keyPoints?: string[];
};

export function QuestionRunner({
  questions,
  pages,
  mode,
  onFinish,
}: {
  questions: PublicQuestion[];
  pages: Record<number, PageRef>;
  mode: "learn" | "practice";
  onFinish?: (score: { right: number; total: number }) => void;
}) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [tap, setTap] = useState<{ x: number; y: number } | null>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<Graded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [pending, start] = useTransition();
  // null: not flagging; string: the note being written; "sent": done
  const [flag, setFlag] = useState<string | null>(null);
  const [flagSent, setFlagSent] = useState<Record<string, boolean>>({});
  const shownAt = useRef(0);
  const q = questions[i];

  useEffect(() => {
    shownAt.current = performance.now();
  }, [i]);

  function next() {
    const n = i + 1;
    setI(n);
    setPicked(null);
    setOrder([]);
    setTap(null);
    setText("");
    setResult(null);
    setError(null);
    setFlag(null);
    if (n >= questions.length) onFinish?.(score);
  }

  function submit(given: unknown) {
    if (!q || result || pending) return;
    // Only ever called from click handlers, never during render.
    // eslint-disable-next-line react-hooks/purity
    const ms = Math.round(performance.now() - shownAt.current);
    start(async () => {
      try {
        const r = await gradeAction(q.id, given, ms, mode);
        if (!r.ok) return setError(r.error);
        setResult(r);
        setScore((s) => ({ right: s.right + (r.correct ? 1 : 0), total: s.total + 1 }));
      } catch {
        setError("That didn't go through. If Reps was just updated, reload the page.");
      }
    });
  }

  if (!q) {
    return (
      <div className="card flex flex-col items-center gap-2 p-6 text-center">
        <div className="text-4xl font-bold">{score.total ? Math.round((score.right / score.total) * 100) : 0}%</div>
        <p className="text-muted">
          {score.right} of {score.total} right. Missed questions come back sooner.
        </p>
      </div>
    );
  }

  const page = q.image ? pages[q.image.pageNo] : null;
  const verdict = result ? (result.correct ? "Right." : result.score > 0 ? "Partly right." : "Not quite.") : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          Question {i + 1} of {questions.length}
        </span>
        <span>{score.right} right</span>
      </div>
      <h2 className="text-lg leading-snug font-semibold">{q.prompt}</h2>

      {page && (
        <PageView
          url={page.url}
          width={page.width}
          height={page.height}
          crop={q.image?.box ?? null}
          onTap={q.format === "tap" && !result ? (p) => setTap(p) : undefined}
          dots={tap ? [{ ...tap, tone: result ? (result.correct ? "ok" : "bad") : "accent" }] : []}
          marks={result?.target ? [{ box: result.target, tone: "ok" }] : []}
          className="w-full rounded-lg border border-line"
        />
      )}

      {q.format === "choice" && (
        <ul className="flex flex-col gap-2">
          {q.choices!.map((c) => {
            const isRight = result && c.id === result.answer;
            const wrongPick = result && picked === c.id && !isRight;
            return (
              <li key={c.id}>
                <button
                  disabled={!!result || pending}
                  onClick={() => {
                    setPicked(c.id);
                    submit(c.id);
                  }}
                  className={`btn w-full justify-start border text-left text-base ${isRight ? "border-ok bg-ok-bg text-ok" : wrongPick ? "border-bad bg-bad-bg text-bad" : picked === c.id ? "border-ink bg-card" : "border-line bg-card"}`}
                >
                  {c.text}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {q.format === "order" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Tap them in order, first to last.</p>
          <ul className="flex flex-col gap-2">
            {q.items!.map((item) => {
              const n = order.indexOf(item);
              const rightPos = result?.order ? result.order.indexOf(item) : -1;
              return (
                <li key={item}>
                  <button
                    disabled={!!result || pending}
                    onClick={() => setOrder((o) => (o.includes(item) ? o.filter((x) => x !== item) : [...o, item]))}
                    className={`btn w-full justify-start border text-left text-sm ${result ? (rightPos === n ? "border-ok bg-ok-bg" : "border-bad bg-bad-bg") : n >= 0 ? "border-ink bg-card" : "border-line bg-card"}`}
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-ink">{n >= 0 ? n + 1 : ""}</span>
                    <span className="flex-1">{item}</span>
                    {result && rightPos !== n && <span className="text-xs">#{rightPos + 1}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {!result && (
            <button className="btn btn-primary" disabled={order.length !== q.items!.length || pending} onClick={() => submit(order)}>
              Check
            </button>
          )}
        </div>
      )}

      {q.format === "tap" && !result && (
        <button className="btn btn-primary" disabled={!tap || pending} onClick={() => submit(tap)}>
          {tap ? "Check my spot" : "Tap the diagram"}
        </button>
      )}

      {q.format === "open" && !result && (
        <div className="flex flex-col gap-2">
          <textarea className="input py-2" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Answer in your own words" />
          <div className="flex items-center gap-2">
            <VoiceButton onText={(t) => setText((x) => (x ? `${x} ${t}` : t))} />
            <button className="btn btn-primary ml-auto" disabled={!text.trim() || pending} onClick={() => submit(text)}>
              {pending ? "Checking…" : "Check my answer"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}

      {result && (
        <div className={`rounded-xl p-3 text-sm ${result.correct ? "bg-ok-bg" : "bg-bad-bg"}`}>
          <p className={`font-semibold ${result.correct ? "text-ok" : "text-bad"}`}>{verdict}</p>
          {result.feedback && <p className="mt-1">{result.feedback}</p>}
          {result.targetLabel && !result.correct && <p className="mt-1">The right spot: {result.targetLabel} (green box).</p>}
          {result.modelAnswer && (
            <p className="mt-1">
              <strong>Coach&apos;s answer:</strong> {result.modelAnswer}
            </p>
          )}
          <p className="mt-1">{result.explanation}</p>
        </div>
      )}
      {result && q && (
        <div className="text-sm">
          {flagSent[q.id] ? (
            <p className="text-muted">Thanks. Your coach will take a look.</p>
          ) : flag === null ? (
            <button className="text-muted underline" onClick={() => setFlag("")}>
              Something wrong with this question?
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea className="input py-2" rows={2} value={flag} onChange={(e) => setFlag(e.target.value)} placeholder="What seems wrong? (optional)" />
              <div className="flex gap-2">
                <button
                  className="btn btn-ghost min-h-9 px-3"
                  onClick={async () => {
                    const id = q.id;
                    try {
                      const r = await flagQuestionAction(id, flag);
                      if (!r.ok) return setError(r.error);
                      setFlagSent((s) => ({ ...s, [id]: true }));
                      setFlag(null);
                    } catch {
                      setError("That didn't go through. If Reps was just updated, reload the page.");
                    }
                  }}
                >
                  Tell my coach
                </button>
                <button className="min-h-9 px-3 text-muted underline" onClick={() => setFlag(null)}>
                  Never mind
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {result && (
        <button className="btn btn-primary sticky bottom-3 min-h-12" onClick={next}>
          {i + 1 === questions.length ? "Finish" : "Next"}
        </button>
      )}
    </div>
  );
}
