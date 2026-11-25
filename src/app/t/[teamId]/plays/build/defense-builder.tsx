"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PlaySvg, type LineRef } from "@/components/play-svg";
import { BLOCK_FRONTS } from "@/domain/blocking";
import { applyCoverage, blankDefense, frontAgainst, callName, coverageOf, DEF_FRONTS, DEF_JOB_LABEL, defJobText, frontLineup, frontOf, GAPS, gapX, ZONE_LABEL, zoneSpot } from "@/domain/defense-play";
import type { Naming } from "@/domain/naming";
import { DEF_ASSIGNMENT_TYPES, isLineman, type Line, type PlayData, type Player, type Point } from "@/domain/play";
import { simplify } from "@/domain/sketch";
import { safeCall } from "@/lib/safe-call";
import { addToPlanAction } from "../../gameplan/actions";
import { saveBuiltPlayAction } from "../../actions";
import { blankLineup, mk, PenGroup, Pick } from "./play-builder";

type Parts = { front: string; coverage: string; stunt: string; pressure: string };

/** The time, for grouping a drag into one undo step (only called from taps and drags). */
const clock = () => Date.now();

/** Offenses to draw a call against. */
function offense(kind: string, n: Naming | null): Player[] {
  const line = [mk("LT", -2.6, 0), mk("LG", -1.3, 0), mk("C", 0, 0), mk("RG", 1.3, 0), mk("RT", 2.6, 0)];
  switch (kind) {
    case "trips":
      return [mk("X", -14, 0), ...line, mk("Y", 5, -1), mk("H", 9, -1), mk("Z", 14, 0), mk("QB", 0, -5), mk("F", -1.5, -5)];
    case "i":
      return [mk("X", -14, 0), ...line, mk("Y", 3.9, 0), mk("Z", 12, -1), mk("QB", 0, -1), mk("F", 0, -4), mk("H", 0, -6.5)];
    case "empty":
      return [mk("X", -14, 0), mk("F", -9, -1), ...line, mk("H", 6, -1), mk("Y", 9.5, -1), mk("Z", 14, 0), mk("QB", 0, -5)];
    default:
      return blankLineup(n);
  }
}

/**
 * Draw a defensive call: pick the front and coverage (in the team's words or
 * the usual ones) and RepWon lines the defenders up and gives them their jobs;
 * drag anyone, draw lines, tap a defender to change his job.
 */
export function DefenseBuilder(props: { teamId: string; naming: Naming | null; start: PlayData | null; playId: string | null; formations?: Array<{ id: string; name: string; players: Player[] }>; planId?: string | null }) {
  const router = useRouter();
  const n = props.naming;
  const [against, setAgainst] = useState("2x2");
  const [data, setData] = useState<PlayData>(() => props.start ?? blankDefense(offense("2x2", n)));
  const [parts, setPartsRaw] = useState<Parts>({
    front: props.start?.defense?.front ?? "4-3",
    coverage: props.start?.defense?.coverage ?? "",
    stunt: props.start?.defense?.stunt ?? "",
    pressure: props.start?.defense?.pressure ?? "",
  });
  const [ownName, setOwnName] = useState(props.start && props.start.name !== "unknown" ? props.start.name : "");
  const [sel, setSel] = useState<string | null>(null);
  const [line, setLine] = useState<LineRef | null>(null);
  const [mode, setMode] = useState<"move" | "draw">("move");
  const [pen, setPen] = useState<Line>({ style: "solid", end: "arrow" });
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const vs = data.vs ?? [];
  const name = ownName || callName(parts);

  // undo: every change is a step; a drag is one step
  const [history, setHistory] = useState<Array<{ data: PlayData; parts: Parts }>>([]);
  const lastAt = useRef(0);
  const commit = (next: { data?: PlayData; parts?: Parts }, coalesce = false) => {
    const now = clock();
    if (!coalesce || now - lastAt.current > 600) setHistory((h) => [...h.slice(-79), { data, parts }]);
    lastAt.current = now;
    if (next.data) setData(next.data);
    if (next.parts) setPartsRaw(next.parts);
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setData(prev.data);
    setPartsRaw(prev.parts);
    setLine(null);
    lastAt.current = 0;
  };

  // picking the front lines the defenders up; picking the coverage gives the back seven their jobs
  const setParts = (next: Parts) => {
    let players = data.players;
    const notes: string[] = [];
    if (next.front !== parts.front) {
      // by technique against the offense drawn; else the usual spots for the front
      const placed = frontAgainst(next.front, vs);
      const f = frontOf(next.front);
      if (placed) players = placed;
      else if (f) players = frontLineup(f);
      else if (next.front.trim()) notes.push(`RepWon doesn't know where ${next.front} lines up: drag the defenders into place.`);
    }
    if (next.coverage !== parts.coverage || next.front !== parts.front) {
      const c = coverageOf(next.coverage);
      if (c || next.front !== parts.front) players = applyCoverage(players, c, vs);
      if (next.coverage.trim() && !c) notes.push(`RepWon doesn't know ${next.coverage}: tap each defender to give him his job.`);
    }
    commit({ parts: next, data: { ...data, players } });
    setNote(notes.join(" ") || null);
  };

  const setPlayer = (id: string, patch: Partial<Player>, coalesce = false) =>
    commit({ data: { ...data, players: data.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) } }, coalesce);
  const setDef = (p: Player, patch: Partial<NonNullable<Player["def"]>>) => setPlayer(p.id, { def: { gap: null, zone: null, man: null, technique: null, ...p.def, ...patch }, path: null });
  const me = data.players.find((p) => p.id === sel) ?? null;
  const receivers = vs.filter((p) => !isLineman(p.id) && p.id !== "QB");

  /** A line drawn from a defender: through the line is a rush or blitz, back deep is a zone drop, dotted to a receiver is man. */
  const onDraw = (id: string, pts: Point[]) => {
    const p = data.players.find((x) => x.id === id);
    if (!p || pts.length < 2) return;
    const rel = simplify(pts, 0.35).map(([x, y]) => [Math.round((x - p.x) * 10) / 10, Math.round((y - p.y) * 10) / 10] as Point);
    rel[0] = [0, 0];
    const end = pts[pts.length - 1]!;
    const nearestGap = () => {
      const all = GAPS.flatMap((g) => [-1, 1].map((s) => ({ g, x: gapX(g, s, vs) })));
      return all.sort((a, b) => Math.abs(a.x - end[0]) - Math.abs(b.x - end[0]))[0]!.g;
    };
    let job: Partial<Player>;
    let said: string;
    if (pen.style === "dotted") {
      const r = [...receivers].sort((a, b) => Math.hypot(a.x - end[0], a.y - end[1]) - Math.hypot(b.x - end[0], b.y - end[1]))[0];
      job = { assignment_type: "man", def: { gap: null, zone: null, man: r?.id ?? null, technique: null } };
      said = r ? `${id}: man on ${r.id}` : `${id}: man`;
    } else if (end[1] < 0.6) {
      const gap = nearestGap();
      const t = p.y < 2 ? "rush" : "blitz";
      job = { assignment_type: t, def: { gap, zone: null, man: null, technique: null } };
      said = `${id}: ${t} the ${gap} gap`;
    } else if (end[1] > p.y + 2) {
      const zone = Object.keys(ZONE_LABEL).sort((a, b) => {
        const za = zoneSpot(a, p);
        const zb = zoneSpot(b, p);
        return Math.hypot(za[0] - end[0], za[1] - end[1]) - Math.hypot(zb[0] - end[0], zb[1] - end[1]);
      })[0]!;
      job = { assignment_type: "zone_drop", def: { gap: null, zone, man: null, technique: null } };
      said = `${id}: ${ZONE_LABEL[zone]!.toLowerCase()}`;
    } else {
      job = { assignment_type: "gap", def: { gap: nearestGap(), zone: null, man: null, technique: null } };
      said = `${id}: gap`;
    }
    setPlayer(id, { ...job, path: rel });
    setSel(id);
    setNote(`Got it: ${said}. Change his job below if that's not it.`);
  };

  const deleteLine = (l: LineRef) => {
    setPlayer(l.id, { assignment_type: "unknown", def: null, path: null });
    setLine(null);
  };
  const keys = useRef({ undo, deleteLine, line });
  useEffect(() => {
    keys.current = { undo, deleteLine, line };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        keys.current.undo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && keys.current.line) {
        e.preventDefault();
        keys.current.deleteLine(keys.current.line);
      } else if (e.key === "Escape") setLine(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const play: PlayData = {
      ...data,
      name: name || "unknown",
      side: "defense",
      defense: { front: parts.front || null, coverage: parts.coverage || null, stunt: parts.stunt || null, pressure: parts.pressure || null },
      formation: { ...data.formation, name: parts.front || "unknown" },
    };
    const r = await safeCall(() => saveBuiltPlayAction(props.teamId, props.playId, play), "Saving");
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    // drawn for a game plan: it goes into the plan, and back to the plan
    if (props.planId) {
      await safeCall(() => addToPlanAction(props.teamId, props.planId!, r.playId), "Adding to the game plan");
      return router.push(`/t/${props.teamId}/gameplan?plan=${props.planId}`);
    }
    router.push(`/t/${props.teamId}/plays/${r.playId}`);
  };

  const words = (list: Array<{ word: string }> | undefined) => (list ?? []).map((w) => w.word);
  const t = me ? String(me.assignment_type) : "";

  return (
    <div className="flex flex-col gap-4 pb-24">
      <section className="card flex flex-col gap-2 p-3">
        <div className="font-semibold">The call {n?.fronts?.length ? "from your naming rules" : ""}</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Pick label="Front" value={parts.front} options={[...new Set([...words(n?.fronts), ...DEF_FRONTS, ...BLOCK_FRONTS])]} onChange={(v) => setParts({ ...parts, front: v })} />
          <Pick label="Coverage" value={parts.coverage} options={[...new Set([...words(n?.coverages), "Cover 0", "Cover 1", "Cover 2", "Cover 3", "Cover 4"])]} onChange={(v) => setParts({ ...parts, coverage: v })} />
          <Pick label="Stunt" value={parts.stunt} options={words(n?.stunts)} onChange={(v) => setParts({ ...parts, stunt: v })} />
          <Pick label="Pressure" value={parts.pressure} options={words(n?.blitzes)} onChange={(v) => setParts({ ...parts, pressure: v })} />
        </div>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Against
          <select
            className="input w-auto"
            value={against}
            onChange={(e) => {
              setAgainst(e.target.value);
              const saved = props.formations?.find((f) => `f:${f.id}` === e.target.value);
              const nextVs = saved ? saved.players.map((p) => ({ ...p, assignment_type: "unknown" as const, route: null, block: null, path: null, line: null })) : offense(e.target.value, n);
              // the front lines up again against the new offense, by technique
              const placed = frontAgainst(parts.front, nextVs);
              commit({ data: { ...data, vs: nextVs, players: applyCoverage(placed ?? data.players, coverageOf(parts.coverage), nextVs) } });
            }}
          >
            <option value="2x2">2x2</option>
            <option value="trips">Trips</option>
            <option value="i">I-formation</option>
            <option value="empty">Empty</option>
            {(props.formations ?? []).length > 0 && (
              <optgroup label="Your formations">
                {props.formations!.map((f) => (
                  <option key={f.id} value={`f:${f.id}`}>
                    {f.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        {note && (
          <p className="text-sm text-muted" aria-live="polite">
            {note}
          </p>
        )}
        <label className="flex flex-col gap-1 text-xs">
          The call&apos;s name {!ownName && name ? "(built from the parts above; type to change it)" : ""}
          <input className="input text-base font-semibold" value={ownName || name} onChange={(e) => setOwnName(e.target.value)} placeholder="e.g. 4-3 OVER, COVER 3" />
        </label>
      </section>

      <section className="card flex flex-col gap-2 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded border border-line text-sm" role="group" aria-label="What touching the field does">
            {(
              [
                ["move", "Move players"],
                ["draw", "Draw lines"],
              ] as const
            ).map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 ${mode === m ? "bg-brand text-brand-ink" : ""}`} aria-pressed={mode === m}>
                {label}
              </button>
            ))}
          </div>
          {mode === "draw" && (
            <PenGroup
              label="Line"
              value={pen.style}
              onChange={(style) => setPen({ style, end: style === "dotted" ? "none" : "arrow" })}
              options={[
                ["solid", "Solid (rush, blitz, drop)", <path key="s" d="M2 6 H26" />],
                ["dotted", "Dotted (man coverage)", <path key="d" d="M2 6 H26" strokeDasharray="3 2.5" />],
              ]}
            />
          )}
          <button className="ml-auto border border-line px-2 py-1 text-sm disabled:opacity-40" onClick={undo} disabled={!history.length} title="Undo (Ctrl+Z)">
            Undo
          </button>
        </div>
        <p className="text-xs text-muted">
          {mode === "draw"
            ? "Touch a defender and draw his line: through the line is a rush or blitz, back deep is a zone drop, dotted to a receiver is man. Tap any line to delete it."
            : "Drag defenders into place. Tap one to set his job, or tap a line to delete it."}
        </p>
        <div className="overflow-hidden">
          <PlaySvg
            data={data}
            selected={sel}
            onPlayerTap={(id) => {
              setSel(id === sel ? null : id);
              setLine(null);
            }}
            onPlayerDrag={mode === "move" ? (id, x, y) => setPlayer(id, { x, y: Math.max(y, 0.5), on_ball: y < 1.5 }, true) : undefined}
            pen={mode === "draw" ? pen : null}
            onDraw={onDraw}
            onLineTap={(l) => setLine(line && line.id === l.id && line.kind === l.kind ? null : l)}
            selectedLine={line}
            className="block w-full select-none"
          />
        </div>
        {line && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2 text-sm" aria-live="polite">
            <span className="font-semibold">{line.id}&apos;s line</span>
            <button className="btn btn-outline min-h-9 px-3 text-sm" onClick={() => deleteLine(line)}>
              Delete line
            </button>
            <button className="text-muted underline" onClick={() => setLine(null)}>
              Keep it
            </button>
          </div>
        )}
      </section>

      {me ? (
        <section className="card flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              Defender
              <input
                className="input w-20 font-bold"
                value={me.id}
                onChange={(e) => {
                  const id = e.target.value.toUpperCase().slice(0, 4);
                  if (!id || data.players.some((p) => p.id === id && p !== me)) return;
                  commit({ data: { ...data, players: data.players.map((p) => (p.id === me.id ? { ...p, id, position: id } : p)) } }, true);
                  setSel(id);
                }}
              />
            </label>
            <span className="text-sm text-muted">{defJobText(me)}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {DEF_ASSIGNMENT_TYPES.map((j) => (
              <button key={j} onClick={() => setPlayer(me.id, { assignment_type: j, path: null })} className={`px-3 py-1.5 text-sm ${t === j ? "bg-brand text-brand-ink" : "border border-line"}`}>
                {DEF_JOB_LABEL[j]}
              </button>
            ))}
            <button onClick={() => setPlayer(me.id, { assignment_type: "unknown", def: null, path: null })} className={`px-3 py-1.5 text-sm ${!DEF_ASSIGNMENT_TYPES.includes(t as never) ? "bg-brand text-brand-ink" : "border border-line"}`}>
              Nothing
            </button>
          </div>
          {(t === "rush" || t === "gap" || t === "blitz") && (
            <div className="flex flex-wrap gap-1 text-sm">
              {GAPS.map((g) => (
                <button key={g} className={`px-3 py-1.5 ${me.def?.gap === g ? "bg-brand text-brand-ink" : "border border-line"}`} onClick={() => setDef(me, { gap: g })}>
                  {g} gap
                </button>
              ))}
            </div>
          )}
          {t === "zone_drop" && (
            <div className="flex flex-wrap gap-1 text-sm">
              {Object.entries(ZONE_LABEL).map(([k, l]) => (
                <button key={k} className={`px-3 py-1.5 ${me.def?.zone === k ? "bg-brand text-brand-ink" : "border border-line"}`} onClick={() => setDef(me, { zone: k })}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {t === "man" && (
            <div className="flex flex-wrap gap-1 text-sm">
              {receivers.map((r) => (
                <button key={r.id} className={`px-3 py-1.5 ${me.def?.man === r.id ? "bg-brand text-brand-ink" : "border border-line"}`} onClick={() => setDef(me, { man: r.id })}>
                  {r.id}
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        <p className="text-sm text-muted">Tap a defender to give him a job.</p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <button className="btn btn-primary" disabled={busy || !name} onClick={save}>
            {busy ? "Saving…" : props.playId ? "Save changes" : "Save call"}
          </button>
          <span className="text-sm text-muted">{msg ?? (name ? name : "Pick a front first.")}</span>
        </div>
      </div>
    </div>
  );
}
