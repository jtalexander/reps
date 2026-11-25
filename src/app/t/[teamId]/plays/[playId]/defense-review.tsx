"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlaySvg } from "@/components/play-svg";
import { applyCoverage, callName, coverageOf, defJobText, DEF_JOB_LABEL, GAPS, ZONE_LABEL } from "@/domain/defense-play";
import { DEF_ASSIGNMENT_TYPES, isLineman, type PlayData, type Player } from "@/domain/play";
import { safeCall } from "@/lib/safe-call";
import { approveAction, savePlayAction, unapproveAction } from "../../actions";

type Parts = NonNullable<PlayData["defense"]>;

/**
 * Check a defensive call: the drawing next to Reps' version, the call's
 * parts (front, coverage, stunt, pressure) and every defender's job. Fix
 * anything, save, approve.
 */
export function DefenseReview(props: { teamId: string; playId: string; initial: PlayData; status: string; cropUrl: string | null; nextId: string | null }) {
  const router = useRouter();
  const [data, setData] = useState<PlayData>(props.initial);
  const [status, setStatus] = useState(props.status);
  const [dirty, setDirty] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const parts: Parts = data.defense ?? { front: null, coverage: null, stunt: null, pressure: null };
  const vs = data.vs ?? [];
  const receivers = vs.filter((p) => !isLineman(p.id) && p.id !== "QB");

  const change = (fn: (d: PlayData) => PlayData) => {
    setData((d) => fn(d));
    setDirty(true);
    setMsg(null);
  };
  const setPart = (k: keyof Parts, v: string) => change((d) => ({ ...d, defense: { ...parts, [k]: v.trim() ? v : null } }));
  const setPlayer = (id: string, patch: Partial<Player>) => change((d) => ({ ...d, players: d.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const setDef = (p: Player, patch: Partial<NonNullable<Player["def"]>>) => setPlayer(p.id, { def: { gap: null, zone: null, man: null, technique: null, ...p.def, ...patch }, path: null });

  const save = async () => {
    setBusy(true);
    const name = data.name && data.name !== "unknown" ? data.name : callName(parts) || "unknown";
    const r = await safeCall(() => savePlayAction(props.teamId, props.playId, { ...data, name, side: "defense" }), "Saving");
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setStatus(r.status);
    setDirty(false);
    setMsg({ ok: true, text: "Saved. Approve it once it matches your drawing." });
    router.refresh();
  };
  const approve = async (on: boolean) => {
    setBusy(true);
    const r = on ? await safeCall(() => approveAction(props.teamId, props.playId), "Approving") : await safeCall(() => unapproveAction(props.teamId, props.playId), "Taking back");
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setStatus(on ? "approved" : "draft");
    setMsg({ ok: true, text: on ? "Approved. Your defense gets it in their quizzes." : "Back to check." });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link href={`/t/${props.teamId}/plays`} className="text-sm text-muted underline">
            Playbook
          </Link>
          <h1 className="text-3xl">{data.name !== "unknown" ? data.name : callName(parts) || "Defensive call"}</h1>
          <p className="text-sm text-muted">Defensive call · {status === "approved" ? "approved" : "to check"}</p>
          <p className="flex flex-wrap gap-x-4 text-sm font-semibold">
            <Link href={`/t/${props.teamId}/plays/build?play=${props.playId}`} className="underline">
              Move defenders and lines in the builder
            </Link>
            <Link href={`/t/${props.teamId}/plays/build?copy=${props.playId}`} className="underline">
              Copy it and change something
            </Link>
          </p>
        </div>
        {props.nextId && (
          <Link href={`/t/${props.teamId}/plays/${props.nextId}`} className="text-sm underline">
            Next to check
          </Link>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {props.cropUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.cropUrl} alt="The drawing in your playbook" className="card w-full" />
        )}
        <div className="card p-2">
          <PlaySvg data={data} fit selected={sel} onPlayerTap={(id) => setSel(id === sel ? null : id)} className="block w-full" />
        </div>
      </div>

      <section className="card grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
        {(
          [
            ["front", "Front"],
            ["coverage", "Coverage"],
            ["stunt", "Stunt"],
            ["pressure", "Pressure / blitz"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex flex-col gap-1 text-xs">
            {label}
            <input className="input" value={parts[k] ?? ""} onChange={(e) => setPart(k, e.target.value)} />
          </label>
        ))}
        <button
          className="col-span-2 self-end border border-line px-3 py-2 text-sm sm:col-span-4 sm:justify-self-start"
          disabled={!coverageOf(parts.coverage ?? "")}
          onClick={() => change((d) => ({ ...d, players: applyCoverage(d.players, coverageOf(parts.coverage ?? ""), vs) }))}
          title="Gives every defender the usual job for this coverage"
        >
          Fill jobs from the coverage
        </button>
      </section>

      <section className="card flex flex-col p-3">
        <h2 className="pb-2 font-semibold">Jobs</h2>
        <ul className="flex flex-col">
          {data.players.map((p) => {
            const t = String(p.assignment_type);
            return (
              <li key={p.id} className={`flex flex-wrap items-center gap-2 border-t border-line py-2 text-sm ${sel === p.id ? "bg-brand/10" : ""}`} onClick={() => setSel(p.id)}>
                <span className="w-10 font-bold">{p.id}</span>
                <select className="input w-auto" value={DEF_ASSIGNMENT_TYPES.includes(t as never) ? t : ""} onChange={(e) => setPlayer(p.id, { assignment_type: (e.target.value || "unknown") as Player["assignment_type"], path: null })} aria-label={`${p.id}'s job`}>
                  <option value="">No job</option>
                  {DEF_ASSIGNMENT_TYPES.map((j) => (
                    <option key={j} value={j}>
                      {DEF_JOB_LABEL[j]}
                    </option>
                  ))}
                </select>
                {(t === "rush" || t === "gap" || t === "blitz") && (
                  <select className="input w-auto" value={p.def?.gap ?? ""} onChange={(e) => setDef(p, { gap: e.target.value || null })} aria-label={`${p.id}'s gap`}>
                    <option value="">Gap…</option>
                    {GAPS.map((g) => (
                      <option key={g} value={g}>
                        {g} gap
                      </option>
                    ))}
                  </select>
                )}
                {t === "zone_drop" && (
                  <select className="input w-auto" value={p.def?.zone ?? ""} onChange={(e) => setDef(p, { zone: e.target.value || null })} aria-label={`${p.id}'s zone`}>
                    <option value="">Zone…</option>
                    {Object.entries(ZONE_LABEL).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                )}
                {t === "man" && (
                  <select className="input w-auto" value={p.def?.man ?? ""} onChange={(e) => setDef(p, { man: e.target.value || null })} aria-label={`Who ${p.id} covers`}>
                    <option value="">Who…</option>
                    {receivers.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id}
                      </option>
                    ))}
                  </select>
                )}
                <span className="ml-auto text-xs text-muted">{defJobText(p)}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {msg && <p className={`px-3 py-2 text-sm ${msg.ok ? "text-ok" : "bg-warn-bg text-bad"}`}>{msg.text}</p>}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <button className="btn btn-outline" disabled={busy || !dirty} onClick={save}>
            {busy && dirty ? "Saving…" : "Save changes"}
          </button>
          {status === "approved" ? (
            <button className="btn btn-outline" disabled={busy || dirty} onClick={() => approve(false)}>
              Take back approval
            </button>
          ) : (
            <button className="btn btn-primary" disabled={busy || dirty} onClick={() => approve(true)} title={dirty ? "Save your changes first" : undefined}>
              Looks right: approve
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
