"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeCall } from "@/lib/safe-call";
import { copyFromTeamAction } from "./actions";

/** Bring over answers, approved lessons and questions, and naming rules from another of the coach's teams. */
export function CopyFromTeam({ teamId, teams }: { teamId: string; teams: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [from, setFrom] = useState(teams[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="card mt-2 flex flex-col gap-2 p-3 text-sm">
      <div className="font-semibold">Bring over your work from another team</div>
      <p className="text-muted">
        Same offense as last season or another grade? For every topic with the same name, your answers come over, and your approved lessons and questions come over
        as drafts at the front of the review, so one tap approves them. Nothing goes live until you approve it.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Team to copy from">
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          className="btn btn-outline"
          disabled={busy || !from}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const r = await safeCall(() => copyFromTeamAction(teamId, from), "Copying");
            setBusy(false);
            setMsg(
              r.ok
                ? r.topics || r.naming
                  ? `Brought over ${r.topics} topics: ${r.answers} answers, ${r.lessons} lessons, ${r.questions} questions${r.naming ? ", and the naming rules" : ""}.`
                  : "No topics with the same name to bring over."
                : r.error,
            );
            router.refresh();
          }}
        >
          {busy ? "Bringing it over…" : "Bring it over"}
        </button>
      </div>
      {msg && <p className="text-muted">{msg}</p>}
    </div>
  );
}
