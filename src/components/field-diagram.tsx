/**
 * Draws a library diagram (src/library/types.ts): offense as circles, defense
 * as letters, routes/blocks/motion as lines, zones as shaded ovals. Fits the
 * drawing to its own players; offense faces up the screen.
 */
import { useId } from "react";
import type { Diagram } from "@/library/types";

const PAD = 2.2;
const R = 0.6;

/**
 * Wideouts drawn to scale shrink the box to specks on a phone, so space
 * beyond CORE yards from the ball is drawn at SQ scale (the picture stays in
 * order: who's outside whom never changes).
 */
const CORE = 7;
const SQ = 0.45;
const sx = (x: number) => (Math.abs(x) <= CORE ? x : Math.sign(x) * (CORE + (Math.abs(x) - CORE) * SQ));
function squeeze(d: Diagram): Diagram {
  if (Math.max(...d.dots.map((p) => Math.abs(p.x))) <= CORE + 3) return d;
  return {
    ...d,
    dots: d.dots.map((p) => ({ ...p, x: sx(p.x) })),
    lines: d.lines?.map((l) => ({ ...l, pts: l.pts.map(([x, y]) => [sx(x), y] as [number, number]) })),
    zones: d.zones?.map((z) => {
      const a = sx(z.x - z.rx);
      const b = sx(z.x + z.rx);
      return { ...z, x: (a + b) / 2, rx: (b - a) / 2 };
    }),
    notes: d.notes?.map((n) => ({ ...n, x: sx(n.x) })),
  };
}

export function FieldDiagram({ diagram: raw, className = "" }: { diagram: Diagram; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const diagram = squeeze(raw);
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (x: number, y: number) => {
    xs.push(x);
    ys.push(y);
  };
  for (const p of diagram.dots) add(p.x, p.y);
  for (const l of diagram.lines ?? []) for (const [x, y] of l.pts) add(x, y);
  for (const z of diagram.zones ?? []) {
    add(z.x - z.rx, z.y - z.ry);
    add(z.x + z.rx, z.y + z.ry);
  }
  for (const n of diagram.notes ?? []) add(n.x, n.y);
  if (!xs.length) return null;
  const minX = Math.min(...xs) - PAD;
  const maxX = Math.max(...xs) + PAD;
  const minY = Math.min(...ys, 0) - PAD;
  const maxY = Math.max(...ys, 0) + PAD;
  // screen y = -yards (defense at the top)
  const vb = `${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`;
  const stroke = (side?: "o" | "d") => (side === "d" ? "var(--color-bad)" : "var(--color-ink)");

  return (
    <svg viewBox={vb} className={`w-full rounded border border-line bg-card ${className}`} role="img" aria-label="Field diagram" style={{ maxHeight: maxY - minY > 1.3 * (maxX - minX) ? 520 : 340 }}>
      <defs>
        {(["o", "d"] as const).map((s) => (
          <marker key={s} id={`${uid}-a-${s}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={stroke(s)} />
          </marker>
        ))}
        {(["o", "d"] as const).map((s) => (
          <marker key={`t${s}`} id={`${uid}-t-${s}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M5,0 L5,10" stroke={stroke(s)} strokeWidth="2.5" />
          </marker>
        ))}
      </defs>
      {diagram.los !== false && <line x1={minX} x2={maxX} y1={0} y2={0} stroke="var(--color-line)" strokeWidth={0.12} strokeDasharray="0.5 0.4" />}
      {(diagram.zones ?? []).map((z, i) => (
        <g key={`z${i}`}>
          <ellipse cx={z.x} cy={-z.y} rx={z.rx} ry={z.ry} fill="var(--color-bad)" fillOpacity={0.1} stroke="var(--color-bad)" strokeOpacity={0.4} strokeWidth={0.1} />
          <text x={z.x} y={-z.y + 0.35} textAnchor="middle" fontSize={0.9} fill="var(--color-bad)">
            {z.label}
          </text>
        </g>
      ))}
      {(diagram.lines ?? []).map((l, i) => {
        const s = l.side ?? "o";
        const dash = l.kind === "motion" ? "0.6 0.4" : l.kind === "read" ? "0.2 0.35" : undefined;
        const end = l.kind === "block" ? `url(#${uid}-t-${s})` : l.kind === "path" ? undefined : `url(#${uid}-a-${s})`;
        return (
          <polyline
            key={`l${i}`}
            points={l.pts.map(([x, y]) => `${x},${-y}`).join(" ")}
            fill="none"
            stroke={stroke(s)}
            strokeOpacity={l.kind === "path" ? 0.4 : 1}
            strokeWidth={l.kind === "run" ? 0.22 : 0.15}
            strokeDasharray={dash}
            strokeLinejoin="round"
            markerEnd={end}
          />
        );
      })}
      {diagram.dots.map((p, i) =>
        p.side === "o" ? (
          <g key={`p${i}`}>
            <circle cx={p.x} cy={-p.y} r={R} fill={p.hi ? "var(--color-brand)" : "var(--color-card)"} stroke="var(--color-ink)" strokeWidth={0.12} />
            <text x={p.x} y={-p.y + 0.21} textAnchor="middle" fontSize={p.label.length > 2 ? 0.42 : 0.58} fontWeight={700} fill={p.hi ? "var(--color-brand-ink)" : "var(--color-ink)"}>
              {p.label}
            </text>
          </g>
        ) : (
          <g key={`p${i}`}>
            {p.hi && <circle cx={p.x} cy={-p.y} r={R + 0.05} fill="var(--color-bad)" fillOpacity={0.15} stroke="var(--color-bad)" strokeWidth={0.1} />}
            <text x={p.x} y={-p.y + 0.27} textAnchor="middle" fontSize={p.label.length > 2 ? 0.55 : 0.75} fontWeight={800} fill="var(--color-bad)">
              {p.label}
            </text>
          </g>
        ),
      )}
      {(diagram.notes ?? []).map((n, i) => (
        <text key={`n${i}`} x={n.x} y={-n.y + 0.3} textAnchor="middle" fontSize={0.75} fill="var(--color-muted)" fontWeight={600}>
          {n.text}
        </text>
      ))}
    </svg>
  );
}
