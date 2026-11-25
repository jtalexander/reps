"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { PlaySvg } from "@/components/play-svg";
import { callKey, CARD_LETTERS, cardNumbers, explainCall, gridCell, saidText, sayCall, signalKey } from "@/domain/calling";
import type { PlayData } from "@/domain/play";
import type { RouteTree } from "@/domain/route-tree";
import type { Terms } from "@/domain/terms";
import { bandOf, byNumber, copiesPerPage, fitWindows, gridOf, GROUP_COLORS, groupOf, jobOnCall, positionsOf, TEXT_PT, type Band, type Calling, type Wristband } from "@/domain/wristband";
import { safeCall } from "@/lib/safe-call";
import {
  wristbandBandAction,
  wristbandDeleteBandAction,
  wristbandLabelAction,
  wristbandNewBandAction,
  wristbandNumberAction,
  wristbandOnBandAction,
  wristbandRenumberAction,
  wristbandSwapAction,
  wristbandTeamAction,
} from "../../actions";

export type BandCall = { id: string; name: string; data: PlayData; formation: string; play: string };
type View = "qb" | "players" | "sheet" | "calling" | "signals";
/** One line on the band: a play, or a concept (every play with that play part) */
type Entry = { key: string; n: string; label: string; name: string; data: PlayData; plays: BandCall[]; group: string | null };

const opt = (on: boolean) => `px-2 py-1 text-sm ${on ? "bg-brand text-brand-ink" : "border border-line"}`;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const words = (s: string) => [...new Set(s.split(/[,\n]/).map((w) => w.trim().toUpperCase().slice(0, 20)).filter(Boolean))];
/** the print colors on screen too, so the preview looks like the paper */
const PAPER = {
  "--bg": "#fff",
  "--card": "#fff",
  "--ink": "#000",
  "--muted": "#444",
  "--line": "#bbb",
  "--field": "#fff",
  "--yard": "#e5e5e5",
  "--los": "#000",
  "--carry": "#000",
  "--def": "#000",
  "--zone": "rgba(0, 0, 0, 0.04)",
  "--zone-line": "#888",
  "--key": "#000",
  "--key-ink": "#000",
  "--hl": "#ddd",
  "--hl-ink": "#000",
  color: "#000",
} as React.CSSProperties;

/** A comma list typed in a box, saved when the coach leaves it. */
function WordsInput(props: { value: string[]; onSave: (v: string[]) => void; label: string; placeholder?: string; className?: string }) {
  const [text, setText] = useState(props.value.join(", "));
  return (
    <input
      className={`input ${props.className ?? ""}`}
      aria-label={props.label}
      placeholder={props.placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const v = words(text);
        setText(v.join(", "));
        if (v.join(",") !== props.value.join(",")) props.onSave(v);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function SignalRow(props: { label: string; value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(props.value);
  return (
    <label className="flex flex-wrap items-center gap-2">
      <span className="w-40 truncate font-semibold">{props.label}</span>
      <input
        className="input min-w-0 flex-1"
        value={text}
        maxLength={80}
        placeholder="What the signal looks like"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() !== props.value && props.onSave(text.trim())}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

/** a repeatable random sequence, for example calls */
function seededRand(seed: number) {
  let s = seed * 9301 + 49297;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

/** the grid cell a number sits in, as "ROW col" */
function gridName(n: string, band: Band): string {
  const cell = gridCell(n, band);
  return cell ? `${cell.row} ${cell.col}` : "";
}

/**
 * The wristband builder: band setups (one per coach or use), how plays are
 * called with each, each call's number and short name, and the sheets to
 * print: QB card, player cards, call sheet, call key and signals.
 */
export function WristbandBuilder(props: { teamId: string; title: string; calls: BandCall[]; initial: Wristband; bandId: string; terms: Terms | null; tree: RouteTree | null }) {
  const { teamId, title, calls } = props;
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [w, setW] = useState(props.initial);
  const band = bandOf(w, props.bandId);
  const c = band.calling;
  const [view, setView] = useState<View>("qb");
  const [pos, setPos] = useState("all");
  const [copies, setCopies] = useState<number | null>(null);
  const [size, setSize] = useState({ width: String(band.width), height: String(band.height) });
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [sure, setSure] = useState<"" | "renumber" | "delete">("");
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState<"" | "new" | "rename">("");
  const [nameText, setNameText] = useState("");
  const [exampleSeed, setExampleSeed] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<Band>>({});

  const goBand = (id: string) => {
    const u = new URLSearchParams(search.toString());
    u.set("band", id);
    router.replace(`${pathname}?${u.toString()}`);
  };

  // ---------- the band's lines ----------
  const byConcept = w.numbersBy === "concept";
  const entries: Entry[] = (() => {
    const m = new Map<string, Entry>();
    for (const call of calls) {
      const key = callKey(call.id, call.play, w.numbersBy);
      const e = m.get(key);
      if (e) {
        e.plays.push(call);
        continue;
      }
      const name = w.numbersBy === "concept" ? call.play : call.name;
      m.set(key, { key, n: w.numbers[key] ?? "", label: w.labels[key] || name, name, data: call.data, plays: [call], group: groupOf(call.data, band.colorBy) });
    }
    return [...m.values()].sort((a, b) => byNumber(a.n || "~", b.n || "~") || a.name.localeCompare(b.name));
  })();
  const onBand = entries.filter((e) => !band.off.includes(e.key));
  const numbered = onBand.filter((e) => e.n);
  const leftOff = entries.length - onBand.length;
  const missing = onBand.length - numbered.length;
  const colors = (() => {
    const m = new Map<string, string>();
    for (const e of entries) if (e.group && !m.has(e.group)) m.set(e.group, GROUP_COLORS[m.size % GROUP_COLORS.length]!);
    return m;
  })();
  const colorOf = (e: Entry) => (e.group ? colors.get(e.group) : undefined);
  const positions = positionsOf(calls);
  const formations = [...new Set(calls.map((x) => x.formation).filter(Boolean))].sort();
  /** a position's job on a line: the most common one over its plays */
  const jobs = (() => {
    const m = new Map<string, string | null>();
    for (const e of entries)
      for (const p of positions) {
        const count = new Map<string, number>();
        for (const call of e.plays) {
          const j = jobOnCall(call.data, p, { terms: props.terms ?? undefined, tree: props.tree });
          if (j) count.set(j, (count.get(j) ?? 0) + 1);
        }
        m.set(`${e.key}:${p}`, [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
      }
    return m;
  })();
  // every team number, so card B and C come out the same here and in the players' quizzes
  const allNumbers = Object.values(w.numbers);
  const cards = cardNumbers(band, allNumbers);
  const letters: readonly string[] = band.style === "cards" ? CARD_LETTERS.slice(0, band.cards) : ["A"];
  /** what the band shows for a line: its number, its number on a card, or its grid cell */
  const shown = (e: Entry, letter = "A") => {
    if (band.style === "cards") return cards[letter]?.[e.n] ?? e.n;
    if (band.style === "grid") return gridName(e.n, band) || "—";
    return e.n;
  };

  // ---------- saving ----------
  const done = (r: { ok: false; error: string } | { ok: true }, ok?: string) => {
    setBusy(false);
    if (!r.ok) setMsg({ text: r.error, ok: false });
    else if (ok) setMsg({ text: ok, ok: true });
  };
  const setBand = (fn: (b: Band) => Band) => setW((cur) => ({ ...cur, bands: cur.bands.map((b) => (b.id === band.id ? fn(b) : b)) }));
  /** band settings: shown at once, saved a moment later (quick changes saved together) */
  const change = (patch: Partial<Band>) => {
    setBand((b) => ({ ...b, ...patch }));
    pending.current = { ...pending.current, ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const all = pending.current;
      pending.current = {};
      const r = await safeCall(() => wristbandBandAction(teamId, band.id, all), "Saving the band");
      if (!r.ok) setMsg({ text: r.error, ok: false });
    }, 400);
  };
  const calling = (patch: Partial<Calling>) => {
    const next = { ...(pending.current.calling ?? c), ...patch };
    change({ calling: next });
  };
  const team = async (patch: Partial<Pick<Wristband, "numbering" | "numbersBy" | "teachBand">>, refresh = false) => {
    setW((cur) => ({ ...cur, ...patch }));
    const r = await safeCall(() => wristbandTeamAction(teamId, patch), "Saving");
    if (!r.ok) return setMsg({ text: r.error, ok: false });
    if (refresh) router.refresh();
  };
  const sizeDone = (k: "width" | "height") => {
    const v = Number(size[k]);
    const [lo, hi] = k === "width" ? [1.5, 8] : [1, 5];
    const next = Number.isFinite(v) && v > 0 ? clamp(Math.round(v * 100) / 100, lo, hi) : band[k];
    setSize((s) => ({ ...s, [k]: String(next) }));
    if (next !== band[k]) change({ [k]: next });
  };
  const setNumber = async (e: Entry, value: string) => {
    if (value.trim() === e.n) return;
    setBusy(true);
    const res = await safeCall(() => wristbandNumberAction(teamId, e.key, value), "Saving the number");
    if (res.ok) {
      setW(res.value.wristband);
      return done(res, res.value.bumped ? `${value.trim()} was on ${res.value.bumped}. That one has no number now; give it one below.` : undefined);
    }
    done(res);
  };
  const setLabel = async (e: Entry, value: string) => {
    if (value.trim() === (w.labels[e.key] ?? "")) return;
    setBusy(true);
    const res = await safeCall(() => wristbandLabelAction(teamId, e.key, value), "Saving the name");
    if (res.ok) setW(res.value);
    done(res);
  };
  const toggleBand = async (e: Entry, on: boolean) => {
    setBand((b) => ({ ...b, off: on ? b.off.filter((x) => x !== e.key) : [...b.off, e.key] }));
    const res = await safeCall(() => wristbandOnBandAction(teamId, band.id, e.key, on), "Saving");
    if (res.ok) setW(res.value);
    else setMsg({ text: res.error, ok: false });
  };
  const swap = async (a: Entry, b: Entry) => {
    setBusy(true);
    const res = await safeCall(() => wristbandSwapAction(teamId, a.key, b.key), "Moving the call");
    if (res.ok) setW(res.value);
    done(res);
  };
  const renumberAll = async () => {
    if (sure !== "renumber") return setSure("renumber");
    setSure("");
    setBusy(true);
    const res = await safeCall(
      () =>
        wristbandRenumberAction(
          teamId,
          entries.map((e) => e.key),
          w.numbering,
        ),
      "Renumbering",
    );
    if (res.ok) setW(res.value);
    done(res, "Renumbered. Reprint every band and call sheet that uses these numbers.");
  };
  const saveName = async () => {
    const nm = nameText.trim();
    if (!nm) return setNaming("");
    setBusy(true);
    if (naming === "new") {
      const res = await safeCall(() => wristbandNewBandAction(teamId, band.id, nm), "Making the setup");
      setBusy(false);
      setNaming("");
      if (!res.ok) return setMsg({ text: res.error, ok: false });
      return goBand(res.value.band.id);
    }
    setBand((b) => ({ ...b, name: nm }));
    const res = await safeCall(() => wristbandBandAction(teamId, band.id, { name: nm }), "Renaming");
    setNaming("");
    done(res);
  };
  const removeBand = async () => {
    if (sure !== "delete") return setSure("delete");
    setSure("");
    setBusy(true);
    const res = await safeCall(() => wristbandDeleteBandAction(teamId, band.id), "Deleting the setup");
    setBusy(false);
    if (!res.ok) return setMsg({ text: res.error, ok: false });
    goBand(res.value.bands[0]!.id);
  };

  // ---------- examples of calls as said ----------
  const examples = (() => {
    const rand = seededRand(exampleSeed);
    const pool = numbered.length ? numbered : onBand;
    const out: Array<{ said: string; why: string; name: string }> = [];
    for (let i = 0; i < Math.min(5, pool.length); i++) {
      const e = pool[Math.floor(rand() * pool.length)]!;
      const call = e.plays[Math.floor(rand() * e.plays.length)]!;
      const letter = band.style === "cards" ? CARD_LETTERS[Math.floor(rand() * band.cards)]! : "A";
      const parts = sayCall({ formation: call.formation, play: call.play, number: e.n || null, label: e.label }, band, rand, { allNumbers, card: letter });
      if (parts) out.push({ said: (band.style === "cards" ? `[card ${letter}] ` : "") + saidText(parts), why: explainCall(parts), name: call.name });
    }
    return out;
  })();

  // ---------- the printed band ----------
  const pt = TEXT_PT[band.text];
  const grid = band.style === "grid";
  const drawings = !grid && (view === "players" ? band.drawings : view === "qb" ? band.qbDrawings : false);
  const fit = fitWindows(numbered, band, drawings);
  const cells = gridOf(band, drawings);
  const cellH = Math.max(0.3, (band.height - 0.12 - 0.16) / cells.rows);
  const n = clamp(copies ?? (view === "players" ? 1 : Math.max(1, Math.floor(copiesPerPage(band) / letters.length))), 1, 40);
  const shownPositions = pos === "all" ? positions : positions.filter((p) => p === pos);
  // a grid band: the grid's rows split over the windows by what fits
  const gridLine = (pt * 1.25) / 72;
  const gridRowsPerWindow = Math.max(1, Math.floor((band.height - 0.12 - 2 * gridLine) / gridLine));
  const gridChunks: string[][] = [];
  for (let i = 0; i < band.gridRows.length && gridChunks.length < band.windows; i += gridRowsPerWindow) gridChunks.push(band.gridRows.slice(i, i + gridRowsPerWindow));
  const gridOver = band.gridRows.length - gridChunks.flat().length;
  const byCell = new Map(numbered.map((e) => [gridName(e.n, band), e]));
  const gridMissing = numbered.filter((e) => !gridCell(e.n, band)).length;

  const panel = (key: string, head: string, i: number, body: React.ReactNode, total = band.windows) => (
    <div
      key={key}
      className="print-avoid print-color overflow-hidden bg-white text-black"
      style={{ width: `${band.width}in`, height: `${band.height}in`, border: "1px dashed #666", padding: "0.06in", fontSize: `${pt}pt`, lineHeight: 1.25, flex: "none" }}
    >
      <div className="flex justify-between gap-1 font-bold uppercase" style={{ fontSize: `${Math.max(5, pt - 1)}pt` }}>
        <span className="truncate">{head}</span>
        {total > 1 && (
          <span>
            {i + 1}/{total}
          </span>
        )}
      </div>
      {body}
    </div>
  );
  const listGrid = (items: React.ReactNode) => (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cells.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${cells.rows}, auto)`, gridAutoFlow: "column", columnGap: "0.06in" }}>{items}</div>
  );
  /** a grid band: row words down the side, column numbers across */
  const gridTable = (rowsHere: string[], cell: (e: Entry) => React.ReactNode) => (
    <table className="w-full table-fixed border-collapse">
      <thead>
        <tr>
          <th style={{ width: "0.45in" }} />
          {Array.from({ length: band.gridCols }, (_, k) => (
            <th key={k} className="border border-neutral-400 text-center">
              {k + 1}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rowsHere.map((row) => (
          <tr key={row}>
            <th className="truncate border border-neutral-400 px-0.5 text-left">{row}</th>
            {Array.from({ length: band.gridCols }, (_, k) => {
              const e = byCell.get(`${row} ${k + 1}`);
              return (
                <td key={k} className="truncate border border-neutral-400 px-0.5" style={{ background: e ? colorOf(e) : undefined }}>
                  {e ? cell(e) : ""}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
  const sorted = (letter: string) => (band.style === "cards" ? [...numbered].sort((a, b) => byNumber(shown(a, letter), shown(b, letter))) : numbered);

  const qbSets = (k: number) =>
    letters.flatMap((letter) => {
      const head = band.style === "cards" ? `CARD ${letter} · ${title}` : title;
      if (grid) return gridChunks.map((rs, i) => panel(`qb${k}${letter}${i}`, head, i, gridTable(rs, (e) => e.label), gridChunks.length));
      return fitWindows(sorted(letter), band, drawings).windows.map((list, i) =>
        panel(
          `qb${k}${letter}${i}`,
          head,
          i,
          listGrid(
            list.map((e) =>
              drawings ? (
                <div key={e.key} className="flex flex-col overflow-hidden" style={{ height: `${cellH}in`, background: colorOf(e) }}>
                  <div className="truncate px-0.5">
                    <b>{shown(e, letter)}</b> {e.label}
                  </div>
                  <PlaySvg data={e.data} fit className="block min-h-0 w-full flex-1" />
                </div>
              ) : (
                <div key={e.key} className="truncate px-0.5" style={{ background: colorOf(e) }}>
                  <b>{shown(e, letter)}</b> {e.label}
                </div>
              ),
            ),
          ),
        ),
      );
    });

  const playerSets = (p: string, k: number) =>
    letters.flatMap((letter) => {
      const head = `${p} · ${band.style === "cards" ? `CARD ${letter} · ` : ""}${title}`;
      const job = (e: Entry) => jobs.get(`${e.key}:${p}`) ?? "—";
      if (grid) return gridChunks.map((rs, i) => panel(`${p}${k}${letter}${i}`, head, i, gridTable(rs, job), gridChunks.length));
      return fitWindows(sorted(letter), band, drawings).windows.map((list, i) =>
        panel(
          `${p}${k}${letter}${i}`,
          head,
          i,
          listGrid(
            list.map((e) => {
              if (!drawings)
                return (
                  <div key={e.key} className="truncate px-0.5" style={{ background: colorOf(e) }}>
                    <b>{shown(e, letter)}</b> {job(e)}
                  </div>
                );
              const id = e.data.players.find((x) => x.id.toUpperCase() === p)?.id ?? e.data.players.find((x) => x.position.toUpperCase() === p)?.id;
              return (
                <div key={e.key} className="flex flex-col overflow-hidden" style={{ height: `${cellH}in`, background: colorOf(e) }}>
                  <div className="truncate px-0.5">
                    <b>{shown(e, letter)}</b> {job(e)}
                  </div>
                  {id ? <PlaySvg data={e.data} highlight={id} fit className="block min-h-0 w-full flex-1" /> : null}
                </div>
              );
            }),
          ),
        ),
      );
    });

  // the call sheet: same numbers, grouped, a box to tick off as it's called
  const sheetGroups = (() => {
    const by = band.colorBy === "none" ? "type" : band.colorBy;
    const m = new Map<string, Entry[]>();
    for (const e of numbered) {
      const g = groupOf(e.data, by) ?? "Calls";
      m.set(g, [...(m.get(g) ?? []), e]);
    }
    return [...m.entries()];
  })();

  const codeLegend = c.formation === "code" ? formations.filter((f) => (c.codeWords[f] ?? []).length).map((f) => `${f} = ${(c.codeWords[f] ?? []).join(", ")}`) : [];
  const signalRows: Array<[string, string]> = [
    ...formations.map((f) => [f, c.signals[signalKey.formation(f)] ?? ""] as [string, string]),
    ...(c.play === "word"
      ? onBand.map((e) => [e.name, c.signals[signalKey.word(e.name)] ?? ""] as [string, string])
      : Array.from({ length: 10 }, (_, d) => [`Number ${d}`, c.signals[signalKey.digit(String(d))] ?? ""] as [string, string])),
    ...(band.style === "cards" ? letters.map((l) => [`Card ${l} is live`, c.signals[signalKey.card(l)] ?? ""] as [string, string]) : []),
  ];
  const signal = (k: string, v: string) => calling({ signals: { ...(pending.current.calling ?? c).signals, [k]: v } });

  return (
    <div className="flex flex-col gap-4">
      <div className="no-print flex flex-col gap-3">
        {/* band setups: one per coach or use */}
        <section className="card flex flex-col gap-2 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">Band setup</span>
            <select className="input w-auto" value={band.id} onChange={(e) => goBand(e.target.value)} aria-label="Band setup">
              {w.bands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button
              className="underline"
              onClick={() => {
                setNaming("new");
                setNameText(`${band.name} copy`);
              }}
            >
              New setup
            </button>
            <button
              className="underline"
              onClick={() => {
                setNaming("rename");
                setNameText(band.name);
              }}
            >
              Rename
            </button>
            {w.bands.length > 1 && (
              <button className={`underline ${sure === "delete" ? "text-bad" : "text-muted"}`} disabled={busy} onClick={removeBand}>
                {sure === "delete" ? `Yes, delete ${band.name}` : "Delete"}
              </button>
            )}
          </div>
          {naming && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <input className="input w-56" autoFocus value={nameText} maxLength={40} onChange={(e) => setNameText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()} aria-label="Setup name" />
              <button className="btn btn-primary min-h-9 px-3 text-sm" disabled={busy} onClick={saveName}>
                {naming === "new" ? "Make it" : "Save"}
              </button>
              <button className="text-muted underline" onClick={() => setNaming("")}>
                Cancel
              </button>
              {naming === "new" && <span className="text-muted">Starts as a copy of {band.name}. Numbers stay the same on every setup.</span>}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={(w.teachBand ?? w.bands[0]?.id) === band.id} onChange={(e) => team({ teachBand: e.target.checked ? band.id : null })} />
            Players learn calls the way this band calls them (in their quizzes)
          </label>
        </section>

        <div className="flex flex-wrap gap-1" role="group" aria-label="What to work on">
          {(
            [
              ["qb", "QB and coach card"],
              ["players", "Player cards"],
              ["sheet", "Call sheet"],
              ["calling", "How we call it"],
              ["signals", "Signals"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} className={opt(view === v)} aria-pressed={view === v} onClick={() => setView(v)}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">
          {view === "qb" && "Every call by number, for the QB and the coaches."}
          {view === "players" && "One card per position with only that player's job on each number. Players look up the number and see what they do."}
          {view === "sheet" && "The coach's sheet: same numbers as the bands, grouped, with a box to tick as you call it."}
          {view === "calling" && "How a play is called with this band: what's said for the formation and the play, the band's style, a live rule and dummy words. Print the call key for your coaches."}
          {view === "signals" && "What each signal looks like. Players learn them in their quizzes; print the sheet for your signalers."}
        </p>

        {(view === "qb" || view === "players") && (
          <section className="card flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-24 text-muted">Windows</span>
              {[1, 2, 3].map((k) => (
                <button key={k} className={opt(band.windows === k)} onClick={() => change({ windows: k })}>
                  {k}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-24 text-muted">Window size</span>
              <input className="input w-20" inputMode="decimal" aria-label="Window width in inches" value={size.width} onChange={(e) => setSize({ ...size, width: e.target.value })} onBlur={() => sizeDone("width")} />
              <span>×</span>
              <input className="input w-20" inputMode="decimal" aria-label="Window height in inches" value={size.height} onChange={(e) => setSize({ ...size, height: e.target.value })} onBlur={() => sizeDone("height")} />
              <span className="text-muted">inches wide × tall. Measure the clear window on your band.</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-24 text-muted">Text</span>
              {(
                [
                  ["s", "Small"],
                  ["m", "Medium"],
                  ["l", "Large"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} className={opt(band.text === k)} onClick={() => change({ text: k })}>
                  {label}
                </button>
              ))}
            </div>
            {!grid && !drawings && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-24 text-muted">Columns</span>
                {[1, 2, 3, 4].map((k) => (
                  <button key={k} className={opt(band.columns === k)} onClick={() => change({ columns: k })}>
                    {k}
                  </button>
                ))}
              </div>
            )}
            {!grid && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-24 text-muted">Drawings</span>
                <button className={opt(!drawings)} onClick={() => change(view === "qb" ? { qbDrawings: false } : { drawings: false })}>
                  Words only
                </button>
                <button className={opt(drawings)} onClick={() => change(view === "qb" ? { qbDrawings: true } : { drawings: true })}>
                  {view === "qb" ? "Drawing of each play" : "Drawing of each play, his line dark"}
                </button>
              </div>
            )}
            {drawings && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-24 text-muted">Plays per window</span>
                {([1, 2, 4, 6, 8] as const).map((k) => (
                  <button key={k} className={opt(band.pictures === k)} onClick={() => change({ pictures: k })}>
                    {k}
                  </button>
                ))}
                <span className="text-muted">Fewer means bigger pictures.</span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-24 text-muted">Color by</span>
              {(
                [
                  ["type", "Play type"],
                  ["formation", "Formation"],
                  ["none", "No color"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} className={opt(band.colorBy === k)} onClick={() => change({ colorBy: k })}>
                  {label}
                </button>
              ))}
            </div>
            <p className={`text-sm ${(grid ? gridOver || gridMissing : fit.over) ? "text-bad" : "text-muted"}`}>
              {grid
                ? gridOver || gridMissing
                  ? `${gridMissing ? `${gridMissing} call${gridMissing === 1 ? " has a number" : "s have numbers"} past the grid (${band.gridRows.length} rows × ${band.gridCols}). ` : ""}${gridOver ? `${gridOver} grid row${gridOver === 1 ? " doesn't" : "s don't"} fit; use smaller text or another window.` : ""}`
                  : `The grid holds ${band.gridRows.length * band.gridCols} calls; ${numbered.length} on it.`
                : fit.over
                  ? `${fit.over} call${fit.over === 1 ? " doesn't" : "s don't"} fit (room for ${fit.per * band.windows}). Try smaller text, more columns, another window${drawings ? " or more plays per window" : ""}.`
                  : `All ${numbered.length} calls fit, ${fit.per} per window.`}
            </p>
          </section>
        )}

        {view === "calling" && (
          <section className="card flex flex-col gap-4 p-4 text-sm">
            <div className="flex flex-col gap-1">
              <span className="font-semibold">Numbers (whole team)</span>
              <div className="flex flex-wrap gap-1">
                <button className={opt(!byConcept)} onClick={() => team({ numbersBy: "play" }, true)}>
                  A number for each play
                </button>
                <button className={opt(byConcept)} onClick={() => team({ numbersBy: "concept" }, true)}>
                  One number per play, from any formation
                </button>
              </div>
              <span className="text-muted">
                {byConcept ? `The number is the play from any formation (37 is ${onBand[0]?.name ?? "the play"} out of anything); the formation is called separately.` : "Each formation-and-play has its own number."}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-semibold">The formation is</span>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ["name", "Said by its name"],
                    ["code", "Said as a code word"],
                    ["none", "Not said (the number covers it)"],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} className={opt(c.formation === k)} onClick={() => calling({ formation: k })} disabled={k === "none" && byConcept}>
                    {label}
                  </button>
                ))}
              </div>
              {c.formation === "code" && (
                <div className="flex flex-col gap-1 pt-1">
                  <span className="text-muted">Code words for each formation. Give each several; any one of them means it, so the other sideline can&apos;t learn them.</span>
                  {formations.map((f) => (
                    <label key={f} className="flex flex-wrap items-center gap-2">
                      <span className="w-40 truncate font-semibold">{f}</span>
                      <WordsInput
                        className="min-w-0 flex-1"
                        label={`Code words for ${f}`}
                        placeholder="ALABAMA, ARIZONA, ARKANSAS"
                        value={c.codeWords[f] ?? []}
                        onSave={(v) => calling({ codeWords: { ...(pending.current.calling ?? c).codeWords, [f]: v } })}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-semibold">The play is</span>
              <div className="flex flex-wrap gap-1">
                <button className={opt(c.play === "number")} onClick={() => calling({ play: "number" })}>
                  Its number on the band
                </button>
                <button className={opt(c.play === "word")} onClick={() => calling({ play: "word" })}>
                  Its word (like DAGGER)
                </button>
              </div>
            </div>

            {c.play === "number" && (
              <div className="flex flex-col gap-1">
                <span className="font-semibold">Band style</span>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["list", "Numbers"],
                      ["grid", "Grid: row word + column number"],
                      ["cards", "Cards A, B, C"],
                    ] as const
                  ).map(([k, label]) => (
                    <button key={k} className={opt(band.style === k)} onClick={() => change({ style: k })}>
                      {label}
                    </button>
                  ))}
                </div>
                {band.style === "grid" && (
                  <div className="flex flex-col gap-1 pt-1">
                    <span className="text-muted">
                      Call 1 is the first row&apos;s column 1, then on across: with 6 columns, call 8 is the second row&apos;s column 2 (&quot;RED 2&quot;). Change the row words weekly and every call changes while the band stays the same.
                    </span>
                    <label className="flex flex-wrap items-center gap-2">
                      <span className="w-24 text-muted">Row words</span>
                      <WordsInput className="min-w-0 flex-1" label="Grid row words" value={band.gridRows} onSave={(v) => v.length > 0 && change({ gridRows: v.slice(0, 10) })} />
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-24 text-muted">Columns</span>
                      {[4, 5, 6, 8, 10].map((k) => (
                        <button key={k} className={opt(band.gridCols === k)} onClick={() => change({ gridCols: k })}>
                          {k}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {band.style === "cards" && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-muted">Cards</span>
                    {[2, 3].map((k) => (
                      <button key={k} className={opt(band.cards === k)} onClick={() => change({ cards: k })}>
                        {k}
                      </button>
                    ))}
                    <button className="underline" onClick={() => change({ cardSeed: (band.cardSeed % 999_999) + 1 })}>
                      Reshuffle card B{band.cards > 2 ? " and C" : ""}
                    </button>
                    <span className="text-muted">Same plays, different numbers on each card. Signal which card is live, and switch at the quarter or half.</span>
                  </div>
                )}
              </div>
            )}

            {c.play === "number" && band.style !== "grid" && (
              <div className="flex flex-col gap-1">
                <span className="font-semibold">Live rule (optional)</span>
                <span className="text-muted">Only the number after a live word counts. A dead word comes with a fake number first.</span>
                <label className="flex flex-wrap items-center gap-2">
                  <span className="w-24 text-muted">Live words</span>
                  <WordsInput className="min-w-0 flex-1" label="Live words" placeholder="BLUE" value={c.live} onSave={(v) => calling({ live: v.slice(0, 6) })} />
                </label>
                <label className="flex flex-wrap items-center gap-2">
                  <span className="w-24 text-muted">Dead words</span>
                  <WordsInput className="min-w-0 flex-1" label="Dead words" placeholder="RED, WHITE" value={c.dead} onSave={(v) => calling({ dead: v.slice(0, 6) })} />
                </label>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <span className="font-semibold">Dummy words</span>
              <span className="text-muted">Words that mean nothing, put on the end of a call.</span>
              <WordsInput label="Dummy words" placeholder="BINGO, LUCKY, CHECK, OMAHA" value={c.dummyWords} onSave={(v) => calling({ dummyWords: v.slice(0, 30) })} />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted">On each call</span>
                {[0, 1, 2, 3].map((k) => (
                  <button key={k} className={opt(c.dummies === k)} onClick={() => calling({ dummies: k })}>
                    {k}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1 border-t border-line pt-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">It sounds like</span>
                <button className="underline" onClick={() => setExampleSeed((s) => s + 1)}>
                  More examples
                </button>
              </div>
              {examples.length === 0 && (
                <span className="text-muted">
                  {numbered.length && band.style === "grid"
                    ? `These calls' numbers are past the grid (${band.gridRows.length} rows × ${band.gridCols} = ${band.gridRows.length * band.gridCols} squares). Renumber them 1, 2, 3… under Plays, numbers and names, or add row words.`
                    : "Give the calls numbers to see examples."}
                </span>
              )}
              <ul className="flex flex-col gap-1">
                {examples.map((x, i) => (
                  <li key={i}>
                    <b className="text-lg">“{x.said}”</b> <span className="text-muted">is {x.name}.</span>
                    <span className="block text-xs text-muted">{x.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {view === "signals" && (
          <section className="card flex flex-col gap-2 p-4 text-sm">
            <span className="text-muted">Describe each signal the way you&apos;d show a player (&quot;both hands on the helmet&quot;). Leave any you don&apos;t signal blank.</span>
            {formations.map((f) => (
              <SignalRow key={`f${f}`} label={f} value={c.signals[signalKey.formation(f)] ?? ""} onSave={(v) => signal(signalKey.formation(f), v)} />
            ))}
            {c.play === "word"
              ? onBand.map((e) => <SignalRow key={`w${e.key}`} label={e.name} value={c.signals[signalKey.word(e.name)] ?? ""} onSave={(v) => signal(signalKey.word(e.name), v)} />)
              : Array.from({ length: 10 }, (_, d) => <SignalRow key={`d${d}`} label={`Number ${d}`} value={c.signals[signalKey.digit(String(d))] ?? ""} onSave={(v) => signal(signalKey.digit(String(d)), v)} />)}
            {band.style === "cards" && letters.map((l) => <SignalRow key={`c${l}`} label={`Card ${l} is live`} value={c.signals[signalKey.card(l)] ?? ""} onSave={(v) => signal(signalKey.card(l), v)} />)}
          </section>
        )}

        {colors.size > 0 && (view === "qb" || view === "players") && (
          <div className="flex flex-wrap gap-2 text-xs">
            {[...colors.entries()].map(([g, col]) => (
              <span key={g} className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 border border-line" style={{ background: col }} />
                {g}
              </span>
            ))}
          </div>
        )}

        {(view === "qb" || view === "players" || view === "sheet") && (
          <details className="card p-4">
            <summary className="cursor-pointer font-semibold">
              Plays, numbers and names ({onBand.length} on this band{leftOff ? `, ${leftOff} left off` : ""}){missing ? ` · ${missing} without a number` : ""}
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">New calls get</span>
                <button className={opt(w.numbering === "order")} onClick={() => team({ numbering: "order" })}>
                  1, 2, 3…
                </button>
                <button className={opt(w.numbering === "code")} onClick={() => team({ numbering: "code" })}>
                  3-digit codes
                </button>
                <button className={`text-sm underline ${sure === "renumber" ? "text-bad" : ""}`} disabled={busy} onClick={renumberAll}>
                  {sure === "renumber" ? `Yes, renumber all ${entries.length} (players relearn them)` : `Renumber ${w.numbering === "code" ? "with new codes" : "1, 2, 3…"}`}
                </button>
              </div>
              <p className="text-xs text-muted">
                Untick a play to leave it off this band; it stays in the install. Youth bands read best with a short list and drawings. Type a number to change it: a number belongs to one call, and every band setup uses the same numbers. Arrows swap a call with the one next to it.
              </p>
              <ol className="flex flex-col gap-1">
                {entries.map((e, i) => (
                  <li key={e.key} className="flex flex-wrap items-center gap-2 border-b border-line pb-1">
                    <input type="checkbox" className="h-5 w-5" checked={!band.off.includes(e.key)} aria-label={`${e.name} on this band`} onChange={(ev) => toggleBand(e, ev.target.checked)} />
                    <input
                      key={`${e.key}:${e.n}`}
                      className="input w-16 text-center font-bold"
                      defaultValue={e.n}
                      aria-label={`Number for ${e.name}`}
                      onBlur={(ev) => setNumber(e, ev.target.value)}
                      onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()}
                    />
                    <span className="inline-block h-3 w-3 shrink-0 border border-line" style={{ background: colorOf(e) }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {e.name}
                      {byConcept && e.plays.length > 1 && <span className="text-muted"> · from {e.plays.length} formations</span>}
                    </span>
                    <input
                      key={`${e.key}:l:${w.labels[e.key] ?? ""}`}
                      className="input w-full text-sm sm:w-48"
                      placeholder="Short name for the band"
                      defaultValue={w.labels[e.key] ?? ""}
                      aria-label={`Short name for ${e.name}`}
                      onBlur={(ev) => setLabel(e, ev.target.value)}
                      onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()}
                    />
                    <span className="flex gap-1">
                      <button className="btn btn-outline min-h-8 px-2 text-sm" disabled={busy || i === 0 || !e.n} aria-label={`Move ${e.name} up`} onClick={() => swap(e, entries[i - 1]!)}>
                        ↑
                      </button>
                      <button className="btn btn-outline min-h-8 px-2 text-sm" disabled={busy || i === entries.length - 1 || !entries[i + 1]?.n} aria-label={`Move ${e.name} down`} onClick={() => swap(e, entries[i + 1]!)}>
                        ↓
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </details>
        )}

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {view === "players" && (
            <>
              <span className="text-muted">Position</span>
              <select className="input w-auto" value={pos} onChange={(e) => setPos(e.target.value)} aria-label="Position">
                <option value="all">Everyone ({positions.length})</option>
                {positions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </>
          )}
          {(view === "qb" || view === "players") && (
            <>
              <span className="text-muted">{view === "players" ? "Copies of each" : "Copies"}</span>
              <input className="input w-16" inputMode="numeric" aria-label="Copies" value={String(n)} onChange={(e) => setCopies(Number(e.target.value.replace(/\D/g, "")) || 1)} />
            </>
          )}
          <button className="btn btn-primary ml-auto min-h-9 px-4 text-sm" onClick={() => window.print()}>
            Print
          </button>
        </div>
        {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
        {missing > 0 && <p className="text-sm text-muted">Calls without a number aren&apos;t on the band.</p>}
      </div>

      <div className="print-visible overflow-x-auto rounded border border-line bg-white p-2 print:border-0 print:p-0" style={PAPER}>
        {view === "qb" && (
          <div className="flex flex-wrap" style={{ gap: "0.1in" }}>
            {Array.from({ length: n }, (_, k) => qbSets(k))}
          </div>
        )}
        {view === "players" && (
          <div className="flex flex-wrap" style={{ gap: "0.1in" }}>
            {shownPositions.flatMap((p) => Array.from({ length: n }, (_, k) => playerSets(p, k)))}
          </div>
        )}
        {view === "sheet" && (
          <div className="print-color bg-white text-black" style={{ fontSize: "10pt" }}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-black pb-1">
              <span className="text-2xl font-black uppercase">{title}</span>
              <span className="text-xs">
                {band.name} · {numbered.length} calls
              </span>
            </div>
            {codeLegend.length > 0 && <p className="mb-2 text-xs">Code words: {codeLegend.join(" · ")}</p>}
            <div style={{ columns: 2, columnGap: "0.3in" }}>
              {sheetGroups.map(([g, es]) => (
                <div key={g} className="print-avoid mb-3" style={{ breakInside: "avoid" }}>
                  <div className="border-b border-black px-1 text-xs font-bold uppercase" style={{ background: band.colorBy === "none" ? undefined : colors.get(g) }}>
                    {g}
                  </div>
                  <ul>
                    {es.map((e) => (
                      <li key={e.key} className="flex gap-2 border-b border-neutral-300 py-0.5">
                        <span className="mt-0.5 inline-block h-3 w-3 shrink-0 border border-black" aria-hidden />
                        <b className="shrink-0 text-right" style={{ minWidth: "2rem" }}>
                          {band.style === "cards" ? letters.map((l) => `${l}${shown(e, l)}`).join(" ") : shown(e)}
                        </b>
                        <span>{e.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
        {view === "calling" && (
          <div className="print-color bg-white text-black" style={{ fontSize: "10pt" }}>
            <div className="mb-2 border-b-2 border-black pb-1 text-2xl font-black uppercase">Call key · {band.name}</div>
            <ul className="flex flex-col gap-1">
              <li>
                <b>Formation:</b> {c.formation === "name" ? "said by name" : c.formation === "code" ? "said as a code word" : "not said; the number covers it"}
              </li>
              {codeLegend.map((l) => (
                <li key={l} className="pl-4">
                  {l}
                </li>
              ))}
              <li>
                <b>Play:</b>{" "}
                {c.play === "word"
                  ? "its word"
                  : band.style === "grid"
                    ? `grid: row word (${band.gridRows.join(", ")}) and column number`
                    : band.style === "cards"
                      ? `its number on the live card (${letters.join(", ")})`
                      : "its number on the band"}
                {byConcept ? ", the same from any formation" : ""}
              </li>
              {c.live.length > 0 && (
                <li>
                  <b>Live:</b> only the number after {c.live.join(" or ")} counts{c.dead.length ? `; ${c.dead.join(", ")} mean the next number is fake` : ""}
                </li>
              )}
              {c.dummies > 0 && c.dummyWords.length > 0 && (
                <li>
                  <b>Dummy words</b> (mean nothing): {c.dummyWords.join(", ")}
                </li>
              )}
            </ul>
            {examples.length > 0 && (
              <div className="mt-3">
                <b>Examples</b>
                <ul>
                  {examples.map((x, i) => (
                    <li key={i}>
                      “{x.said}” = {x.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {view === "signals" && (
          <div className="print-color bg-white text-black" style={{ fontSize: "10pt" }}>
            <div className="mb-2 border-b-2 border-black pb-1 text-2xl font-black uppercase">Signals · {band.name}</div>
            <table className="w-full border-collapse">
              <tbody>
                {signalRows
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <tr key={k} className="border-b border-neutral-300">
                      <td className="py-0.5 pr-3 font-bold">{k}</td>
                      <td className="py-0.5">{v}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!signalRows.some(([, v]) => v) && <p className="text-neutral-500">No signals yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
