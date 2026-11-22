"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { safeCall } from "@/lib/safe-call";
import { keepGoingAction, startPlaybookRunAction, stopPlaybookRunAction } from "./actions";

export interface RunProgress {
  stage: "reading" | "questions" | "sorting" | "writing" | "done";
  pages: { total: number; read: number; failed: number };
  topics: { total: number; asked: number; written: number };
  running: number;
  stalled: boolean;
}

const ORDER = ["reading", "questions", "sorting", "writing", "done"] as const;

/** Start a whole-playbook run, or show how far the current one has got. */
export function PlaybookRunCard({
  teamId,
  uploads,
  progress,
  pagesLeft,
  topicsLeft,
}: {
  teamId: string;
  uploads: Array<{ id: string; filename: string; pageCount: number }>;
  progress: RunProgress | null;
  pagesLeft: number;
  topicsLeft: number;
}) {
  const router = useRouter();
  const [uploadId, setUploadId] = useState(uploads[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // While a run is going, keep the numbers fresh.
  useEffect(() => {
    if (!progress) return;
    const t = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(t);
  }, [progress, router]);

  async function act(what: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true);
    setError(null);
    const r = await safeCall(fn, what);
    setBusy(false);
    if (!r.ok) setError(r.error);
    router.refresh();
  }

  if (!progress) {
    if (!uploads.length || (pagesLeft === 0 && topicsLeft === 0)) return null;
    return (
      <section className="card flex flex-col gap-3 border-brand/60 p-4">
        <p className="eyebrow">
          <span className="h-px w-6 bg-brand" />
          One tap
        </p>
        <h2 className="text-2xl">Read the whole playbook</h2>
        <p className="text-sm text-muted">
          Reps reads {pagesLeft ? `the ${pagesLeft} pages it hasn't read yet` : "your playbook"}, finds its questions for every topic, sorts them, and writes draft lessons and
          quiz questions. It runs on Reps&apos; server, so you can close this page. A full playbook takes about an hour. Nothing reaches players until you approve it.
        </p>
        {uploads.length > 1 && (
          <select className="input" value={uploadId} onChange={(e) => setUploadId(e.target.value)}>
            {uploads.map((u) => (
              <option key={u.id} value={u.id}>
                {u.filename} ({u.pageCount} pages)
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-primary self-start" disabled={busy || !uploadId} onClick={() => act("Starting", () => startPlaybookRunAction(teamId, uploadId))}>
          {busy ? "Starting…" : "Read the whole playbook"}
        </button>
        {error && <p className="bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
      </section>
    );
  }

  const at = ORDER.indexOf(progress.stage);
  const steps = [
    { title: "Reading pages", note: `${progress.pages.read} of ${progress.pages.total}${progress.pages.failed ? ` · ${progress.pages.failed} couldn't be read` : ""}` },
    { title: "Finding Reps' questions", note: `${progress.topics.asked} of ${progress.topics.total} topics` },
    { title: "Sorting questions", note: at > 2 ? "Done" : "One pass over every topic" },
    { title: "Writing drafts", note: `${progress.topics.written} of ${progress.topics.total} topics` },
  ];
  return (
    <section className="card flex flex-col gap-3 border-brand/60 p-4">
      <p className="eyebrow">
        <span className="h-px w-6 bg-brand" />
        Reading your playbook
      </p>
      <ol className="grid gap-2 sm:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className={`border p-3 ${i === at ? "border-brand" : "border-line"} ${i > at ? "opacity-50" : ""}`}>
            <div className="font-label text-xs font-bold tracking-widest text-muted uppercase">{i < at ? "Done" : i === at ? "Working" : "Next"}</div>
            <div className="font-semibold">{s.title}</div>
            <div className="text-sm text-muted">{s.note}</div>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">
        This runs on Reps&apos; server, so you can close this page and come back. Topics show up below as they&apos;re ready, and you can start answering and approving
        before it finishes.
      </p>
      <div className="flex flex-wrap gap-2">
        {progress.stalled && (
          <button className="btn btn-primary" disabled={busy} onClick={() => act("Restarting", () => keepGoingAction(teamId))}>
            It stopped moving. Keep going
          </button>
        )}
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => {
            if (confirm("Stop reading the playbook? Anything already read or written stays.")) act("Stopping", () => stopPlaybookRunAction(teamId));
          }}
        >
          Stop
        </button>
      </div>
      {error && <p className="bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
    </section>
  );
}
