"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { renderPagesAction, uploadPdfAction } from "../actions";

const BATCH = 3;

export function UploadForm({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ phase: "idle" | "uploading" | "rendering"; done: number; total: number; error?: string }>({
    phase: "idle",
    done: 0,
    total: 0,
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState({ phase: "uploading", done: 0, total: 0 });
    const up = await uploadPdfAction(teamId, fd);
    if (!up.ok) return setState({ phase: "idle", done: 0, total: 0, error: up.error });
    for (let from = 1; from <= up.pages; from += BATCH) {
      setState({ phase: "rendering", done: from - 1, total: up.pages });
      const r = await renderPagesAction(teamId, up.uploadId, from, from + BATCH - 1);
      if (!r.ok) return setState({ phase: "idle", done: 0, total: 0, error: r.error });
    }
    router.push(`/t/${teamId}/uploads/${up.uploadId}`);
  }

  const busy = state.phase !== "idle";
  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-3 p-4">
      <input name="file" type="file" accept="application/pdf" required disabled={busy} className="text-sm" />
      <button className="btn btn-primary" disabled={busy}>
        {state.phase === "uploading"
          ? "Uploading…"
          : state.phase === "rendering"
            ? `Splitting pages… ${state.done} of ${state.total}`
            : "Upload and split pages"}
      </button>
      {state.phase === "rendering" && (
        <div className="h-2 overflow-hidden rounded bg-line">
          <div className="h-full bg-accent transition-all" style={{ width: `${(state.done / Math.max(1, state.total)) * 100}%` }} />
        </div>
      )}
      {state.error && <p className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{state.error}</p>}
    </form>
  );
}
