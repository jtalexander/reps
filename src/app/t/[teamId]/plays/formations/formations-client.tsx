"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlaySvg } from "@/components/play-svg";
import { emptyPlay, type Player } from "@/domain/play";
import { safeCall } from "@/lib/safe-call";
import { deleteFormationAction, saveFormationsFromPlaysAction } from "../../actions";

const field = (name: string, players: Player[]) => ({ ...emptyPlay(name), players });

export function FormationCards({ teamId, rows }: { teamId: string; rows: Array<{ id: string; name: string; players: Player[]; plays: number }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((f) => (
        <li key={f.id} className="card flex flex-col gap-2 p-2">
          <Link href={`/t/${teamId}/plays/build?formation=${f.id}`}>
            <PlaySvg data={field(f.name, f.players)} fit compact className="pointer-events-none block w-full border border-line" />
          </Link>
          <div className="flex items-start justify-between gap-2 px-1">
            <div>
              <div className="font-semibold">{f.name}</div>
              <div className="text-xs text-muted">{f.plays ? `${f.plays} play${f.plays === 1 ? "" : "s"} drawn from it` : "No plays drawn from it yet"}</div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
              <Link href={`/t/${teamId}/plays/build?formation=${f.id}`} className="font-semibold underline">
                Change
              </Link>
              <Link href={`/t/${teamId}/plays/build?startFormation=${f.id}`} className="underline">
                Draw a play from it
              </Link>
              <button
                className={sure === f.id ? "text-bad underline" : "text-muted underline"}
                disabled={busy === f.id}
                onClick={async () => {
                  if (sure !== f.id) return setSure(f.id);
                  setBusy(f.id);
                  await safeCall(() => deleteFormationAction(teamId, f.id), "Deleting");
                  setBusy(null);
                  setSure(null);
                  router.refresh();
                }}
              >
                {sure === f.id ? "Yes, delete it" : "Delete"}
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function FromPlaybook({ teamId, rows }: { teamId: string; rows: Array<{ id: string; name: string; players: Player[] }> }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (ids: string[]) => {
    setBusy(true);
    const r = await safeCall(() => saveFormationsFromPlaysAction(teamId, ids), "Saving formations");
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    setSel(new Set());
    setMsg(`Saved ${r.saved} formation${r.saved === 1 ? "" : "s"}.`);
    router.refresh();
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button className="btn btn-outline min-h-9 px-3 text-sm" disabled={busy} onClick={() => save(rows.map((r) => r.id))}>
          Save all {rows.length}
        </button>
        {sel.size > 0 && (
          <button className="btn btn-primary min-h-9 px-3 text-sm" disabled={busy} onClick={() => save([...sel])}>
            Save {sel.size} ticked
          </button>
        )}
        {msg && <span className="text-ok">{msg}</span>}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => (
          <li key={r.id}>
            <label className={`card flex h-full cursor-pointer flex-col gap-2 p-2 ${sel.has(r.id) ? "border-brand bg-brand/10" : ""}`}>
              <PlaySvg data={field(r.name, r.players)} fit compact className="pointer-events-none block w-full border border-line" />
              <span className="flex items-center gap-2 px-1 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={sel.has(r.id)}
                  onChange={() =>
                    setSel((s) => {
                      const n = new Set(s);
                      if (n.has(r.id)) n.delete(r.id);
                      else n.add(r.id);
                      return n;
                    })
                  }
                />
                {r.name}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
