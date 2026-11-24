"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { PlaySvg } from "@/components/play-svg";
import { isLineman, type Line, type PlayData, type Point } from "@/domain/play";
import type { PublicQuestion } from "@/server/quiz";
import { answerAction } from "../../actions";

type Result = { correct: boolean; answer: string | string[]; explanation: string; reveal: PlayData | null; note?: string | null };

/** The pens a player picks from when he draws his job. */
const PENS: Array<[string, Line, React.ReactNode]> = [
  ["Route or run", { style: "solid", end: "arrow" }, <path key="a" d="M2 6 H22 M18 2 L24 6 L18 10" />],
  ["Block", { style: "solid", end: "t" }, <path key="t" d="M2 6 H22 M22 1.5 V10.5" strokeWidth={2} />],
  ["Fake", { style: "dotted", end: "arrow" }, <path key="f" d="M2 6 H22 M18 2 L24 6 L18 10" strokeDasharray="3 2.5" />],
];

export function QuizRunner({ sessionId, mode, questions }: { sessionId: string; mode: string; questions: PublicQuestion[] }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  // draw-your-job: the pen and the line he drew
  const [pen, setPen] = useState<Line>(() => ({ style: "solid", end: questions[0]?.kind === "draw" && questions[0].diagram?.highlight && isLineman(questions[0].diagram.highlight) ? "t" : "arrow" }));
  const [stroke, setStroke] = useState<{ pts: Point[]; pen: Line } | null>(null);
  const [drawHint, setDrawHint] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0, ms: 0 });
  const [pending, start] = useTransition();
  const shownAt = useRef(0);
  const [left, setLeft] = useState<number | null>(questions[0]?.timeLimit ?? null);
  const q = questions[i];
  const done = i >= questions.length;

  // the clock for response time starts when a question appears
  useEffect(() => {
    shownAt.current = performance.now();
  }, [i]);

  function goTo(n: number) {
    setI(n);
    setPicked(null);
    setOrder([]);
    setResult(null);
    setStroke(null);
    setDrawHint(null);
    const next = questions[n];
    setPen({ style: "solid", end: next?.kind === "draw" && next.diagram?.highlight && isLineman(next.diagram.highlight) ? "t" : "arrow" });
    setLeft(questions[n]?.timeLimit ?? null);
  }

  function submit(given: string | string[]) {
    if (!q || result || pending) return;
    const ms = Math.round(performance.now() - shownAt.current);
    start(async () => {
      const r = await answerAction(sessionId, q.index, given, ms);
      setResult(r);
      setScore((s) => ({ right: s.right + (r.correct ? 1 : 0), total: s.total + 1, ms: s.ms + ms }));
      if (mode === "speed" && r.correct) setTimeout(() => goTo(i + 1), 700);
    });
  }

  // speed-round countdown; time out = miss
  useEffect(() => {
    if (left == null || result) return;
    if (left <= 0) {
      submit("");
      return;
    }
    const t = setTimeout(() => setLeft((l) => (l == null ? l : +(l - 0.1).toFixed(1))), 100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, result]);

  if (done) {
    const pct = score.total ? Math.round((score.right / score.total) * 100) : 0;
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">
        <div className="text-6xl font-bold">{pct}%</div>
        <p className="text-muted">
          {score.right} of {score.total} right · {(score.ms / Math.max(1, score.total) / 1000).toFixed(1)}s per answer
        </p>
        <p className="text-sm text-muted">Missed plays come back sooner next time.</p>
        <Link href="/study" className="btn btn-primary w-full">
          Done
        </Link>
      </main>
    );
  }
  if (!q) return null;

  const correctIds = result ? (Array.isArray(result.answer) ? result.answer : [result.answer]) : [];
  const diagramData = result?.reveal ?? q.play;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 py-4">
      <div className="flex items-center justify-between text-sm text-muted">
        <Link href="/study" className="underline">
          Quit
        </Link>
        <span>
          {i + 1} / {questions.length}
        </span>
        <span>{score.right} right</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-line">
        <div className="h-full bg-accent transition-all" style={{ width: `${(i / questions.length) * 100}%` }} />
      </div>

      {left != null && !result && (
        <div className="h-2 overflow-hidden rounded bg-line">
          <div className={`h-full ${left < 2 ? "bg-bad" : "bg-ok"}`} style={{ width: `${(left / (q.timeLimit ?? 1)) * 100}%` }} />
        </div>
      )}

      <h1 className="font-sans text-lg leading-snug font-semibold normal-case">{q.prompt}</h1>

      {q.diagram && diagramData && (
        <div className="card overflow-hidden">
          <PlaySvg
            key={`${i}-${result ? "r" : "q"}`}
            data={diagramData}
            flip={q.diagram.flip}
            hide={result ? "none" : q.diagram.hide}
            highlight={q.diagram.highlight}
            coverage={q.diagram.coverage ?? null}
            readKey={q.diagram.readKey ?? null}
            routeOnly={q.diagram.routeOnly ?? null}
            animate={q.kind !== "draw" || !!result}
            compact
            pen={q.kind === "draw" && !result ? pen : null}
            onDraw={(id, pts) => {
              if (id !== q.diagram?.highlight) return setDrawHint("Start your line at your own spot (the highlighted player).");
              setStroke({ pts, pen });
              setDrawHint(null);
            }}
            overlay={q.kind === "draw" && stroke ? { ...stroke, tone: result ? (result.correct ? "ok" : "bad") : "draft" } : null}
            className="block w-full"
          />
        </div>
      )}

      {q.kind === "draw" ? (
        !result && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Pen">
              {PENS.map(([name, p, icon]) => {
                const on = p.style === pen.style && p.end === pen.end;
                return (
                  <button key={name} onClick={() => setPen(p)} aria-pressed={on} className={`btn min-h-11 flex-1 border px-2 text-sm ${on ? "border-brand bg-brand text-brand-ink" : "border-line bg-card"}`}>
                    <svg width="28" height="12" viewBox="0 0 28 12" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      {icon}
                    </svg>
                    {name}
                  </button>
                );
              })}
            </div>
            <p className={`text-sm ${drawHint ? "text-warn" : "text-muted"}`}>{drawHint ?? (stroke ? "Happy with it? Check it, or draw it again." : "Put your finger on your spot and draw your line.")}</p>
            <div className="flex gap-2">
              <button className="btn flex-1 border border-line" disabled={!stroke || pending} onClick={() => setStroke(null)}>
                Clear
              </button>
              <button className="btn btn-primary flex-1" disabled={!stroke || pending} onClick={() => stroke && submit(JSON.stringify(stroke))}>
                Check
              </button>
            </div>
          </div>
        )
      ) : q.kind === "choice" ? (
        <ul className="flex flex-col gap-2">
          {q.choices.map((c) => {
            const isRight = result && correctIds.includes(c.id);
            const isWrongPick = result && picked === c.id && !isRight;
            return (
              <li key={c.id}>
                <button
                  disabled={!!result || pending}
                  onClick={() => {
                    setPicked(c.id);
                    submit(c.id);
                  }}
                  className={`btn w-full justify-start border text-left text-base ${
                    isRight ? "border-ok bg-ok-bg text-ok" : isWrongPick ? "border-bad bg-bad-bg text-bad" : picked === c.id ? "border-ink bg-card" : "border-line bg-card"
                  }`}
                >
                  {c.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Tap in order: 1st read first.</p>
          <ul className="flex flex-col gap-2">
            {q.choices.map((c) => {
              const n = order.indexOf(c.id);
              const rightPos = result ? correctIds.indexOf(c.id) : -1;
              return (
                <li key={c.id}>
                  <button
                    disabled={!!result || pending}
                    onClick={() => setOrder((o) => (o.includes(c.id) ? o.filter((x) => x !== c.id) : [...o, c.id]))}
                    className={`btn w-full justify-start border text-left text-base ${result ? (rightPos === n ? "border-ok bg-ok-bg" : "border-bad bg-bad-bg") : n >= 0 ? "border-ink bg-card" : "border-line bg-card"}`}
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-ink">{n >= 0 ? n + 1 : ""}</span>
                    {c.label}
                    {result && rightPos !== n && <span className="ml-auto text-xs">#{rightPos + 1}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {!result && (
            <button className="btn btn-primary" disabled={order.length !== q.choices.length || pending} onClick={() => submit(order)}>
              Check order
            </button>
          )}
        </div>
      )}

      {result && (
        <div className={`rounded-xl p-3 ${result.correct ? "bg-ok-bg" : "bg-bad-bg"}`}>
          <p className={`font-semibold ${result.correct ? "text-ok" : "text-bad"}`}>{result.correct ? "Right." : picked === null && q.kind === "choice" ? "Time." : "Not quite."}</p>
          {result.note && <p className="mt-1 font-medium">{result.note.replace(/^Right: (.)/, (_, c: string) => c.toUpperCase())}</p>}
          <p className="mt-1 text-sm">{result.explanation}</p>
        </div>
      )}
      {result && (mode !== "speed" || !result.correct) && (
        <button className="btn btn-primary sticky bottom-3 min-h-12" onClick={() => goTo(i + 1)}>
          {i + 1 === questions.length ? "Finish" : "Next"}
        </button>
      )}
    </main>
  );
}
