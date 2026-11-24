"use client";
/**
 * One section at a time: Reps shows what it read in plain words, the coach
 * taps Yes or Fix. Fixes are saved as they go; the last step confirms the
 * rules (and the route tree, when the playbook had one).
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageView } from "@/components/page-view";
import { NAMING_LIST_LABEL, NAMING_LISTS, type Naming, type NamingList, type Word } from "@/domain/naming";
import { cleanTree, type RouteTree } from "@/domain/route-tree";
import { normalizeRouteName } from "@/domain/routes";
import { safeCall } from "@/lib/safe-call";
import type { PageRef } from "@/teach/page-images";
import { confirmNamingAction, saveNamingAction } from "../../../teach/actions";

const ROLES = ["QB", "RB", "WR", "TE", "OL", "flex"] as const;
const LIST_HELP: Record<NamingList, string> = {
  formations: "The base formation words in your play calls.",
  formation_tags: "Words added to a formation that move players.",
  backfields: "Words that set the backs.",
  motions: "Motion and shift words.",
  plays: "Your run, pass, screen and trick play names.",
  other: "Protections, tempos, cadence, audibles and other calls.",
};

type StepKey = "positions" | "call" | NamingList | "routes" | "done";
type TreeRow = { n: string; word: string; route: string | null };

export function NamingCheck({
  teamId,
  initial,
  pages,
  routes,
  hasRouteTree,
}: {
  teamId: string;
  initial: Naming;
  pages: Record<number, PageRef>;
  routes: { key: string; label: string }[];
  hasRouteTree: boolean;
}) {
  const [n, setN] = useState<Naming>(initial);
  const known = useMemo(() => new Set(routes.map((r) => r.key)), [routes]);
  const [tree, setTree] = useState<TreeRow[]>(() =>
    (initial.route_tree ?? []).map((w) => {
      const k = normalizeRouteName(w.route);
      return { n: w.number.replace(/\D/g, ""), word: w.route, route: known.has(k) ? k : null };
    }),
  );
  const steps = useMemo<StepKey[]>(() => {
    const s: StepKey[] = [];
    if (initial.positions.length) s.push("positions");
    if (initial.call_order.length || initial.direction.rule || initial.direction.words.length) s.push("call");
    for (const l of NAMING_LISTS) if (initial[l].length) s.push(l);
    if (!hasRouteTree && (initial.route_tree?.length ?? 0) > 0) s.push("routes");
    s.push("done");
    return s;
  }, [initial, hasRouteTree]);
  const [i, setI] = useState(0);
  const [fixing, setFixing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<null | { routeTree: boolean }>(null);
  const [openPage, setOpenPage] = useState<string | null>(null);
  const step = steps[i]!;

  const edit = (next: Naming) => {
    setN(next);
    setDirty(true);
  };
  const saveDraft = async () => {
    if (!dirty) return true;
    setBusy("Saving…");
    const r = await safeCall(() => saveNamingAction(teamId, n, false), "Saving");
    setBusy(null);
    if (!r.ok) {
      setMsg(r.error);
      return false;
    }
    setDirty(false);
    return true;
  };
  const go = async (to: number) => {
    if (!(await saveDraft())) return;
    setFixing(false);
    setOpenPage(null);
    setMsg(null);
    setI(Math.max(0, Math.min(steps.length - 1, to)));
    window.scrollTo({ top: 0 });
  };
  // "skip" = the coach left that number out
  const treeReady = tree.every((r) => r.route !== null || r.word === "");
  const confirm = async () => {
    setBusy("Confirming…");
    const routeTree: RouteTree | null = steps.includes("routes")
      ? cleanTree({ numbered: true, routes: tree.filter((r) => r.route && r.route !== "skip").map((r) => ({ n: r.n, route: r.route! })) })
      : null;
    const r = await safeCall(() => confirmNamingAction(teamId, n, routeTree), "Confirming");
    setBusy(null);
    if (!r.ok) return setMsg(r.error);
    setDone({ routeTree: r.routeTree });
  };

  if (done)
    return (
      <div className="card flex flex-col gap-3 p-4">
        <p className="text-2xl font-bold text-ok">Done. Your naming rules are confirmed.</p>
        <p className="text-sm">Reps now names your players and plays with your words when it turns drawings into plays, and the play builder builds calls the way you say them.</p>
        {done.routeTree && <p className="text-sm">Your route tree is saved too, and Football basics teaches it to your receivers.</p>}
        <div className="flex flex-wrap gap-2">
          <Link href={`/t/${teamId}/plays/converted`} className="btn btn-primary">
            Turn my drawings into plays
          </Link>
          <Link href={`/t/${teamId}/teach`} className="btn btn-outline">
            Back to Teach
          </Link>
        </div>
      </div>
    );

  const pageButtons = (id: string, nums: number[]) =>
    nums
      .filter((p) => pages[p])
      .slice(0, 4)
      .map((p) => (
        <button key={p} className="text-xs text-muted underline" onClick={() => setOpenPage(openPage === `${id}:${p}` ? null : `${id}:${p}`)}>
          {openPage === `${id}:${p}` ? "hide" : `p${p}`}
        </button>
      ));
  const shownPage = (id: string) => {
    if (!openPage?.startsWith(`${id}:`)) return null;
    const p = pages[Number(openPage.split(":")[1])];
    return p ? <PageView url={p.url} width={p.width} height={p.height} className="mt-1 w-full rounded border border-line" /> : null;
  };

  const listView = (list: NamingList) => (
    <ul className="flex flex-col">
      {n[list].map((w, j) => (
        <li key={j} className="flex flex-col border-t border-line py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-label font-bold tracking-wide uppercase">{w.word || "(blank)"}</span>
            <span className="flex gap-2">{pageButtons(`${list}${j}`, w.pages)}</span>
          </div>
          {w.means && <span className="text-sm text-muted">{w.means}</span>}
          {shownPage(`${list}${j}`)}
        </li>
      ))}
    </ul>
  );
  const listFix = (list: NamingList) => {
    const setWord = (j: number, patch: Partial<Word>) => edit({ ...n, [list]: n[list].map((w, k) => (k === j ? { ...w, ...patch } : w)) });
    return (
      <div className="flex flex-col gap-2">
        {n[list].map((w, j) => (
          <div key={j} className="flex flex-col gap-1 border-t border-line pt-2">
            <div className="flex gap-2">
              <input className="input font-bold" value={w.word} onChange={(e) => setWord(j, { word: e.target.value })} aria-label="Word" />
              <button className="btn btn-ghost px-3 text-muted" aria-label={`Remove ${w.word}`} onClick={() => edit({ ...n, [list]: n[list].filter((_, k) => k !== j) })}>
                ✕
              </button>
            </div>
            <textarea className="input min-h-11 text-sm" value={w.means} placeholder="What it tells players" onChange={(e) => setWord(j, { means: e.target.value })} aria-label="What it means" />
          </div>
        ))}
        <button className="self-start text-sm underline" onClick={() => edit({ ...n, [list]: [...n[list], { word: "", means: "", pages: [] }] })}>
          Add one
        </button>
      </div>
    );
  };

  let title = "";
  let help = "";
  let view: React.ReactNode = null;
  let fix: React.ReactNode = null;
  if (step === "positions") {
    title = "Your positions";
    help = "The letter on your diagrams and what you call that player.";
    view = (
      <ul className="flex flex-col">
        {n.positions.map((p, j) => (
          <li key={j} className="flex flex-col border-t border-line py-2">
            <span>
              <b className="font-label tracking-wide">{p.letter}</b> · {p.name} <span className="text-xs text-muted">({p.role})</span>
            </span>
            {p.notes && <span className="text-sm text-muted">{p.notes}</span>}
          </li>
        ))}
      </ul>
    );
    fix = (
      <div className="flex flex-col gap-2">
        {n.positions.map((p, j) => {
          const set = (patch: Partial<typeof p>) => edit({ ...n, positions: n.positions.map((x, k) => (k === j ? { ...x, ...patch } : x)) });
          return (
            <div key={j} className="flex flex-col gap-1 border-t border-line pt-2">
              <div className="flex gap-2">
                <input className="input w-16 font-bold" value={p.letter} onChange={(e) => set({ letter: e.target.value })} aria-label="Letter" />
                <input className="input" value={p.name} onChange={(e) => set({ name: e.target.value })} aria-label="Name" />
                <select className="input w-24" value={p.role} onChange={(e) => set({ role: e.target.value as (typeof ROLES)[number] })} aria-label="Group">
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <button className="btn btn-ghost px-3 text-muted" aria-label={`Remove ${p.letter}`} onClick={() => edit({ ...n, positions: n.positions.filter((_, k) => k !== j) })}>
                  ✕
                </button>
              </div>
              <input className="input text-sm" value={p.notes} placeholder="Where he lines up" onChange={(e) => set({ notes: e.target.value })} aria-label="Where he lines up" />
            </div>
          );
        })}
        <button className="self-start text-sm underline" onClick={() => edit({ ...n, positions: [...n.positions, { letter: "", name: "", role: "WR", notes: "" }] })}>
          Add a position
        </button>
      </div>
    );
  } else if (step === "call") {
    title = "How a play is called";
    help = "The order the parts of a call are said in, and what RIGHT and LEFT tell players.";
    view = (
      <div className="flex flex-col gap-2 text-sm">
        {n.call_order.length > 0 && <p className="font-label text-base font-bold tracking-wide uppercase">{n.call_order.join(" → ")}</p>}
        {n.direction.rule && <p>{n.direction.rule}</p>}
        {n.direction.words.length > 0 && <p className="text-muted">Direction words: {n.direction.words.map((w) => `${w.word} (${w.side})`).join(", ")}</p>}
      </div>
    );
    fix = (
      <div className="flex flex-col gap-2">
        <label className="label" htmlFor="order">
          A call is said in this order (commas between parts)
        </label>
        <input id="order" className="input" value={n.call_order.join(", ")} onChange={(e) => edit({ ...n, call_order: e.target.value.split(",").map((x) => x.trim()) })} />
        <label className="label" htmlFor="rule">
          What RIGHT / LEFT tells players
        </label>
        <textarea id="rule" className="input min-h-16" value={n.direction.rule} onChange={(e) => edit({ ...n, direction: { ...n.direction, rule: e.target.value } })} />
      </div>
    );
  } else if (step === "routes") {
    title = "Your route tree";
    help = "Your playbook numbers its routes. Check each number; pick the route for any Reps couldn't match.";
    const setRow = (j: number, route: string | null) => setTree(tree.map((r, k) => (k === j ? { ...r, route } : r)));
    view = (
      <ul className="flex flex-col">
        {tree.map((r, j) => (
          <li key={j} className="flex items-center justify-between gap-2 border-t border-line py-2">
            <span>
              <b className="font-mono">{r.n}</b> · {r.word}
            </span>
            {r.route && r.route !== "skip" && !fixing ? (
              <span className="text-sm text-muted">{routes.find((x) => x.key === r.route)?.label}</span>
            ) : (
              <select className="input w-40" value={r.route ?? ""} onChange={(e) => setRow(j, e.target.value || null)} aria-label={`Route for ${r.n}`}>
                <option value="">Pick the route…</option>
                <option value="skip">Leave this number out</option>
                {routes.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
            )}
          </li>
        ))}
      </ul>
    );
    fix = view;
  } else if (step !== "done") {
    title = NAMING_LIST_LABEL[step];
    help = LIST_HELP[step];
    view = listView(step);
    fix = listFix(step);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>
          Step {i + 1} of {steps.length}
        </span>
        <span className="h-1.5 flex-1 bg-line">
          <span className="block h-full bg-brand" style={{ width: `${((i + 1) / steps.length) * 100}%` }} />
        </span>
      </div>

      {step === "done" ? (
        <div className="card flex flex-col gap-3 p-4">
          <h2 className="text-2xl">That&apos;s everything</h2>
          <p className="text-sm">Confirm and Reps will use these rules to name your players and plays.</p>
          <button className="btn btn-primary self-start" disabled={!!busy} onClick={confirm}>
            {busy ?? "Confirm my naming rules"}
          </button>
        </div>
      ) : (
        <div className="card flex flex-col gap-3 p-4">
          <div>
            <h2 className="text-2xl">
              {title}
              {step !== "positions" && step !== "call" && step !== "routes" ? <span className="text-base text-muted"> · {n[step].length}</span> : null}
            </h2>
            <p className="text-sm text-muted">{help}</p>
          </div>
          {fixing ? fix : view}
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            {fixing ? (
              <button className="btn btn-primary" disabled={!!busy} onClick={() => saveDraft().then((ok) => ok && setFixing(false))}>
                {busy ?? "Done fixing"}
              </button>
            ) : (
              <>
                <button className="btn btn-primary" disabled={!!busy || (step === "routes" && !treeReady)} onClick={() => go(i + 1)}>
                  {busy ?? "Yes, that's right"}
                </button>
                {step !== "routes" && (
                  <button className="btn btn-outline" onClick={() => setFixing(true)}>
                    Fix something
                  </button>
                )}
              </>
            )}
          </div>
          {step === "routes" && !treeReady && <p className="text-xs text-warn">Pick a route for each number Reps couldn&apos;t match.</p>}
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        <button className="text-muted underline disabled:opacity-40" disabled={i === 0 || !!busy} onClick={() => go(i - 1)}>
          Back
        </button>
        <Link href={`/t/${teamId}/plays/naming`} className="text-muted underline">
          See it all on one page
        </Link>
      </div>
      {msg && <p className="text-sm text-bad">{msg}</p>}
    </div>
  );
}
