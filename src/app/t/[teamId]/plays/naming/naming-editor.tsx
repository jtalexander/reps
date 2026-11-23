"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NAMING_LIST_LABEL, NAMING_LISTS, type Naming, type NamingList, type Word } from "@/domain/naming";
import { safeCall } from "@/lib/safe-call";
import { draftNamingAction, saveNamingAction } from "../../teach/actions";
import { runAndWait } from "../../teach/wait-job";

const ROLES = ["QB", "RB", "WR", "TE", "OL", "flex"] as const;
const pagesText = (p: number[]) => p.join(", ");
const toPages = (s: string) =>
  s
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

/** Edit the naming rules in place: every row is an input; save or save and confirm. */
export function NamingEditor({ teamId, initial, approvedAt }: { teamId: string; initial: Naming | null; approvedAt: string | null }) {
  const router = useRouter();
  const [n, setN] = useState<Naming | null>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const draft = async () => {
    if (n && !confirm("Redraft from the playbook? Your edits here will be replaced.")) return;
    setBusy("Reading your playbook for its naming rules… (a minute or two)");
    setMsg(null);
    const r = await runAndWait(teamId, () => draftNamingAction(teamId), "Drafting the naming rules");
    setBusy(null);
    if (!r.ok) setMsg(r.error);
    else if (r.status === "failed") setMsg(r.error ?? "That didn't finish.");
    else {
      setMsg("Drafted. Check each section, fix anything wrong, then confirm.");
      router.refresh();
      setTimeout(() => location.reload(), 300);
    }
  };

  if (!n) {
    return (
      <div className="card flex flex-col gap-3 p-4">
        <p className="text-sm">Reps hasn&apos;t drafted your naming rules yet. It reads what it already found on every page (no new page reading) and writes them down for you to check.</p>
        <button className="btn btn-primary self-start" disabled={!!busy} onClick={draft}>
          {busy ? "Drafting…" : "Draft my naming rules"}
        </button>
        {busy && <p className="text-sm text-muted">{busy}</p>}
        {msg && <p className="text-sm text-bad">{msg}</p>}
      </div>
    );
  }

  const edit = (next: Naming) => {
    setN(next);
    setDirty(true);
  };
  const save = async (approve: boolean) => {
    setBusy(approve ? "Confirming…" : "Saving…");
    const r = await safeCall(() => saveNamingAction(teamId, n, approve), "Saving");
    setBusy(null);
    if (!r.ok) return setMsg(r.error);
    setDirty(false);
    setMsg(approve ? "Confirmed. Reps will use these when it converts your drawings." : "Saved.");
    router.refresh();
  };
  const setWord = (list: NamingList, i: number, patch: Partial<Word>) => edit({ ...n, [list]: n[list].map((w, j) => (j === i ? { ...w, ...patch } : w)) });

  return (
    <div className="flex flex-col gap-5">
      <div className={`flex flex-wrap items-center justify-between gap-2 border px-3 py-2 text-sm ${approvedAt && !dirty ? "border-ok bg-ok-bg text-ok" : "border-warn bg-warn-bg text-warn"}`}>
        <span className="font-semibold">
          {approvedAt && !dirty ? `Confirmed ${new Date(approvedAt).toLocaleDateString()}` : "Draft: check each section, fix anything wrong, then confirm."}
        </span>
        <button className="text-muted underline" disabled={!!busy} onClick={draft}>
          Redraft from the playbook
        </button>
      </div>

      <section className="card flex flex-col gap-2 p-4">
        <h2 className="text-2xl">Positions</h2>
        {n.positions.map((p, i) => (
          <div key={i} className="grid grid-cols-[3.5rem_1fr_5.5rem_2rem] gap-2 sm:grid-cols-[3.5rem_12rem_5.5rem_1fr_2rem]">
            <input className="input font-bold" value={p.letter} onChange={(e) => edit({ ...n, positions: n.positions.map((x, j) => (j === i ? { ...x, letter: e.target.value } : x)) })} aria-label="Letter" />
            <input className="input" value={p.name} onChange={(e) => edit({ ...n, positions: n.positions.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} aria-label="Name" />
            <select className="input" value={p.role} onChange={(e) => edit({ ...n, positions: n.positions.map((x, j) => (j === i ? { ...x, role: e.target.value as (typeof ROLES)[number] } : x)) })} aria-label="Role">
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <input className="input col-span-3 sm:col-span-1" value={p.notes} placeholder="Where he lines up" onChange={(e) => edit({ ...n, positions: n.positions.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)) })} aria-label="Notes" />
            <button className="text-muted" aria-label="Remove" onClick={() => edit({ ...n, positions: n.positions.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        <button className="self-start text-sm underline" onClick={() => edit({ ...n, positions: [...n.positions, { letter: "", name: "", role: "WR", notes: "" }] })}>
          Add a position
        </button>
      </section>

      <section className="card flex flex-col gap-2 p-4">
        <h2 className="text-2xl">Direction and call order</h2>
        <label className="label" htmlFor="dir-rule">
          What RIGHT / LEFT tells players
        </label>
        <textarea id="dir-rule" className="input min-h-16" value={n.direction.rule} onChange={(e) => edit({ ...n, direction: { ...n.direction, rule: e.target.value } })} />
        <label className="label" htmlFor="dir-words">
          Direction words (word = side, one per line)
        </label>
        <textarea
          id="dir-words"
          className="input min-h-16 font-mono text-sm"
          value={n.direction.words.map((w) => `${w.word} = ${w.side}`).join("\n")}
          onChange={(e) =>
            edit({
              ...n,
              direction: {
                ...n.direction,
                words: e.target.value
                  .split("\n")
                  .map((l) => l.split("="))
                  .filter((p) => p.length === 2 && p[0]!.trim())
                  .map(([w, s]) => ({ word: w!.trim(), side: /left/i.test(s!) ? ("left" as const) : ("right" as const) })),
              },
            })
          }
        />
        <label className="label" htmlFor="order">
          A full call is said in this order (comma between parts)
        </label>
        <input id="order" className="input" value={n.call_order.join(", ")} onChange={(e) => edit({ ...n, call_order: e.target.value.split(",").map((x) => x.trim()) })} />
      </section>

      {NAMING_LISTS.map((list) => (
        <section key={list} className="card flex flex-col gap-2 p-4">
          <h2 className="text-2xl">
            {NAMING_LIST_LABEL[list]} <span className="text-base text-muted">· {n[list].length}</span>
          </h2>
          {n[list].map((w, i) => (
            <div key={i} className="grid grid-cols-[8rem_1fr_2rem] gap-2 border-t border-line pt-2 sm:grid-cols-[10rem_1fr_6rem_2rem]">
              <input className="input font-bold" value={w.word} onChange={(e) => setWord(list, i, { word: e.target.value })} aria-label="Word" />
              <textarea className="input min-h-11 text-sm" value={w.means} onChange={(e) => setWord(list, i, { means: e.target.value })} aria-label="What it means" />
              <input
                className="input col-span-2 text-sm sm:col-span-1"
                defaultValue={pagesText(w.pages)}
                placeholder="Pages"
                onBlur={(e) => setWord(list, i, { pages: toPages(e.target.value) })}
                aria-label="Pages"
              />
              <button className="text-muted" aria-label="Remove" onClick={() => edit({ ...n, [list]: n[list].filter((_, j) => j !== i) })}>
                ✕
              </button>
            </div>
          ))}
          <button className="self-start text-sm underline" onClick={() => edit({ ...n, [list]: [...n[list], { word: "", means: "", pages: [] }] })}>
            Add one
          </button>
        </section>
      ))}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-line bg-bg py-3">
        <button className="btn btn-primary" disabled={!!busy} onClick={() => save(true)}>
          {busy === "Confirming…" ? busy : "Save and confirm"}
        </button>
        <button className="btn btn-outline" disabled={!!busy || !dirty} onClick={() => save(false)}>
          {busy === "Saving…" ? busy : "Save changes"}
        </button>
        {busy && busy.startsWith("Reading") && <span className="text-sm text-muted">{busy}</span>}
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </div>
  );
}
