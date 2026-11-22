"use client";
/**
 * A playbook page image, whole or cropped to one diagram. Coordinates are
 * PDF points, the same space the AI's diagram boxes and tap targets use.
 * Optionally tappable: reports the tap in points.
 */
import { useRef } from "react";
import type { Box } from "@/teach/types";

export interface PageViewProps {
  url: string;
  width: number;
  height: number;
  crop?: Box | null;
  /** boxes to outline (e.g. the correct tap target) */
  marks?: Array<{ box: Box; tone: "ok" | "bad" | "accent" }>;
  /** dots (e.g. where the player tapped) */
  dots?: Array<{ x: number; y: number; tone: "ok" | "bad" | "accent" }>;
  onTap?: (p: { x: number; y: number }) => void;
  className?: string;
}

const TONE = { ok: "#1f7a4d", bad: "#a3322a", accent: "#e8a317" };

export function PageView({ url, width, height, crop, marks = [], dots = [], onTap, className }: PageViewProps) {
  const ref = useRef<SVGSVGElement>(null);
  const pad = crop ? 6 : 0;
  const vb = crop
    ? { x: Math.max(0, crop.x - pad), y: Math.max(0, crop.y - pad), w: Math.min(width, crop.w + pad * 2), h: Math.min(height, crop.h + pad * 2) }
    : { x: 0, y: 0, w: width, h: height };
  const scale = vb.w / 400; // stroke widths relative to what's shown
  return (
    <svg
      ref={ref}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      className={className}
      style={{ background: "#fff", cursor: onTap ? "crosshair" : undefined, touchAction: "manipulation" }}
      onClick={
        onTap
          ? (e) => {
              const r = ref.current!.getBoundingClientRect();
              onTap({ x: vb.x + ((e.clientX - r.left) / r.width) * vb.w, y: vb.y + ((e.clientY - r.top) / r.height) * vb.h });
            }
          : undefined
      }
      role="img"
      aria-label="Playbook page"
    >
      <image href={url} x={0} y={0} width={width} height={height} preserveAspectRatio="none" />
      {marks.map((m, i) => (
        <rect key={i} x={m.box.x} y={m.box.y} width={m.box.w} height={m.box.h} fill="none" stroke={TONE[m.tone]} strokeWidth={2.5 * scale} rx={3 * scale} />
      ))}
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={5 * scale} fill={TONE[d.tone]} stroke="#fff" strokeWidth={1.5 * scale} />
      ))}
    </svg>
  );
}
