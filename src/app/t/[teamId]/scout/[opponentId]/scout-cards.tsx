"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlaySvg } from "@/components/play-svg";
import { safeCall } from "@/lib/safe-call";
import type { PlayData } from "@/shared/football";
import { removeScoutPlayAction, setScoutInstallAction, setScoutInstallAllAction } from "../actions";

export interface ScoutCard {
  id: string;
  name: string;
  data: PlayData;
  inInstall: boolean;
  source: "drawn" | "film";
}

/** An opponent's plays as cards: tick the ones the scout team runs this week, edit or remove them. */
export function ScoutCards({ teamId, opponentId, cards }: { teamId: string; opponentId: string; cards: ScoutCard[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, what: string) => {
    setBusy(true);
    setMsg(null);
    const r = await safeCall(fn, what);
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    router.refresh();
  };
  const allIn = cards.length > 0 && cards.every((c) => c.inInstall);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm print:hidden">
        <button className="btn btn-outline min-h-9 px-3 text-sm" disabled={busy || cards.length === 0} onClick={() => run(() => setScoutInstallAllAction(teamId, opponentId, !allIn), "Updating the scout install")}>
          {allIn ? "Take all out of this week's scout install" : "Put all in this week's scout install"}
        </button>
        {msg && (
          <span role="status" className="text-bad">
            {msg}
          </span>
        )}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
        {cards.map((c) => (
          <li key={c.id} className="card flex break-inside-avoid flex-col gap-2 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-lg">{c.name && c.name !== "unknown" ? c.name : "Unnamed"}</span>
              {c.source === "film" && <span className="text-xs text-muted">from film</span>}
            </div>
            <PlaySvg data={c.data} fit className="block w-full" />
            <div className="flex flex-wrap items-center gap-3 text-sm print:hidden">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={c.inInstall} disabled={busy} onChange={(e) => {
                    // read the box now: by the time the request runs, React has put it back to the saved value
                    const on = e.target.checked;
                    void run(() => setScoutInstallAction(teamId, c.id, on), "Updating the scout install");
                  }}
                />
                This week&rsquo;s scout install
              </label>
              <Link href={`/t/${teamId}/scout/${opponentId}/draw?play=${c.id}`} className="ml-auto underline">
                Edit
              </Link>
              <button
                className="text-muted underline"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Remove "${c.name}" from their playbook?`)) void run(() => removeScoutPlayAction(teamId, c.id), "Removing");
                }}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
