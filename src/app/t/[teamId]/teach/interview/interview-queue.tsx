"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageView } from "@/components/page-view";
import { VoiceButton } from "@/components/voice-button";
import { safeCall } from "@/lib/safe-call";
import type { PageRef } from "@/teach/page-images";
import { answerGapAction } from "../actions";

interface Item {
  id: string;
  topic: string;
  question: string;
  why: string | null;
  appliesTo: string[];
  suggestion: string | null;
  status: string;
  answer: string | null;
  page: PageRef | null;
}

export function InterviewQueue({ teamId, items, doneMode }: { teamId: string; items: Item[]; doneMode: boolean }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handled, setHandled] = useState<Record<string, string>>({});
  const [showPage, setShowPage] = useState(true);

  if (items.length === 0)
    return <p className="card p-6 text-center text-muted">{doneMode ? "Nothing answered yet." : "No open questions. Find gaps on a topic to get some."}</p>;

  if (doneMode)
    return (
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.id} className="card p-3 text-sm">
            <div className="text-xs text-muted">{it.topic}</div>
            <div className="font-semibold">{it.question}</div>
            <div className="mt-1">{it.status === "skipped" ? <span className="text-muted">Skipped</span> : it.answer}</div>
            <button
              className="mt-1 text-xs underline"
              onClick={async () => {
                await safeCall(() => answerGapAction(teamId, it.id, { kind: "reopen" }), "Reopening");
                router.refresh();
              }}
            >
              Change
            </button>
          </li>
        ))}
      </ul>
    );

  const left = items.filter((it) => !handled[it.id]);
  const cur = left[Math.min(i, left.length - 1)];
  if (!cur)
    return (
      <div className="card flex flex-col items-center gap-3 p-6 text-center">
        <p className="font-semibold">That&apos;s all of them.</p>
        <p className="text-sm text-muted">Next: write lessons and questions for these topics.</p>
        <button className="btn btn-primary" onClick={() => router.push(`/t/${teamId}/teach`)}>
          Back to Teach
        </button>
      </div>
    );

  async function act(action: Parameters<typeof answerGapAction>[2], label: string) {
    setBusy(true);
    setError(null);
    const r = await safeCall(() => answerGapAction(teamId, cur!.id, action), "Saving");
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setHandled((h) => ({ ...h, [cur!.id]: label }));
    setText("");
    setI(0);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{cur.topic}</span>
        <span>
          {Object.keys(handled).length + 1} of {items.length}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-line">
        <div className="h-full bg-accent" style={{ width: `${(Object.keys(handled).length / items.length) * 100}%` }} />
      </div>

      <div className="card flex flex-col gap-3 p-4">
        <h2 className="text-lg leading-snug font-semibold">{cur.question}</h2>
        {cur.why && <p className="text-sm text-muted">Why players need it: {cur.why}</p>}
        {cur.appliesTo.length > 0 && <p className="text-xs text-muted">For: {cur.appliesTo.join(", ")}</p>}

        {cur.page && (
          <div>
            <button className="text-xs text-muted underline" onClick={() => setShowPage((s) => !s)}>
              {showPage ? "Hide" : "Show"} page {cur.page.pageNo}
            </button>
            {showPage && <PageView url={cur.page.url} width={cur.page.width} height={cur.page.height} className="mt-1 max-h-[55vh] w-full rounded border border-line" />}
          </div>
        )}

        {cur.suggestion && (
          <div className="rounded-lg bg-suggest-bg p-3 text-sm">
            <div className="text-xs font-semibold text-suggest uppercase">Reps&apos; suggestion — not from your playbook</div>
            <p className="mt-1">{cur.suggestion}</p>
            <div className="mt-2 flex gap-2">
              <button className="btn btn-primary min-h-9 px-3" disabled={busy} onClick={() => act({ kind: "approve" }, "approved")}>
                That&apos;s right
              </button>
              <button className="btn btn-ghost min-h-9 px-3" disabled={busy} onClick={() => setText(cur.suggestion ?? "")}>
                Edit it
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="label" htmlFor="answer">
            Your answer
          </label>
          <textarea id="answer" className="input py-2" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="In your words, the way you'd tell a player" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <VoiceButton onText={(t) => setText((x) => (x ? `${x} ${t}` : t))} />
            <button className="btn btn-primary ml-auto" disabled={busy || !text.trim()} onClick={() => act({ kind: "answer", text }, "answered")}>
              Save answer
            </button>
          </div>
        </div>
        {error && <p className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
      </div>

      <div className="flex justify-between gap-2">
        <button className="btn btn-ghost" disabled={busy} onClick={() => act({ kind: "skip" }, "skipped")}>
          Skip — leave it out
        </button>
        {left.length > 1 && (
          <button className="btn btn-ghost" disabled={busy} onClick={() => setI((x) => (x + 1) % left.length)}>
            Later →
          </button>
        )}
      </div>
    </div>
  );
}
