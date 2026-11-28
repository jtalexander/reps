"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeCall } from "@/lib/safe-call";
import { deleteOpponentAction, saveOpponentAction } from "./actions";

export interface OpponentFields {
  name: string;
  season: number;
  headCoach: string;
  offensiveCoordinator: string;
  defensiveCoordinator: string;
  notes: string;
}

/** Add an opponent for a season, or change one: the school, the year and who runs each side of the ball. */
export function OpponentForm({ teamId, opponentId, start, season }: { teamId: string; opponentId: string | null; start?: OpponentFields; season: number }) {
  const router = useRouter();
  const [v, setV] = useState<OpponentFields>(start ?? { name: "", season, headCoach: "", offensiveCoordinator: "", defensiveCoordinator: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (patch: Partial<OpponentFields>) => setV({ ...v, ...patch });

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const r = await safeCall(() => saveOpponentAction(teamId, opponentId, v), "Saving");
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    if (opponentId) {
      setMsg("Saved.");
      router.refresh();
    } else router.push(`/t/${teamId}/scout/${r.opponentId}`);
  };
  const remove = async () => {
    if (!opponentId || !window.confirm(`Remove ${v.name} ${v.season}, their games and their scout plays?`)) return;
    setBusy(true);
    const r = await safeCall(() => deleteOpponentAction(teamId, opponentId), "Removing");
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    router.push(`/t/${teamId}/scout`);
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="flex flex-col gap-1">
          <span className="text-muted">Opponent</span>
          <input className="input" value={v.name} placeholder="Central" onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Season</span>
          <input className="input" type="number" inputMode="numeric" value={v.season} onChange={(e) => set({ season: Number(e.target.value) })} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-muted">Head coach</span>
          <input className="input" value={v.headCoach} onChange={(e) => set({ headCoach: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Offensive coordinator</span>
          <input className="input" value={v.offensiveCoordinator} onChange={(e) => set({ offensiveCoordinator: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Defensive coordinator</span>
          <input className="input" value={v.defensiveCoordinator} onChange={(e) => set({ defensiveCoordinator: e.target.value })} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-muted">Notes</span>
        <textarea className="input" rows={2} value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary min-h-9 px-4 text-sm" disabled={busy || !v.name.trim()} onClick={save}>
          {opponentId ? "Save" : "Add opponent"}
        </button>
        {opponentId && (
          <button className="text-muted underline" disabled={busy} onClick={remove}>
            Remove this opponent
          </button>
        )}
        {msg && (
          <span role="status" className={msg === "Saved." ? "text-ok" : "text-bad"}>
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
