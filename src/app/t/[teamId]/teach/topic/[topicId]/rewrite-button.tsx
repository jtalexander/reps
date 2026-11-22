"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { writeTopicAction } from "../../actions";
import { runAndWait } from "../../wait-job";

export function RewriteButton({ teamId, topicId, answersSinceWrite, answered }: { teamId: string; topicId: string; answersSinceWrite: boolean; answered: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="card flex flex-col gap-2 p-3 text-sm">
      {answersSinceWrite ? (
        <p>
          You&apos;ve answered {answered} question{answered === 1 ? "" : "s"} since these drafts were written. Rewrite them so lessons and questions use your answers. Anything you already
          approved stays as it is, and Reps only adds what it doesn&apos;t already cover.
        </p>
      ) : (
        <p className="text-muted">The drafts below already include every answer you&apos;ve given on this topic.</p>
      )}
      <button
        className={`btn ${answersSinceWrite ? "btn-primary" : "btn-ghost"} self-start`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await runAndWait(teamId, () => writeTopicAction(teamId, topicId), "Rewriting");
          setBusy(false);
          if (!r.ok) setError(r.error);
          else if (r.status === "failed") setError(r.error ?? "That didn't finish.");
          router.refresh();
        }}
      >
        {busy ? "Rewriting… (a minute or two)" : "Rewrite drafts"}
      </button>
      {error && <p className="rounded-lg bg-bad-bg px-3 py-2 text-bad">{error}</p>}
    </div>
  );
}
