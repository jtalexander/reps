"use client";
/**
 * The hand-marking page: load a pre-snap picture or a video from this
 * computer, click painted spots on the field, the ball and every player, and
 * see what the formation rules make of it next to your own answer.
 *
 * The film never leaves the browser. Only the clicks and answers are kept
 * (in this browser, and in the file you export).
 */
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LATERAL_LABEL, LATERAL_REFS, NFHS_11, type LateralRef, type PlayPoint } from "@/shared/field";
import { BACK_SET_LABEL, BACK_SETS, QB_LABEL, type FormationRead, type Role } from "../rules/formation";
import type { NamedLineup } from "../rules/match";
import { answers, confidences, FIELD_LABEL, FIELDS, readPlayers, same, score, type Field } from "./evaluate";
import { MarkFileSchema, MarkedFrameSchema, solveFrame, type Expected, type MarkedFrame } from "./types";

type Mode = "landmark" | "ball" | "offense" | "defense" | "erase";
const MODE_LABEL: Record<Mode, string> = { landmark: "Field spots", ball: "Ball", offense: "Offense", defense: "Defense", erase: "Erase" };
const MODE_COLOR: Record<Mode, string> = { landmark: "#facc15", ball: "#fb923c", offense: "#38bdf8", defense: "#f87171", erase: "#a3a3a3" };

const YARD_LINES = Array.from({ length: 21 }, (_, i) => i * 5);
const yardLabel = (along: number) => (along === 0 ? "Left goal line" : along === 100 ? "Right goal line" : along === 50 ? "50" : along < 50 ? `Left ${along}` : `Right ${100 - along}`);

const ROLE_COLOR: Record<Role, string> = { center: "#a3a3a3", line: "#a3a3a3", tight_end: "#4ade80", wing: "#4ade80", split: "#38bdf8", slot: "#38bdf8", qb: "#facc15", back: "#fb923c" };
const ROLE_LABEL: Record<Role, string> = { center: "C", line: "L", tight_end: "TE", wing: "W", split: "X", slot: "S", qb: "Q", back: "B" };

const pretty = (field: Field, v: string | null): string => {
  if (!v) return "—";
  if (field === "qb") return QB_LABEL[v as keyof typeof QB_LABEL] ?? v;
  if (field === "backs") return BACK_SET_LABEL[v as keyof typeof BACK_SET_LABEL] ?? v;
  if (field === "strength") return v[0]!.toUpperCase() + v.slice(1);
  return v;
};

function load(key: string): MarkedFrame[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    return MarkedFrameSchema.array().parse(JSON.parse(raw));
  } catch {
    return [];
  }
}
function save(key: string, frames: MarkedFrame[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(frames));
  } catch {
    // private window or storage full: the export button still works
  }
}

const noop = () => () => {};

/** The marked players from above, in yards, colored by what the rules think each one is. */
function TopDown({ read, defense }: { read: FormationRead; defense: PlayPoint[] }) {
  const all = [...read.players, ...defense];
  const half = Math.max(12, ...all.map((p) => Math.abs(p.x) + 2));
  const top = Math.max(8, ...all.map((p) => p.y + 2));
  const bottom = Math.min(-9, ...all.map((p) => p.y - 2));
  return (
    <svg viewBox={`${-half} ${-top} ${half * 2} ${top - bottom}`} className="w-full rounded border border-line bg-card" role="img" aria-label="The marked players from above">
      <line x1={-half} x2={half} y1={0} y2={0} stroke="#60a5fa" strokeWidth={0.15} />
      {[5, 10, -5].map((y) => (
        <line key={y} x1={-half} x2={half} y1={-y} y2={-y} stroke="currentColor" strokeOpacity={0.15} strokeWidth={0.08} />
      ))}
      {defense.map((p, i) => (
        <text key={`d${i}`} x={p.x} y={-p.y + 0.5} fontSize={1.5} textAnchor="middle" fill="#f87171">
          ×
        </text>
      ))}
      {read.players.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={-p.y} r={0.75} fill="none" stroke={ROLE_COLOR[p.role]} strokeWidth={0.18} />
          <text x={p.x} y={-p.y + 0.3} fontSize={0.8} textAnchor="middle" fill={ROLE_COLOR[p.role]}>
            {ROLE_LABEL[p.role]}
          </text>
        </g>
      ))}
      <ellipse cx={0} cy={0} rx={0.35} ry={0.5} fill="#fb923c" />
    </svg>
  );
}

export function MarkClient({ teamId, formations }: { teamId: string; formations: NamedLineup[] }) {
  const storeKey = `breakdown-marks-${teamId}`;
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const [frames, setFramesState] = useState<MarkedFrame[]>(() => (typeof window === "undefined" ? [] : load(storeKey)));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [media, setMedia] = useState<{ url: string; kind: "image" | "video"; name: string } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [mode, setMode] = useState<Mode>("landmark");
  const [along, setAlong] = useState(50);
  const [ref, setRef] = useState<LateralRef>("near_hash");
  const [clock, setClock] = useState({ at: 0, length: 0 });
  const [message, setMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const setFrames = (next: MarkedFrame[]) => {
    setFramesState(next);
    save(storeKey, next);
  };
  const frame = frames.find((f) => f.id === selectedId) ?? null;
  const update = (patch: Partial<MarkedFrame>) => {
    if (frame) setFrames(frames.map((f) => (f.id === frame.id ? { ...f, ...patch } : f)));
  };

  const solved = useMemo(() => (frame ? solveFrame(frame, NFHS_11) : null), [frame]);
  const result = useMemo(() => (solved?.ok && solved.offense.length ? readPlayers(solved.offense, formations) : null), [solved, formations]);
  const report = useMemo(() => score(frames, NFHS_11, formations), [frames, formations]);

  const openFile = (file: File | undefined) => {
    if (!file) return;
    if (media) URL.revokeObjectURL(media.url);
    setSize(null);
    setSelectedId(null);
    setMedia({ url: URL.createObjectURL(file), kind: file.type.startsWith("video") ? "video" : "image", name: file.name });
  };

  const newFrame = () => {
    if (!size) return;
    const v = videoRef.current;
    v?.pause();
    const next = MarkedFrameSchema.parse({ id: crypto.randomUUID(), label: `Snap ${frames.length + 1}`, time: media?.kind === "video" && v ? v.currentTime : null, width: size.w, height: size.h });
    setFrames([...frames, next]);
    setSelectedId(next.id);
    setMode("landmark");
  };

  const pick = (f: MarkedFrame) => {
    setSelectedId(f.id);
    const v = videoRef.current;
    if (v && f.time != null) {
      v.pause();
      v.currentTime = f.time;
    }
  };

  const click = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!frame) return;
    const m = svgRef.current?.getScreenCTM();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const at: [number, number] = [Math.round(pt.x * 10) / 10, Math.round(pt.y * 10) / 10];
    if (mode === "erase") {
      // remove the mark nearest the click, if one is close
      const marks: Array<{ kind: "landmark" | "ball" | "offense" | "defense"; i: number; p: readonly [number, number] }> = [
        ...frame.landmarks.map((l, i) => ({ kind: "landmark" as const, i, p: l.px })),
        ...frame.offense.map((p, i) => ({ kind: "offense" as const, i, p })),
        ...frame.defense.map((p, i) => ({ kind: "defense" as const, i, p })),
        ...(frame.ball ? [{ kind: "ball" as const, i: 0, p: frame.ball }] : []),
      ];
      const near = marks.map((k) => ({ ...k, d: Math.hypot(k.p[0] - at[0], k.p[1] - at[1]) })).sort((a, b) => a.d - b.d)[0];
      if (!near || near.d > frame.width / 40) return;
      if (near.kind === "ball") update({ ball: null });
      else if (near.kind === "landmark") update({ landmarks: frame.landmarks.filter((_, k) => k !== near.i) });
      else update({ [near.kind]: frame[near.kind].filter((_, k) => k !== near.i) });
      return;
    }
    if (mode === "landmark") update({ landmarks: [...frame.landmarks, { px: at, along, ref }] });
    else if (mode === "ball") update({ ball: at });
    else update({ [mode]: [...frame[mode], at] });
  };

  const setExpected = (patch: Partial<Expected>) => {
    if (!frame) return;
    const next = { ...frame.expected, ...patch };
    for (const k of Object.keys(next) as Array<keyof Expected>) if (!next[k]) delete next[k];
    update({ expected: next });
  };

  const exportFile = () => {
    const file = MarkFileSchema.parse({ version: 1, field: NFHS_11, formations: formations.map((f) => ({ name: f.name, players: f.players.map(({ id, x, y }) => ({ id, x, y })) })), frames });
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `marked-frames-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = MarkFileSchema.parse(JSON.parse(await file.text()));
      const have = new Set(frames.map((f) => f.id));
      const added = parsed.frames.filter((f) => !have.has(f.id));
      setFrames([...frames, ...added]);
      setMessage(`Added ${added.length} frame${added.length === 1 ? "" : "s"} from ${file.name}.`);
    } catch {
      setMessage("That file isn't a marked-frames export.");
    }
  };

  if (!mounted) return <p className="text-sm text-muted">Loading…</p>;

  const r = size ? Math.max(4, size.w / 170) : 6;
  const got = result ? answers(result) : null;
  const conf = result ? confidences(result) : null;
  const step = (d: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="card flex flex-wrap items-center gap-3 p-3 text-sm">
          <label className="btn btn-outline min-h-9 cursor-pointer px-3 text-sm">
            Open a picture or video
            <input type="file" accept="image/*,video/*" className="sr-only" onChange={(e) => openFile(e.target.files?.[0])} />
          </label>
          <span className="min-w-0 truncate text-muted">{media ? media.name : "Stays on this computer. Nothing is uploaded."}</span>
          {media && size && (
            <button className="btn btn-primary ml-auto min-h-9 px-3 text-sm" onClick={newFrame}>
              Mark this frame
            </button>
          )}
        </div>

        {media && (
          <div className="relative overflow-hidden rounded border border-line bg-black">
            {media.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local file shown from memory; there is nothing for the image optimizer to fetch
              <img src={media.url} alt="The frame being marked" className="block w-full" onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
            ) : (
              <video
                ref={videoRef}
                src={media.url}
                className="block w-full"
                muted
                playsInline
                preload="auto"
                onLoadedMetadata={(e) => {
                  setSize({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight });
                  setClock({ at: 0, length: e.currentTarget.duration || 0 });
                }}
                onTimeUpdate={(e) => setClock((c) => ({ ...c, at: e.currentTarget.currentTime }))}
              />
            )}
            {size && frame && (
              <svg ref={svgRef} viewBox={`0 0 ${size.w} ${size.h}`} className="absolute inset-0 h-full w-full" style={{ cursor: mode === "erase" ? "pointer" : "crosshair", touchAction: "none" }} onPointerDown={click}>
                <g pointerEvents="none">
                {frame.landmarks.map((l, i) => (
                  <g key={`l${i}`}>
                    <rect x={l.px[0] - r} y={l.px[1] - r} width={r * 2} height={r * 2} fill="none" stroke={MODE_COLOR.landmark} strokeWidth={r / 3} />
                    <text x={l.px[0] + r * 1.4} y={l.px[1] - r} fontSize={r * 2.2} fill={MODE_COLOR.landmark} stroke="#000" strokeWidth={r / 8} paintOrder="stroke">
                      {yardLabel(l.along)} · {LATERAL_LABEL[l.ref].split(" (")[0]}
                    </text>
                  </g>
                ))}
                {frame.offense.map((p, i) => (
                  <circle key={`o${i}`} cx={p[0]} cy={p[1]} r={r} fill="none" stroke={MODE_COLOR.offense} strokeWidth={r / 3} />
                ))}
                {frame.defense.map((p, i) => (
                  <path key={`d${i}`} d={`M${p[0] - r} ${p[1] - r} L${p[0] + r} ${p[1] + r} M${p[0] + r} ${p[1] - r} L${p[0] - r} ${p[1] + r}`} stroke={MODE_COLOR.defense} strokeWidth={r / 3} />
                ))}
                {frame.ball && <circle cx={frame.ball[0]} cy={frame.ball[1]} r={r * 0.7} fill={MODE_COLOR.ball} stroke="#000" strokeWidth={r / 6} />}
                </g>
              </svg>
            )}
          </div>
        )}

        {media?.kind === "video" && size && (
          <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
            <button className="btn btn-outline min-h-9 px-3 text-sm" onClick={() => (videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause())}>
              Play / pause
            </button>
            <button className="btn btn-outline min-h-9 px-3 text-sm" onClick={() => step(-1)} aria-label="Back one second">
              −1s
            </button>
            <button className="btn btn-outline min-h-9 px-3 text-sm" onClick={() => step(-1 / 30)} aria-label="Back one frame">
              −1 frame
            </button>
            <button className="btn btn-outline min-h-9 px-3 text-sm" onClick={() => step(1 / 30)} aria-label="Forward one frame">
              +1 frame
            </button>
            <button className="btn btn-outline min-h-9 px-3 text-sm" onClick={() => step(1)} aria-label="Forward one second">
              +1s
            </button>
            <input
              type="range"
              className="min-w-40 flex-1"
              min={0}
              max={clock.length || 0}
              step={0.01}
              value={clock.at}
              aria-label="Position in the video"
              onChange={(e) => {
                if (videoRef.current) videoRef.current.currentTime = Number(e.target.value);
              }}
            />
            <span className="tabular-nums text-muted">
              {clock.at.toFixed(2)}s / {clock.length.toFixed(0)}s
            </span>
          </div>
        )}

        {frame && (
          <div className="card flex flex-col gap-3 p-3 text-sm">
            <div className="flex flex-wrap gap-2" role="group" aria-label="What a click marks">
              {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
                <button key={m} className={`btn min-h-9 px-3 text-sm ${mode === m ? "btn-primary" : "btn-outline"}`} aria-pressed={mode === m} onClick={() => setMode(m)}>
                  <span aria-hidden className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: MODE_COLOR[m] }} />
                  {MODE_LABEL[m]}
                  {m === "landmark" ? ` (${frame.landmarks.length})` : m === "offense" ? ` (${frame.offense.length})` : m === "defense" ? ` (${frame.defense.length})` : ""}
                </button>
              ))}
            </div>
            {mode === "landmark" && (
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-muted">Yard line, as you see it</span>
                  <select className="input w-auto" value={along} onChange={(e) => setAlong(Number(e.target.value))}>
                    {YARD_LINES.map((y) => (
                      <option key={y} value={y}>
                        {yardLabel(y)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-muted">Where it crosses</span>
                  <select className="input w-auto" value={ref} onChange={(e) => setRef(e.target.value as LateralRef)}>
                    {LATERAL_REFS.map((x) => (
                      <option key={x} value={x}>
                        {LATERAL_LABEL[x]}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="max-w-prose text-muted">
                  Pick the spot here, then click it in the picture. Mark at least 4, on two or more yard lines. &ldquo;Near&rdquo; is the side closer to the camera.
                </p>
              </div>
            )}
            {mode !== "landmark" && <p className="text-muted">{mode === "ball" ? "Click the ball." : mode === "erase" ? "Click a mark to remove it." : "Click each player where his feet are."}</p>}
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-muted">Offense is going</span>
                <select className="input w-auto" value={frame.direction} onChange={(e) => update({ direction: e.target.value as "left" | "right" })}>
                  <option value="right">Left to right</option>
                  <option value="left">Right to left</option>
                </select>
              </label>
              <label className="flex min-w-40 flex-1 flex-col gap-1">
                <span className="text-muted">Name this snap</span>
                <input className="input" value={frame.label} onChange={(e) => update({ label: e.target.value })} />
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="card flex flex-col gap-2 p-3 text-sm">
          <h2 className="text-xl">Snaps marked</h2>
          {frames.length === 0 && <p className="text-muted">None yet. Open a picture or video, pause just before the snap, and choose &ldquo;Mark this frame&rdquo;.</p>}
          <ul className="flex flex-col gap-1">
            {frames.map((f) => (
              <li key={f.id} className="flex items-center gap-2">
                <button className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left ${f.id === selectedId ? "bg-card-2 font-semibold" : ""}`} onClick={() => pick(f)}>
                  {f.label || "Unnamed"}
                  <span className="ml-2 text-muted">{f.offense.length} off.</span>
                </button>
                <button
                  className="text-muted underline"
                  onClick={() => {
                    if (window.confirm(`Delete "${f.label || "this snap"}"?`)) setFrames(frames.filter((x) => x.id !== f.id));
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <button className="btn btn-outline min-h-9 px-3 text-sm" onClick={exportFile} disabled={!frames.length}>
              Save to a file
            </button>
            <label className="btn btn-outline min-h-9 cursor-pointer px-3 text-sm">
              Add from a file
              <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => importFile(e.target.files?.[0])} />
            </label>
          </div>
          {message && (
            <p className="text-muted" role="status">
              {message}
            </p>
          )}
        </div>

        {frame && solved && (
          <div className="card flex flex-col gap-3 p-3 text-sm">
            <h2 className="text-xl">What the rules see</h2>
            {!solved.ok && <p className="text-muted">{solved.reason}</p>}
            {solved.ok && (
              <>
                <p className={solved.fitError > 1 ? "text-bad" : "text-muted"}>
                  Ball on the {solved.spot.yard_line}, {solved.spot.hash} hash. Field spots fit within {solved.fitError.toFixed(2)} yards
                  {solved.fitError > 1 ? ": one of them is probably labeled wrong." : "."}
                </p>
                {result && <TopDown read={result.read} defense={solved.defense} />}
                {result?.read.notes.map((n) => (
                  <p key={n} className="text-bad">
                    {n}
                  </p>
                ))}
                {!result && <p className="text-muted">Mark the offense to see a reading.</p>}
              </>
            )}
            {got && conf && result && (
              <>
                <table className="w-full text-left">
                  <thead className="text-muted">
                    <tr>
                      <th className="py-1 font-normal">Field</th>
                      <th className="py-1 font-normal">Rules say</th>
                      <th className="py-1 font-normal">Sure</th>
                      <th className="py-1 font-normal">Right answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FIELDS.map((f) => {
                      const want = frame.expected[f];
                      const ok = want ? same(f, got[f], want) : null;
                      return (
                        <tr key={f} className="border-t border-line align-top">
                          <td className="py-1.5 pr-2">{FIELD_LABEL[f]}</td>
                          <td className={`py-1.5 pr-2 ${ok === false ? "text-bad" : ok ? "text-ok" : ""}`}>
                            {pretty(f, got[f])}
                            {f === "formation" && result.match && <span className="block text-muted">{result.match.cost.toFixed(1)} yd off on average</span>}
                          </td>
                          <td className="py-1.5 pr-2 tabular-nums">{Math.round(conf[f] * 100)}%</td>
                          <td className="py-1.5">
                            {f === "formation" && (
                              <>
                                <input className="input py-2" list="team-formations" value={want ?? ""} aria-label="Right formation name" onChange={(e) => setExpected({ formation: e.target.value })} />
                                <datalist id="team-formations">
                                  {formations.map((x) => (
                                    <option key={x.name} value={x.name} />
                                  ))}
                                </datalist>
                              </>
                            )}
                            {f === "shape" && <input className="input py-2" placeholder="3x1" value={want ?? ""} aria-label="Right receiver shape" onChange={(e) => setExpected({ shape: e.target.value.trim() })} />}
                            {f === "personnel" && <input className="input py-2" placeholder="11" value={want ?? ""} aria-label="Right personnel" onChange={(e) => setExpected({ personnel: e.target.value.trim() })} />}
                            {f === "strength" && (
                              <select className="input py-2" value={want ?? ""} aria-label="Right strength" onChange={(e) => setExpected({ strength: (e.target.value || undefined) as Expected["strength"] })}>
                                <option value="">Not answered</option>
                                <option value="left">Left</option>
                                <option value="right">Right</option>
                                <option value="balanced">Balanced</option>
                              </select>
                            )}
                            {f === "qb" && (
                              <select className="input py-2" value={want ?? ""} aria-label="Right quarterback spot" onChange={(e) => setExpected({ qb: (e.target.value || undefined) as Expected["qb"] })}>
                                <option value="">Not answered</option>
                                {Object.entries(QB_LABEL).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            )}
                            {f === "backs" && (
                              <select className="input py-2" value={want ?? ""} aria-label="Right backfield" onChange={(e) => setExpected({ backs: (e.target.value || undefined) as Expected["backs"] })}>
                                <option value="">Not answered</option>
                                {BACK_SETS.map((k) => (
                                  <option key={k} value={k}>
                                    {BACK_SET_LABEL[k]}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button
                  className="btn btn-outline min-h-9 self-start px-3 text-sm"
                  onClick={() => setExpected({ formation: got.formation ?? undefined, shape: got.shape ?? undefined, strength: result.read.strength, qb: result.read.qb, backs: result.read.backs, personnel: got.personnel ?? undefined })}
                >
                  The rules got all of it right
                </button>
                <p className="text-muted">
                  Receivers count tight ends and wings. Strength is the side with more receivers; a tie goes to the tight end&rsquo;s side. Circles above: L line, TE tight end, W wing, X on the line, S off the line, Q quarterback, B back.
                </p>
              </>
            )}
          </div>
        )}

        {frames.length > 0 && (
          <div className="card flex flex-col gap-2 p-3 text-sm">
            <h2 className="text-xl">Score so far</h2>
            <table className="w-full text-left">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 font-normal">Field</th>
                  <th className="py-1 font-normal">Right</th>
                  <th className="py-1 font-normal">Wrong</th>
                  <th className="py-1 font-normal">Not answered</th>
                </tr>
              </thead>
              <tbody>
                {report.fields.map((f) => (
                  <tr key={f.field} className="border-t border-line">
                    <td className="py-1.5">{FIELD_LABEL[f.field]}</td>
                    <td className="py-1.5 tabular-nums">{f.right}</td>
                    <td className="py-1.5 tabular-nums">{f.wrong}</td>
                    <td className="py-1.5 tabular-nums">{f.unverified}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.unsolved.length > 0 && <p className="text-muted">{report.unsolved.length} not finished marking.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
