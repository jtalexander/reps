"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MAX_UPLOAD_BYTES, UPLOAD_CHUNK_BYTES } from "@/domain/limits";
import { safeCall } from "@/lib/safe-call";
import { finishUploadAction, renderPagesAction, startUploadAction, uploadChunkAction } from "../actions";

const BATCH = 3;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

type Phase = "idle" | "uploading" | "checking" | "rendering";

export function UploadForm({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ phase: Phase; done: number; total: number; error?: string }>({ phase: "idle", done: 0, total: 0 });
  const fail = (error: string) => setState({ phase: "idle", done: 0, total: 0, error });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = new FormData(e.currentTarget).get("file");
    if (!(file instanceof File) || file.size === 0) return fail("Pick a PDF first.");
    if (file.size > MAX_UPLOAD_BYTES) return fail(`That PDF is ${mb(file.size)}. The limit is ${mb(MAX_UPLOAD_BYTES)}; split it into smaller files.`);

    const start = await safeCall(() => startUploadAction(teamId, file.name, file.size), "Starting the upload");
    if (!start.ok) return fail(start.error);

    const chunks = Math.ceil(file.size / UPLOAD_CHUNK_BYTES);
    for (let i = 0; i < chunks; i++) {
      setState({ phase: "uploading", done: i * UPLOAD_CHUNK_BYTES, total: file.size });
      const fd = new FormData();
      fd.append("chunk", file.slice(i * UPLOAD_CHUNK_BYTES, (i + 1) * UPLOAD_CHUNK_BYTES));
      const r = await safeCall(() => uploadChunkAction(teamId, start.uploadId, i, fd), "Uploading");
      if (!r.ok) return fail(r.error);
    }

    setState({ phase: "checking", done: 0, total: 0 });
    const fin = await safeCall(() => finishUploadAction(teamId, start.uploadId, chunks), "Opening the PDF");
    if (!fin.ok) return fail(fin.error);

    for (let from = 1; from <= fin.pages; from += BATCH) {
      setState({ phase: "rendering", done: from - 1, total: fin.pages });
      const r = await safeCall(() => renderPagesAction(teamId, start.uploadId, from, from + BATCH - 1), `Splitting page ${from}`);
      if (!r.ok) {
        // The pages done so far are saved; the upload page can finish the rest.
        fail(r.error);
        router.push(`/t/${teamId}/uploads/${start.uploadId}`);
        return;
      }
    }
    router.push(`/t/${teamId}/uploads/${start.uploadId}`);
  }

  const busy = state.phase !== "idle";
  const label =
    state.phase === "uploading"
      ? `Uploading… ${mb(state.done)} of ${mb(state.total)}`
      : state.phase === "checking"
        ? "Opening the PDF…"
        : state.phase === "rendering"
          ? `Splitting pages… ${state.done} of ${state.total}`
          : "Upload and split pages";
  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-3 p-4">
      <input name="file" type="file" accept="application/pdf" required disabled={busy} className="text-sm" />
      <button className="btn btn-primary" disabled={busy}>
        {label}
      </button>
      {(state.phase === "uploading" || state.phase === "rendering") && (
        <div className="h-2 overflow-hidden rounded bg-line">
          <div className="h-full bg-accent transition-all" style={{ width: `${(state.done / Math.max(1, state.total)) * 100}%` }} />
        </div>
      )}
      {state.error && <p className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{state.error}</p>}
    </form>
  );
}
