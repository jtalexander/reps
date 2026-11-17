"use client";
import { useState, useTransition } from "react";
import { CONCEPT_LIBRARY } from "@/domain/concepts";
import { COVERAGE_LABEL, READ_KEYS } from "@/domain/defense";
import { COVERAGES, POSITIONS } from "@/domain/play";
import { ROUTES } from "@/domain/routes";
import type { Terms, TermKind } from "@/domain/terms";
import { saveTermsAction } from "../actions";

const GROUPS: Array<{ kind: TermKind; label: string; items: Array<[string, string]> }> = [
  { kind: "positions", label: "Positions", items: POSITIONS.map((p) => [p, p]) },
  { kind: "routes", label: "Routes", items: ROUTES.map((r) => [r.key, r.label]) },
  { kind: "concepts", label: "Concepts", items: CONCEPT_LIBRARY.map((c) => [c.key, c.name]) },
  { kind: "coverages", label: "Coverages", items: COVERAGES.map((c) => [c, COVERAGE_LABEL[c]]) },
  { kind: "read_keys", label: "Read keys", items: READ_KEYS.map((k) => [k.key, k.label]) },
];

export function TermsEditor({ teamId, initial }: { teamId: string; initial: Terms }) {
  const [terms, setTerms] = useState<Terms>(initial);
  const [open, setOpen] = useState<TermKind | null>("positions");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card flex flex-col gap-3 p-4">
      <div>
        <h2 className="font-semibold">Your terminology</h2>
        <p className="text-sm text-muted">Rename anything to match your system. Quizzes always use your words. Leave blank to keep the default.</p>
      </div>
      {GROUPS.map((g) => (
        <div key={g.kind} className="rounded-lg border border-line">
          <button className="flex w-full items-center justify-between px-3 py-2 text-left font-medium" onClick={() => setOpen(open === g.kind ? null : g.kind)}>
            {g.label}
            <span className="text-xs text-muted">{Object.keys(terms[g.kind]).length} renamed {open === g.kind ? "▲" : "▼"}</span>
          </button>
          {open === g.kind && (
            <div className="grid gap-2 px-3 pb-3 sm:grid-cols-2">
              {g.items.map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <span className="w-32 shrink-0 truncate text-muted">{label}</span>
                  <input
                    className="input min-h-9"
                    value={terms[g.kind][key] ?? ""}
                    placeholder={label}
                    onChange={(e) => setTerms((t) => ({ ...t, [g.kind]: { ...t[g.kind], [key]: e.target.value } }))}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveTermsAction(teamId, terms);
              setMsg(r.ok ? "Saved." : r.error);
            })
          }
        >
          Save terminology
        </button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </section>
  );
}
