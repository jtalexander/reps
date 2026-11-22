"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeCall } from "@/lib/safe-call";
import { clearInstallAction, setInstallAction } from "./actions";

/** Put a topic in or out of the install the team is learning now. */
export function InstallToggle({ teamId, topicId, on, size = "sm" }: { teamId: string; topicId: string; on: boolean; size?: "sm" | "md" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start">
      <button
        className={`btn ${on ? "btn-primary" : "btn-outline"} ${size === "sm" ? "min-h-8 px-2 text-xs" : "min-h-10 px-3"}`}
        disabled={busy}
        aria-pressed={on}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await safeCall(() => setInstallAction(teamId, topicId, !on), "Saving");
          setBusy(false);
          if (!r.ok) return setError(r.error);
          router.refresh();
        }}
      >
        {busy ? "Saving…" : on ? "✓ In the install" : "+ Add to install"}
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </span>
  );
}

/** Start a new install: take every topic out. */
export function ClearInstall({ teamId, count }: { teamId: string; count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="text-sm text-muted underline"
      disabled={busy}
      onClick={async () => {
        if (!confirm(`Take all ${count} topics out of the install? Nothing is deleted; players just stop seeing them first.`)) return;
        setBusy(true);
        await safeCall(() => clearInstallAction(teamId), "Clearing");
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? "Clearing…" : "Start a new install"}
    </button>
  );
}
