"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { triageAction } from "./actions";
import { runAndWait } from "./wait-job";

/** Re-rank Reps' open questions and link repeats across topics (one AI call). */
export function TriageButton({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2 text-sm">
      <button
        className="text-muted underline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await runAndWait(teamId, () => triageAction(teamId), "Sorting");
          setBusy(false);
          if (!r.ok) setMsg(r.error);
          else if (r.status === "failed") setMsg(r.error ?? "Sorting didn't finish.");
          else setMsg(`${r.result?.key ?? 0} questions to ask, ${r.result?.optional ?? 0} optional, ${r.result?.repeats ?? 0} repeats linked.`);
          router.refresh();
        }}
      >
        {busy ? "Sorting Reps' questions…" : "Re-sort Reps' questions"}
      </button>
      {msg && <span className="text-muted">{msg}</span>}
    </span>
  );
}
