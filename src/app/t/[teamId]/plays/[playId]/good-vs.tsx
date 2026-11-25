"use client";
import { useState } from "react";
import type { PlayLooks } from "@/server/matchups";
import { safeCall } from "@/lib/safe-call";
import { addPlayLookAction, keepSuggestedLooksAction, setPlayLookAction } from "../../actions";

/**
 * What this play is good against. RepWon suggests tags from the play's concept
 * and from what the playbook says; the coach keeps or drops each one and can
 * add his own. Only kept tags count in the game plan and quizzes.
 */
export function GoodVs({ teamId, playId, initial }: { teamId: string; playId: string; initial: PlayLooks }) {
  const [looks, setLooks] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [own, setOwn] = useState("");
  const [pick, setPick] = useState("");
  const offense = looks.side === "offense";

  const run = async (what: string, fn: () => ReturnType<typeof setPlayLookAction>) => {
    setBusy(what);
    setError(null);
    const r = await safeCall(fn, "Saving");
    setBusy(null);
    if (!r.ok) return setError(r.error);
    if (r.looks) setLooks(r.looks);
  };
  const groups = [...new Set(looks.options.map((o) => o.group))];

  return (
    <section className="card flex flex-col gap-3 p-4" aria-label="Good against">
      <div>
        <h2 className="font-semibold">{offense ? "Good against these defenses" : "Good against these offenses"}</h2>
        <p className="text-sm text-muted">
          {offense
            ? "Tag the looks this play beats. They show up in the game plan and in your QB's play-call quiz."
            : "Tag what this call stops. They show up in the game plan and in your defense's call quiz."}
        </p>
      </div>

      {looks.yes.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {looks.yes.map((t) => (
            <li key={t.key} className="flex items-center gap-1 border border-brand bg-brand/10 px-2 py-1 text-sm font-semibold">
              {t.label}
              <button className="ml-1 px-1 text-muted" aria-label={`Take off ${t.label}`} disabled={!!busy} onClick={() => run(t.key, () => setPlayLookAction(teamId, playId, t.key, false))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nothing tagged yet.</p>
      )}

      {looks.suggested.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">RepWon suggests</span>
            <button className="btn btn-outline min-h-9 px-3 text-sm" disabled={!!busy} onClick={() => run("all", () => keepSuggestedLooksAction(teamId, playId))}>
              {busy === "all" ? "Keeping…" : `Keep all ${looks.suggested.length}`}
            </button>
          </div>
          <ul className="flex flex-col gap-1">
            {looks.suggested.map((s) => (
              <li key={s.key} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-32 font-semibold">{s.label}</span>
                <span className="text-xs text-muted">{s.from === "playbook" ? "your playbook says so" : offense ? "what this concept usually beats" : "what this coverage usually stops"}</span>
                <span className="ml-auto flex gap-1">
                  <button className="border border-line px-2 py-1" disabled={!!busy} onClick={() => run(s.key, () => setPlayLookAction(teamId, playId, s.key, true))}>
                    Keep
                  </button>
                  <button className="border border-line px-2 py-1 text-muted" disabled={!!busy} onClick={() => run(s.key, () => setPlayLookAction(teamId, playId, s.key, false))}>
                    No
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto flex-1" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Add a tag">
            <option value="">Add a tag…</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {looks.options
                  .filter((o) => o.group === g)
                  .map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <button
            className="btn btn-outline"
            disabled={!pick || !!busy}
            onClick={() =>
              run("pick", async () => {
                const r = await setPlayLookAction(teamId, playId, pick, true);
                setPick("");
                return r;
              })
            }
          >
            Add
          </button>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!own.trim()) return;
            void run("own", async () => {
              const r = await addPlayLookAction(teamId, playId, own);
              if (r.ok) setOwn("");
              return r;
            });
          }}
        >
          <input className="input flex-1" value={own} maxLength={40} onChange={(e) => setOwn(e.target.value)} placeholder={offense ? "Or type your own, e.g. Cover 6" : "Or type your own, e.g. Trips Open"} />
          <button className="btn btn-outline" disabled={!own.trim() || !!busy}>
            Add
          </button>
        </form>
      </div>
      {error && <p className="bg-warn-bg px-3 py-2 text-sm text-bad">{error}</p>}
    </section>
  );
}
