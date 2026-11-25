"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlaySvg } from "@/components/play-svg";
import type { PlayData } from "@/domain/play";
import { safeCall } from "@/lib/safe-call";
import { deleteViewAction, saveViewAction } from "../actions";
import { setPlaysInstallAction } from "../teach/actions";

/** Save what's picked now as a view: "Power, tight end", "Third and short". */
export function SaveView({ teamId, query }: { teamId: string; query: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!open)
    return (
      <button className="text-sm font-semibold underline" onClick={() => setOpen(true)}>
        Save this view
      </button>
    );
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await safeCall(() => saveViewAction(teamId, name, query), "Saving the view");
        setBusy(false);
        if (!r.ok) return setMsg(r.error);
        setOpen(false);
        setName("");
        setMsg(null);
        router.refresh();
      }}
    >
      <input className="input w-56" autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name it, e.g. Short yardage" />
      <button className="btn btn-primary min-h-9 px-3 text-sm" disabled={busy || !name.trim()}>
        {busy ? "Saving…" : "Save"}
      </button>
      <button type="button" className="text-sm text-muted underline" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {msg && <span className="text-sm text-bad">{msg}</span>}
    </form>
  );
}

export function DeleteView({ teamId, id, name }: { teamId: string; id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="px-1 text-muted hover:text-bad"
      aria-label={`Delete the view ${name}`}
      title="Delete this view"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await safeCall(() => deleteViewAction(teamId, id), "Deleting the view");
        setBusy(false);
        router.refresh();
      }}
    >
      ×
    </button>
  );
}

export type GridRow = { id: string; name: string; tags: string; approved: boolean; inInstall: boolean; data: PlayData };

/** The plays that fit: open one, or tick some (or all) and add them to this week's install. */
export function PlaybookGrid({ teamId, rows, total }: { teamId: string; rows: GridRow[]; total: number }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const open = rows.filter((r) => !r.inInstall);
  const chosen = open.filter((r) => sel.has(r.id));
  const add = async (ids: string[]) => {
    setBusy(true);
    setMsg(null);
    const r = await safeCall(() => setPlaysInstallAction(teamId, ids, true), "Adding to the install");
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.error, ok: false });
    setSel(new Set());
    setMsg({ text: `Added ${ids.length} play${ids.length === 1 ? "" : "s"} to this week's install.`, ok: true });
    router.refresh();
  };
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div className="flex flex-col gap-3">
      {open.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button className="underline" onClick={() => setSel(chosen.length === open.length ? new Set() : new Set(open.map((r) => r.id)))}>
            {chosen.length === open.length ? "Untick all" : `Tick all ${open.length}${total > rows.length ? " shown" : ""}`}
          </button>
          <span className="text-muted">Tick plays to add them to this week&apos;s install.</span>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const on = sel.has(r.id);
          return (
            <li key={r.id} className={`card flex h-full flex-col gap-2 p-2 ${on ? "border-brand bg-brand/10" : ""}`}>
              <Link href={`/t/${teamId}/plays/${r.id}`} className="block">
                <PlaySvg data={r.data} fit compact className="pointer-events-none block w-full border border-line" />
              </Link>
              <div className="flex items-start gap-2 px-1">
                {r.inInstall ? (
                  <span className="mt-0.5 shrink-0 text-xs font-bold text-ok" title="In this week's install">
                    ✓
                  </span>
                ) : (
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={on} onChange={() => toggle(r.id)} aria-label={`Add ${r.name} to the install`} />
                )}
                <div className="min-w-0 flex-1">
                  <Link href={`/t/${teamId}/plays/${r.id}`} className="font-semibold hover:underline">
                    {r.name}
                  </Link>
                  <div className="text-xs text-muted">{r.tags}</div>
                  {!r.approved && <div className="text-xs text-warn">Not approved yet</div>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {(chosen.length > 0 || msg) && (
        <div className="sticky bottom-3 z-10 flex flex-col gap-1">
          {msg && <p className={`px-3 py-2 text-sm ${msg.ok ? "bg-card text-ok" : "bg-warn-bg text-bad"}`}>{msg.text}</p>}
          {chosen.length > 0 && (
            <button className="btn btn-primary min-h-12 shadow-lg" disabled={busy} onClick={() => add(chosen.map((r) => r.id))}>
              {busy ? "Adding…" : `Add ${chosen.length} play${chosen.length === 1 ? "" : "s"} to the install`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
