"use client";
import { useState, useTransition } from "react";
import { overrideGradeAction } from "../actions";

export function GradeOverride({ teamId, attemptId, correct, score, byCoach }: { teamId: string; attemptId: string; correct: boolean; score: number; byCoach: boolean }) {
  const [state, setState] = useState({ correct, byCoach });
  const [pending, start] = useTransition();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <span className={`rounded px-2 py-0.5 font-bold ${state.correct ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`}>
        {state.correct ? "Right" : "Not right"}
        {!state.byCoach ? ` (${Math.round(score * 100)}%)` : " — your call"}
      </span>
      <button
        className="underline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await overrideGradeAction(teamId, attemptId, !state.correct);
            if (r.ok) setState({ correct: !state.correct, byCoach: true });
          })
        }
      >
        Mark {state.correct ? "not right" : "right"}
      </button>
    </div>
  );
}
