"use client";
import { useState, useTransition } from "react";
import type { Concept } from "@/domain/concepts";
import { COVERAGE_LABEL } from "@/domain/defense";
import { COVERAGES } from "@/domain/play";
import { ROUTES } from "@/domain/routes";
import { saveConceptAction } from "../actions";

export function ConceptEditor({ teamId, concept, label, edited, plays }: { teamId: string; concept: Concept; label: string; edited: boolean; plays: number }) {
  const [open, setOpen] = useState(false);
  const [c, setC] = useState<Concept>(concept);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const passy = c.kind === "pass" || c.kind === "rpo" || c.kind === "screen";
  const optiony = c.kind === "option" || c.kind === "rpo";
  const routeOpts = [...new Set([...c.routes, ...c.progression.map((p) => p.route), ...ROUTES.map((r) => r.key)])];

  return (
    <div className="card">
      <button className="flex w-full items-center justify-between gap-2 p-3 text-left" onClick={() => setOpen((o) => !o)}>
        <div className="min-w-0">
          <div className="font-semibold">
            {label} <span className="text-xs font-normal text-muted">{c.kind}</span>
          </div>
          <div className="truncate text-xs text-muted">{c.summary}</div>
        </div>
        <div className="shrink-0 text-right text-xs">
          {edited && <div className="font-semibold text-suggest">Your version</div>}
          <div className="text-muted">{plays} plays</div>
        </div>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line p-3">
          <TA label="Summary" value={c.summary} onChange={(v) => setC({ ...c, summary: v })} />
          {passy && (
            <>
              <TA label="Presnap read" value={c.presnap_read ?? ""} onChange={(v) => setC({ ...c, presnap_read: v || null })} />
              <div>
                <div className="label">Progression (by route)</div>
                <ol className="flex flex-col gap-2">
                  {c.progression.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-2 w-5 text-sm font-bold">{i + 1}.</span>
                      <select className="input w-36 shrink-0" value={s.route} onChange={(e) => setC({ ...c, progression: c.progression.map((x, j) => (j === i ? { ...x, route: e.target.value } : x)) })}>
                        {routeOpts.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                      <input className="input" value={s.trigger} onChange={(e) => setC({ ...c, progression: c.progression.map((x, j) => (j === i ? { ...x, trigger: e.target.value } : x)) })} />
                      <button className="text-sm text-muted" onClick={() => setC({ ...c, progression: c.progression.filter((_, j) => j !== i) })} aria-label="Remove read">
                        ✕
                      </button>
                    </li>
                  ))}
                </ol>
                <button className="mt-2 text-sm underline" onClick={() => setC({ ...c, progression: [...c.progression, { route: c.routes[0] ?? "go", trigger: "" }] })}>
                  + Add read
                </button>
              </div>
              <div>
                <div className="label">Best throw vs coverage</div>
                <ul className="flex flex-col gap-2">
                  {COVERAGES.map((cov) => {
                    const a = c.vs_coverage[cov];
                    return (
                      <li key={cov} className="flex flex-wrap gap-2">
                        <span className="w-20 pt-2 text-sm font-semibold">{COVERAGE_LABEL[cov]}</span>
                        <select
                          className="input w-36"
                          value={a?.route ?? ""}
                          onChange={(e) => {
                            const vs = { ...c.vs_coverage };
                            if (e.target.value) vs[cov] = { route: e.target.value, why: a?.why ?? "" };
                            else delete vs[cov];
                            setC({ ...c, vs_coverage: vs });
                          }}
                        >
                          <option value="">—</option>
                          {routeOpts.map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                          <option value="run">run</option>
                        </select>
                        {a && <input className="input min-w-48 flex-1" value={a.why} placeholder="Why" onChange={(e) => setC({ ...c, vs_coverage: { ...c.vs_coverage, [cov]: { ...a, why: e.target.value } } })} />}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
          {optiony && (
            <>
              <TA label="Give rule" value={c.give_rule ?? ""} onChange={(v) => setC({ ...c, give_rule: v || null })} />
              <TA label={c.kind === "rpo" ? "Throw rule" : "Keep rule"} value={c.keep_rule ?? ""} onChange={(v) => setC({ ...c, keep_rule: v || null })} />
            </>
          )}
          {c.kind === "run" && (
            <>
              <TA label="Point of attack" value={c.point_of_attack ?? ""} onChange={(v) => setC({ ...c, point_of_attack: v || null })} />
              <TA label="Coaching points (one per line)" value={c.coaching_points.join("\n")} onChange={(v) => setC({ ...c, coaching_points: v.split("\n").filter(Boolean) })} />
            </>
          )}
          <div className="flex items-center gap-3">
            <button
              className="btn btn-primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const patch: Partial<Concept> = { ...c };
                  delete patch.key;
                  const r = await saveConceptAction(teamId, concept.key, patch);
                  setMsg(r.ok ? `Saved. Updated ${r.updated} play${r.updated === 1 ? "" : "s"}.` : r.error);
                })
              }
            >
              Save for my team
            </button>
            {msg && <span className="text-sm text-muted">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function TA({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="label">{label}</div>
      <textarea className="input py-2 text-sm" rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
