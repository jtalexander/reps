"use client";
import Form from "next/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlaySvg } from "@/components/play-svg";
import type { PlayData } from "@/domain/play";
import { safeCall } from "@/lib/safe-call";
import { setInstallNameAction, setPlaysInstallAction } from "../teach/actions";

/** The install's name: "Week 7: Eagles". */
export function InstallName({ teamId, name }: { teamId: string; name: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(name ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const changed = value.trim() !== (name ?? "");
  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        const r = await safeCall(() => setInstallNameAction(teamId, value), "Saving the name");
        setBusy(false);
        if (!r.ok) return setMsg(r.error);
        setValue(r.name ?? "");
        setMsg("Saved.");
        router.refresh();
      }}
    >
      <label className="label" htmlFor="install-name">
        Name this install
      </label>
      <div className="flex gap-2">
        <input
          id="install-name"
          className="input flex-1"
          value={value}
          maxLength={60}
          placeholder="e.g. Week 7: Eagles"
          onChange={(e) => {
            setValue(e.target.value);
            setMsg(null);
          }}
        />
        <button className="btn btn-primary" disabled={busy || !changed}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      <span className={`text-xs ${msg && msg !== "Saved." ? "text-bad" : "text-muted"}`}>{msg ?? "Your players see it on their Study page."}</span>
    </form>
  );
}

export type FilterOption = { value: string; label: string; n: number };

/** Formation, motion, concept and type: picking one shows the plays that fit right away. */
export function Filters({
  teamId,
  current,
  formations,
  motions,
  concepts,
  types,
}: {
  teamId: string;
  current: { formation: string; motion: string; concept: string; type: string; q: string };
  formations: FilterOption[];
  motions: FilterOption[];
  concepts: FilterOption[];
  types: FilterOption[];
}) {
  const any = Object.values(current).some(Boolean);
  const select = (name: string, label: string, all: string, opts: FilterOption[], value: string) => (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="label">{label}</span>
      <select name={name} defaultValue={value} className="input" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        <option value="">{all}</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label} ({o.n})
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <Form action={`/t/${teamId}/install`} className="flex flex-col gap-2" key={JSON.stringify(current)}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {select("formation", "Formation", "Any formation", formations, current.formation)}
        {select("motion", "Motion", "Any motion", motions, current.motion)}
        {select("concept", "Concept", "Any concept", concepts, current.concept)}
        {select("type", "Type", "Any type", types, current.type)}
      </div>
      <div className="flex gap-2">
        <input className="input flex-1" name="q" defaultValue={current.q} placeholder="Or type part of a play name" />
        <button className="btn btn-outline">Find</button>
      </div>
      {any && (
        <Link href={`/t/${teamId}/install`} className="self-start text-sm text-muted underline">
          Clear filters
        </Link>
      )}
    </Form>
  );
}

export type PickRow = {
  id: string;
  name: string;
  tags: string;
  approved: boolean;
  picked: boolean;
  topicName: string | null;
  viaTopic: boolean;
  data: PlayData;
};

/** The plays that fit: tick the ones you want and add them in one tap. */
export function PickList({ teamId, rows }: { teamId: string; rows: PickRow[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = rows.filter((r) => !r.picked);
  const chosen = open.filter((r) => sel.has(r.id));
  const run = async (ids: string[], on: boolean, what: string) => {
    setBusy(what);
    setError(null);
    const r = await safeCall(() => setPlaysInstallAction(teamId, ids, on), on ? "Adding" : "Removing");
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setSel(new Set());
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
      {open.length > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button className="underline" onClick={() => setSel(chosen.length === open.length ? new Set() : new Set(open.map((r) => r.id)))}>
            {chosen.length === open.length ? "Untick all" : `Tick all ${open.length}`}
          </button>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const on = sel.has(r.id);
          return (
            <li key={r.id}>
              <div
                role={r.picked ? undefined : "checkbox"}
                aria-checked={r.picked ? undefined : on}
                aria-label={r.name}
                tabIndex={r.picked ? undefined : 0}
                onClick={() => !r.picked && toggle(r.id)}
                onKeyDown={(e) => {
                  if (!r.picked && (e.key === " " || e.key === "Enter")) {
                    e.preventDefault();
                    toggle(r.id);
                  }
                }}
                className={`card flex h-full flex-col gap-2 p-2 ${r.picked ? "border-brand" : on ? "border-brand bg-brand/10" : "cursor-pointer hover:border-ink"}`}
              >
                <PlaySvg data={r.data} fit compact className="pointer-events-none block w-full border border-line" />
                <div className="flex items-start gap-2 px-1">
                  {!r.picked && <input type="checkbox" checked={on} readOnly tabIndex={-1} className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-xs text-muted">{r.tags}</div>
                    {!r.approved && <div className="text-xs text-warn">Not approved yet: players get it once you approve it.</div>}
                    {r.viaTopic && !r.picked && <div className="text-xs text-muted">Already in through {r.topicName}</div>}
                  </div>
                  {r.picked && (
                    <button
                      className="btn btn-outline min-h-8 shrink-0 px-2 text-xs"
                      disabled={!!busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        run([r.id], false, r.id);
                      }}
                    >
                      {busy === r.id ? "…" : "✓ In · Remove"}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {(chosen.length > 0 || error) && (
        <div className="sticky bottom-3 z-10 flex flex-col gap-1">
          {error && <p className="bg-warn-bg px-3 py-2 text-sm text-bad">{error}</p>}
          {chosen.length > 0 && (
            <button className="btn btn-primary min-h-12 shadow-lg" disabled={!!busy} onClick={() => run(chosen.map((r) => r.id), true, "add")}>
              {busy === "add" ? "Adding…" : `Add ${chosen.length} play${chosen.length === 1 ? "" : "s"} to the install`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Take one picked play out of the install (from the "In the install" list). */
export function RemovePlay({ teamId, id }: { teamId: string; id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="text-sm text-muted underline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await safeCall(() => setPlaysInstallAction(teamId, [id], false), "Removing");
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? "Removing…" : "Remove"}
    </button>
  );
}
