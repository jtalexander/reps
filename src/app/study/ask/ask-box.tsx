"use client";
import { useState, useTransition } from "react";
import { VoiceButton } from "@/components/voice-button";
import { askAction } from "../teach-actions";

export function AskBox() {
  const [q, setQ] = useState("");
  const [log, setLog] = useState<Array<{ q: string; a: string; pages: number[]; answered: boolean }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {log.map((m, i) => (
        <div key={i} className="flex flex-col gap-1">
          <p className="self-end rounded-xl bg-brand px-3 py-2 text-sm text-brand-ink">{m.q}</p>
          <div className={`rounded-xl px-3 py-2 text-sm ${m.answered ? "card" : "bg-warn-bg text-warn"}`}>
            {m.a}
            {m.pages.length > 0 && <div className="mt-1 text-xs text-muted">From playbook page {m.pages.join(", ")}</div>}
          </div>
        </div>
      ))}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const question = q.trim();
          if (!question) return;
          setError(null);
          start(async () => {
            try {
              const r = await askAction(question);
              if (!r.ok) return setError(r.error);
              setLog((l) => [...l, { q: question, a: r.answer, pages: r.source_pages, answered: r.answered }]);
              setQ("");
            } catch {
              setError("That didn't go through. Try again.");
            }
          });
        }}
      >
        <textarea className="input py-2" rows={2} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. On Smash, what do I do as #2?" />
        <div className="flex items-center gap-2">
          <VoiceButton onText={(t) => setQ((x) => (x ? `${x} ${t}` : t))} />
          <button className="btn btn-primary ml-auto" disabled={pending || !q.trim()}>
            {pending ? "Looking…" : "Ask"}
          </button>
        </div>
      </form>
      {error && <p className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
    </div>
  );
}
