"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { gridBoxes, type Box } from "@/ingest/boxes";
import { cropPageAction, extractAction, renderPagesAction, setBoxesAction } from "../../actions";

interface PageInfo {
  id: string;
  pageNo: number;
  width: number;
  height: number;
  imageKey: string;
  boxes: Box[];
  confirmed: boolean;
}
interface PlayInfo {
  id: string;
  pageId: string | null;
  boxIndex: number | null;
  name: string;
  extraction: string;
  extractionError: string | null;
  status: string;
  archived: boolean;
}

const CONCURRENCY = 4;
const mediaUrl = (key: string) => `/media/${key.split("/").map(encodeURIComponent).join("/")}`;

export function UploadReview(props: {
  teamId: string;
  upload: { id: string; filename: string; pageCount: number; status: string };
  pages: PageInfo[];
  plays: PlayInfo[];
  canRead: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PageInfo | null>(null);
  const [run, setRun] = useState<{ label: string; done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Server data is the source of truth (it refreshes after each step);
  // live read results overlay it until the next refresh.
  const [live, setLive] = useState<Record<string, { extraction: string; extractionError: string | null }>>({});
  const plays = props.plays.map((p) => (live[p.id] ? { ...p, ...live[p.id] } : p));
  const setPlays = (id: string, v: { extraction: string; extractionError: string | null }) => setLive((l) => ({ ...l, [id]: v }));

  const byPage = new Map<string, PlayInfo[]>();
  for (const p of plays) if (p.pageId) byPage.set(p.pageId, [...(byPage.get(p.pageId) ?? []), p]);
  const boxCount = props.pages.reduce((n, p) => n + p.boxes.length, 0);
  const cropped = props.pages.filter((p) => byPage.has(p.id) || p.boxes.length === 0).length;
  const toRead = plays.filter((p) => !p.archived && (p.extraction === "pending" || p.extraction === "failed"));
  const readDone = plays.filter((p) => p.extraction === "done").length;

  async function resumeRender() {
    const start = props.pages.length + 1;
    for (let from = start; from <= props.upload.pageCount; from += 3) {
      setRun({ label: "Splitting pages", done: from - 1, total: props.upload.pageCount });
      const r = await renderPagesAction(props.teamId, props.upload.id, from, from + 2);
      if (!r.ok) return setError(r.error);
    }
    setRun(null);
    router.refresh();
  }

  async function cropAndRead() {
    setError(null);
    // 1. crop pages that have no plays yet
    const pending = props.pages.filter((p) => !byPage.has(p.id) && p.boxes.length > 0);
    let made: string[] = [];
    for (const [i, p] of pending.entries()) {
      setRun({ label: "Cutting out plays", done: i, total: pending.length });
      const r = await cropPageAction(props.teamId, p.id);
      if (!r.ok) return setError(r.error);
      made = made.concat(r.playIds);
    }
    router.refresh();
    if (!props.canRead) {
      setRun(null);
      return;
    }
    // 2. read every pending play, a few at a time
    const queue = [...toRead.map((p) => p.id), ...made];
    let done = 0;
    setRun({ label: "Reading plays", done, total: queue.length });
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift()!;
        const r = await extractAction(props.teamId, id);
        done++;
        setRun({ label: "Reading plays", done, total: done + queue.length });
        if (r.ok) setPlays(id, { extraction: r.extraction, extractionError: r.error });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRun(null);
    router.refresh();
  }

  if (editing) {
    return (
      <BoxEditor
        page={editing}
        onCancel={() => setEditing(null)}
        onSave={async (boxes) => {
          const r = await setBoxesAction(props.teamId, editing.id, boxes);
          if (!r.ok) return r.error;
          setEditing(null);
          router.refresh();
          return null;
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/t/${props.teamId}/uploads`} className="text-sm text-muted underline">
          Uploads
        </Link>
        <h1 className="mt-1 truncate text-2xl font-bold">{props.upload.filename}</h1>
        <p className="mt-1 text-sm text-muted">
          {props.pages.length} of {props.upload.pageCount} pages split · {boxCount} plays found · {readDone} read
        </p>
      </div>

      {props.pages.length < props.upload.pageCount && (
        <button className="btn btn-ghost self-start" onClick={resumeRender} disabled={!!run}>
          Finish splitting pages
        </button>
      )}

      <div className="card flex flex-col gap-3 p-4">
        <p className="text-sm">
          <strong>Check the boxes.</strong> Each box should hold one play. Tap a page to fix it — drag boxes, pick a grid, add or delete. Then cut out the plays
          {props.canRead ? " and let Reps read them." : "."}
        </p>
        <button className="btn btn-primary" onClick={cropAndRead} disabled={!!run || (cropped === props.pages.length && toRead.length === 0)}>
          {cropped < props.pages.length
            ? props.canRead
              ? `Cut out ${boxCount} plays and read them`
              : `Cut out ${boxCount} plays`
            : toRead.length && props.canRead
              ? `Read ${toRead.length} remaining plays`
              : "All plays cut out"}
        </button>
        {run && (
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span>{run.label}…</span>
              <span>
                {run.done} / {run.total}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-line">
              <div className="h-full bg-accent transition-all" style={{ width: `${(run.done / Math.max(1, run.total)) * 100}%` }} />
            </div>
          </div>
        )}
        {error && <p className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
        {plays.length > 0 && (
          <Link className="btn btn-accent" href={`/t/${props.teamId}/plays?f=${readDone > 0 ? "todo" : "all"}&upload=${props.upload.id}`}>
            {readDone > 0 ? "Review plays" : props.canRead ? "See the plays" : "Fill in the plays"}
          </Link>
        )}
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {props.pages.map((p) => {
          const ps = byPage.get(p.id) ?? [];
          return (
            <li key={p.id} className="card overflow-hidden">
              <button className="relative block w-full" onClick={() => setEditing(p)} aria-label={`Edit boxes on page ${p.pageNo}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(p.imageKey)} alt={`Page ${p.pageNo}`} className="block w-full" loading="lazy" />
                <svg viewBox={`0 0 ${p.width} ${p.height}`} className="absolute inset-0 h-full w-full">
                  {p.boxes.map((b, i) => (
                    <g key={i}>
                      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="rgba(232,163,23,0.12)" stroke="#e8a317" strokeWidth={3} />
                      <text x={b.x + 8} y={b.y + 26} fontSize={24} fontWeight={700} fill="#9a5b00">
                        {i + 1}
                      </text>
                    </g>
                  ))}
                </svg>
              </button>
              <div className="flex items-center justify-between px-2 py-1.5 text-xs">
                <span className="font-semibold">Page {p.pageNo}</span>
                <span className="text-muted">
                  {p.boxes.length} {p.boxes.length === 1 ? "play" : "plays"}
                  {ps.length ? ` · ${ps.filter((x) => x.extraction === "done").length} read` : ""}
                </span>
              </div>
              {ps.some((x) => x.extraction === "failed" || x.extraction === "not_a_play") && (
                <ul className="px-2 pb-2 text-xs">
                  {ps
                    .filter((x) => x.extraction === "failed" || x.extraction === "not_a_play")
                    .map((x) => (
                      <li key={x.id}>
                        <Link href={`/t/${props.teamId}/plays/${x.id}`} className="text-warn underline">
                          Box {(x.boxIndex ?? 0) + 1}: {x.extraction === "not_a_play" ? "not a play (skipped)" : "couldn't read — fill in"}
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type Drag = { i: number; mode: "move" | "nw" | "se"; startX: number; startY: number; orig: Box } | null;

function BoxEditor({ page, onCancel, onSave }: { page: PageInfo; onCancel: () => void; onSave: (boxes: Box[]) => Promise<string | null> }) {
  const [boxes, setBoxes] = useState<Box[]>(page.boxes);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag>(null);

  const pt = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * page.width, y: ((e.clientY - r.top) / r.height) * page.height };
  };
  const down = (i: number, mode: "move" | "nw" | "se") => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = pt(e);
    setSel(i);
    drag.current = { i, mode, startX: p.x, startY: p.y, orig: boxes[i]! };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = pt(e);
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;
    setBoxes((bs) =>
      bs.map((b, i) => {
        if (i !== d.i) return b;
        const o = d.orig;
        if (d.mode === "move") return { ...o, x: o.x + dx, y: o.y + dy };
        if (d.mode === "se") return { ...o, w: Math.max(30, o.w + dx), h: Math.max(30, o.h + dy) };
        return { x: o.x + dx, y: o.y + dy, w: Math.max(30, o.w - dx), h: Math.max(30, o.h - dy) };
      }),
    );
  };
  const up = () => {
    drag.current = null;
  };
  const layouts: Array<[string, number, number]> = [
    ["1", 1, 1],
    ["2", 1, 2],
    ["4", 2, 2],
    ["6", 2, 3],
    ["8", 2, 4],
  ];
  const landscape = page.width > page.height;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Page {page.pageNo}</h1>
        <button className="text-sm text-muted underline" onClick={onCancel}>
          Back
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Grid:</span>
        {layouts.map(([label, c, r]) => (
          <button key={label} className="btn btn-ghost min-h-9 px-3" onClick={() => setBoxes(gridBoxes(page, landscape ? r : c, landscape ? c : r))}>
            {label}
          </button>
        ))}
        <button
          className="btn btn-ghost min-h-9 px-3"
          onClick={() => setBoxes((bs) => [...bs, { x: page.width * 0.3, y: page.height * 0.3, w: page.width * 0.4, h: page.height * 0.25 }])}
        >
          + Box
        </button>
        <button className="btn btn-ghost min-h-9 px-3" disabled={sel == null} onClick={() => sel != null && (setBoxes((bs) => bs.filter((_, i) => i !== sel)), setSel(null))}>
          Delete box
        </button>
        <button className="btn btn-ghost min-h-9 px-3" onClick={() => setBoxes(page.boxes)}>
          Reset
        </button>
      </div>
      <div className="relative touch-none select-none overflow-hidden rounded-lg border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mediaUrl(page.imageKey)} alt={`Page ${page.pageNo}`} className="block w-full" draggable={false} />
        <svg ref={svg} viewBox={`0 0 ${page.width} ${page.height}`} className="absolute inset-0 h-full w-full" onPointerMove={move} onPointerUp={up} onPointerDown={() => setSel(null)}>
          {boxes.map((b, i) => (
            <g key={i}>
              <rect
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                fill={sel === i ? "rgba(232,163,23,0.25)" : "rgba(232,163,23,0.1)"}
                stroke="#e8a317"
                strokeWidth={3}
                onPointerDown={down(i, "move")}
                style={{ cursor: "move" }}
              />
              <text x={b.x + 8} y={b.y + 26} fontSize={24} fontWeight={700} fill="#9a5b00" pointerEvents="none">
                {i + 1}
              </text>
              <circle cx={b.x} cy={b.y} r={12} fill="#e8a317" onPointerDown={down(i, "nw")} style={{ cursor: "nwse-resize" }} />
              <circle cx={b.x + b.w} cy={b.y + b.h} r={12} fill="#e8a317" onPointerDown={down(i, "se")} style={{ cursor: "nwse-resize" }} />
            </g>
          ))}
        </svg>
      </div>
      {err && <p className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{err}</p>}
      <div className="sticky bottom-0 flex gap-2 bg-bg py-2">
        <button
          className="btn btn-primary flex-1"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(await onSave(boxes));
            setBusy(false);
          }}
        >
          {busy ? "Cutting…" : `Save ${boxes.length} ${boxes.length === 1 ? "box" : "boxes"}`}
        </button>
      </div>
    </div>
  );
}
