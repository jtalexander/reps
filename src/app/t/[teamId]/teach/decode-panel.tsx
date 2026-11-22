"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeCall } from "@/lib/safe-call";
import { decodePageAction, prepareDecodeAction } from "./actions";
import { runAndWait } from "./wait-job";

const AT_ONCE = 3;

export function DecodePanel({
  teamId,
  uploads,
  failed,
  initialUpload,
  initialPages,
}: {
  teamId: string;
  uploads: Array<{ id: string; filename: string; pageCount: number }>;
  failed: Array<{ id: string; pageNo: number; error: string | null }>;
  initialUpload?: string | null;
  initialPages?: string;
}) {
  const router = useRouter();
  const [uploadId, setUploadId] = useState(uploads.find((u) => u.id === initialUpload)?.id ?? uploads[0]!.id);
  const [spec, setSpec] = useState(initialPages ?? "");
  const [run, setRun] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = uploads.find((u) => u.id === uploadId)!;

  async function decode(ids: string[]) {
    const queue = [...ids];
    let done = 0;
    const errors: string[] = [];
    setRun({ done, total: ids.length });
    await Promise.all(
      Array.from({ length: AT_ONCE }, async () => {
        while (queue.length) {
          const id = queue.shift()!;
          const r = await runAndWait(teamId, () => decodePageAction(teamId, id), "Reading a page");
          if (!r.ok) errors.push(r.error);
          else if (r.status === "failed" && r.error) errors.push(r.error);
          done++;
          setRun({ done, total: ids.length });
        }
      }),
    );
    setRun(null);
    if (errors.length) setError(`${errors.length} page${errors.length > 1 ? "s" : ""} couldn't be read: ${errors[0]}`);
    router.refresh();
  }

  return (
    <section className="card flex flex-col gap-3 p-4">
      <h2 className="font-semibold">Read pages</h2>
      {uploads.length > 1 && (
        <select className="input" value={uploadId} onChange={(e) => setUploadId(e.target.value)}>
          {uploads.map((u) => (
            <option key={u.id} value={u.id}>
              {u.filename}
            </option>
          ))}
        </select>
      )}
      <div>
        <label className="label" htmlFor="pages">
          Pages of {upload.filename} ({upload.pageCount} pages)
        </label>
        <input id="pages" className="input" placeholder="e.g. 5-10, 21, 27" value={spec} onChange={(e) => setSpec(e.target.value)} disabled={!!run} />
        <p className="mt-1 text-xs text-muted">Reading a page again replaces what Reps took from it before.</p>
      </div>
      <button
        className="btn btn-primary"
        disabled={!!run || !spec.trim()}
        onClick={async () => {
          setError(null);
          const prep = await safeCall(() => prepareDecodeAction(teamId, uploadId, spec, upload.pageCount), "Getting pages ready");
          if (!prep.ok) return setError(prep.error);
          await decode(prep.ids);
        }}
      >
        {run ? `Reading… ${run.done} of ${run.total} pages` : "Read these pages"}
      </button>
      {run && (
        <div className="h-2 overflow-hidden rounded bg-line">
          <div className="h-full bg-accent transition-all" style={{ width: `${(run.done / Math.max(1, run.total)) * 100}%` }} />
        </div>
      )}
      {error && <p className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
      {failed.length > 0 && !run && (
        <div className="text-sm">
          <span className="text-warn">Couldn&apos;t read pages {failed.map((f) => f.pageNo).join(", ")}.</span>{" "}
          <button className="underline" onClick={() => decode(failed.map((f) => f.id))}>
            Try again
          </button>
        </div>
      )}
    </section>
  );
}
