"use client";
/**
 * The one play renderer. Draws a play from its data (never the crop), so it
 * can hide routes, flip, animate, and overlay a defensive look.
 * Units are yards: x from the ball (right +), y downfield (+). SVG y = TOP - y.
 */
import { useId, useRef, useState } from "react";
import { buildLook, defenderForKey, playSideSign, type DefensiveLook, type Front } from "@/domain/defense";
import { flipPlay, isLineman, type Coverage, type Line, type PlayData, type Player, type Point } from "@/domain/play";
import { ROUTE_BY_KEY, outsideSign, routePath } from "@/domain/routes";

const TOP = 22;
const BOTTOM = -12;
const HALF = 27;

export interface PlaySvgProps {
  data: PlayData;
  flip?: boolean;
  /** "all": no assignments drawn; "player": hide only `highlight`'s assignment */
  hide?: "none" | "all" | "player";
  highlight?: string | null;
  coverage?: Coverage | null;
  front?: Front;
  readKey?: { key: string; reaction?: string } | null;
  routeOnly?: { route: string; side: "left" | "right" } | null;
  /** progression order badges: player id -> 1, 2, 3 */
  order?: Record<string, number>;
  animate?: boolean;
  onPlayerTap?: (id: string) => void;
  onDefenderTap?: (roles: string[], id: string) => void;
  selectedDefender?: string | null;
  className?: string;
  /** clip the vertical extent for compact cards */
  compact?: boolean;
  /** zoom to the players and their lines (a drawing of just the line and backs fills the frame) */
  fit?: boolean;
  /** play builder: drag players; called with the new spot in yards (snapped to half yards) */
  onPlayerDrag?: (id: string, x: number, y: number) => void;
  /** play builder: the selected player gets a ring */
  selected?: string | null;
  /** play builder: draw lines by hand with this pen (touch a player and drag) instead of moving players */
  pen?: Line | null;
  /** the hand-drawn line in field yards, starting at the player (or where his motion ends) */
  onDraw?: (id: string, pts: Point[]) => void;
  /** a line drawn by hand on top of the play (a quiz answer): in field yards as shown */
  overlay?: { pts: Point[]; pen: Line; tone: "draft" | "ok" | "bad" } | null;
}

/** A hand line with its own arrowhead or T, in one color (markers can't take the line's color). */
function HandLine({ pts, pen, color }: { pts: Point[]; pen: Line; color: string }) {
  if (pts.length < 2) return null;
  const [a, b] = [pts[pts.length - 2]!, pts[pts.length - 1]!];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const [nx, ny] = [-uy, ux];
  const tip = (dx: number, dy: number) => `${(b[0] + dx).toFixed(2)} ${sy(b[1] + dy).toFixed(2)}`;
  return (
    <g pointerEvents="none">
      <path d={pen.style === "squiggly" ? zigzag(...pts) : toPath(pts, 0, 0)} stroke={color} strokeWidth={0.32} strokeDasharray={pen.style === "dotted" ? "0.6 0.5" : undefined} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {pen.end === "arrow" && <path d={`M${tip(0, 0)} L${tip(-ux * 1 + nx * 0.5, -uy * 1 + ny * 0.5)} L${tip(-ux * 1 - nx * 0.5, -uy * 1 - ny * 0.5)} Z`} fill={color} />}
      {pen.end === "t" && <path d={`M${tip(nx * 0.7, ny * 0.7)} L${tip(-nx * 0.7, -ny * 0.7)}`} stroke={color} strokeWidth={0.32} strokeLinecap="round" />}
    </g>
  );
}

/** Field area a play uses: every player, the end of every line, motion ends and defenders. */
function extent(data: PlayData, strength: string, extra: Array<{ x: number; y: number }>) {
  const pts: Point[] = [];
  for (const p of data.players) {
    const start: Point = data.motion && data.motion.player === p.id && data.motion.end ? data.motion.end : [p.x, p.y];
    pts.push([p.x, p.y], start);
    const rel = p.route ? routePath(p.route, p, strength) : p.block?.path ?? p.path;
    for (const [dx, dy] of rel ?? []) pts.push([start[0] + dx, start[1] + dy]);
    if (data.motion?.player === p.id) for (const [dx, dy] of data.motion.path ?? []) pts.push([p.x + dx, p.y + dy]);
  }
  for (const d of extra) pts.push([d.x, d.y]);
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

const sy = (y: number) => TOP - y;
const toPath = (pts: Point[], ox: number, oy: number) =>
  pts.map(([x, y], i) => `${i ? "L" : "M"}${(ox + x).toFixed(2)} ${sy(oy + y).toFixed(2)}`).join(" ");

/** A squiggly (motion) line along field points. */
function zigzag(...pts: Point[]): string {
  const segs: Array<{ a: Point; b: Point; len: number; at: number }> = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
    if (len > 0) segs.push({ a: pts[i - 1]!, b: pts[i]!, len, at: total });
    total += len;
  }
  const [x0, y0] = pts[0]!;
  let d = `M${x0.toFixed(2)} ${sy(y0).toFixed(2)}`;
  if (!segs.length) return d;
  const n = Math.max(4, Math.round(total / 0.8));
  for (let i = 1; i <= n; i++) {
    const t = (i / n) * total;
    const g = segs.find((x) => t <= x.at + x.len + 1e-9) ?? segs[segs.length - 1]!;
    const f = (t - g.at) / g.len;
    const nx = -(g.b[1] - g.a[1]) / g.len;
    const ny = (g.b[0] - g.a[0]) / g.len;
    const amp = i === n ? 0 : i % 2 ? 0.35 : -0.35;
    d += ` L${(g.a[0] + (g.b[0] - g.a[0]) * f + nx * amp).toFixed(2)} ${sy(g.a[1] + (g.b[1] - g.a[1]) * f + ny * amp).toFixed(2)}`;
  }
  return d;
}

/** Path for the read key's reaction, relative to the defender. */
function reactionVector(reaction: string, def: { x: number; y: number }, play: PlayData): Point[] {
  const inside = def.x > 0 ? -1 : 1;
  const qb = play.players.find((p) => p.id === "QB");
  switch (reaction) {
    case "crashes":
    case "tackles_dive":
      return [[0, 0], [inside * 2.5, -1.5]];
    case "stays_home":
      return [[0, 0], [-inside * 0.6, 1.2]];
    case "attacks_qb":
      return qb ? [[0, 0], [(qb.x - def.x) * 0.6, (qb.y - def.y) * 0.6]] : [[0, 0], [inside, -2.5]];
    case "takes_pitch":
      return [[0, 0], [-inside * 3, -0.5]];
    case "fits_run":
      return [[0, 0], [inside * 1.5, -3]];
    case "drops":
      return [[0, 0], [-inside * 1, 4]];
    default:
      return [[0, 0], [0, 1]];
  }
}

export function PlaySvg(props: PlaySvgProps) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<string | null>(null);
  const stroke = useRef<{ id: string; pts: Point[] } | null>(null);
  const [live, setLive] = useState<Point[] | null>(null);
  const rawYards = (e: React.PointerEvent): Point | null => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [pt.x, TOP - pt.y];
  };
  const toYards = (e: React.PointerEvent): [number, number] | null => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const snap = (v: number) => Math.round(v * 2) / 2;
    return [snap(pt.x), snap(TOP - pt.y)];
  };
  const data = props.flip ? flipPlay(props.data) : props.data;
  const hide = props.hide ?? "none";
  const look: DefensiveLook | null = props.coverage || props.readKey ? buildLook(data, props.coverage ?? "cover_3", props.front ?? "4-3") : null;
  const keyDef = props.readKey && look ? defenderForKey(look, props.readKey.key) : undefined;
  const strength = data.formation.strength === "left" ? "left" : "right";

  const showAssignment = (p: Player) => {
    if (props.routeOnly) return false;
    if (hide === "all") return false;
    if (hide === "player" && p.id === props.highlight) return false;
    return true;
  };

  const lines: React.ReactNode[] = [];
  data.players.forEach((p, i) => {
    if (!showAssignment(p)) return;
    const start: Point = data.motion && data.motion.player === p.id && data.motion.end ? data.motion.end : [p.x, p.y];
    const dim = props.highlight && p.id !== props.highlight && hide !== "player";
    const op = dim ? 0.35 : 1;
    // a line the coach drew by hand keeps its look (dotted, arrow or T); otherwise Reps' usual look for the job
    const hand = p.line;
    const dash = (usual?: string) => (hand ? (hand.style === "dotted" ? "0.6 0.5" : undefined) : usual);
    const end = (usual: string) =>
      hand ? (hand.end === "arrow" ? `url(#${usual === "block" ? "arrow" : usual}-${uid})` : hand.end === "t" ? `url(#block-${uid})` : undefined) : `url(#${usual}-${uid})`;
    const d = (pts: Point[]) => (hand?.style === "squiggly" ? zigzag(...pts.map(([x, y]) => [start[0] + x, start[1] + y] as Point)) : toPath(pts, start[0], start[1]));
    if (p.route) {
      const pts = routePath(p.route, p, strength);
      if (pts) {
        lines.push(
          <path key={`r${i}`} d={d(pts)} className={props.animate ? "draw" : undefined} stroke="currentColor" strokeWidth={0.28} strokeDasharray={dash()} fill="none" markerEnd={end("arrow")} opacity={op} style={{ animationDelay: data.motion ? "0.9s" : "0s" }} />,
        );
      }
    } else if (p.block) {
      const pts = p.block.path && p.block.path.length >= 2 ? p.block.path : ([[0, 0], [0, 1.2]] as Point[]);
      lines.push(<path key={`b${i}`} d={d(pts)} stroke="currentColor" strokeWidth={0.24} strokeDasharray={dash()} fill="none" markerEnd={end("block")} opacity={op} />);
    } else if (p.path && p.path.length >= 2) {
      const carry = p.assignment_type === "carry";
      lines.push(
        <path key={`c${i}`} d={d(p.path)} className={props.animate ? "draw" : undefined} stroke={carry ? "var(--carry)" : "currentColor"} strokeWidth={0.3} strokeDasharray={dash(p.assignment_type === "fake" ? "0.6 0.5" : undefined)} fill="none" markerEnd={end(carry ? "arrowc" : "arrow")} opacity={op} />,
      );
    }
  });

  // motion
  if (data.motion && data.motion.end && !props.routeOnly && hide !== "all") {
    const p = data.players.find((x) => x.id === data.motion!.player);
    const m = data.motion;
    const pts: Point[] | null = p ? (m.path && m.path.length >= 2 ? m.path.map(([x, y]) => [p.x + x, p.y + y] as Point) : [[p.x, p.y], m.end!]) : null;
    if (pts) lines.push(<path key="motion" d={zigzag(...pts)} className={props.animate ? "draw" : undefined} stroke="currentColor" strokeWidth={0.2} fill="none" />);
  } else if (data.motion && !data.motion.end && !props.routeOnly && hide !== "all") {
    const p = data.players.find((x) => x.id === data.motion!.player);
    if (p) {
      const dir = data.motion.direction === "left" ? -1 : data.motion.direction === "right" ? 1 : -Math.sign(p.x || 1);
      lines.push(<path key="motion" d={zigzag([p.x, p.y], [p.x + dir * 6, p.y])} stroke="currentColor" strokeWidth={0.2} fill="none" />);
    }
  }

  // route-only mode: one route from a lone receiver
  let lone: React.ReactNode = null;
  if (props.routeOnly) {
    const x = props.routeOnly.side === "left" ? -12 : 12;
    const def = ROUTE_BY_KEY.get(props.routeOnly.route);
    const pts = def?.shape(def.depth).map(([dx, dy]) => [dx * outsideSign({ x, side: props.routeOnly!.side }), dy] as Point);
    lone = (
      <g>
        {pts && <path d={toPath(pts, x, 0)} className={props.animate ? "draw" : undefined} stroke="currentColor" strokeWidth={0.3} fill="none" markerEnd={`url(#arrow-${uid})`} />}
        <circle cx={x} cy={sy(0)} r={0.9} fill="var(--card)" stroke="currentColor" strokeWidth={0.2} />
        <rect x={-0.7} y={sy(0) - 0.7} width={1.4} height={1.4} fill="var(--card)" stroke="currentColor" strokeWidth={0.2} />
      </g>
    );
  }

  let yMin = props.compact ? -9 : BOTTOM;
  let yMax = props.compact ? 16 : TOP;
  let vx = -HALF;
  let vw = HALF * 2;
  if (props.fit && data.players.length) {
    const e = extent(data, strength, look?.defenders ?? []);
    const pad = 2.5;
    let x0 = e.x0 - pad;
    let x1 = e.x1 + pad;
    let y0 = e.y0 - pad;
    let y1 = e.y1 + pad;
    // never tighter than 16 x 10 yards, so a short drawing still reads as a field
    if (x1 - x0 < 16) [x0, x1] = [(x0 + x1) / 2 - 8, (x0 + x1) / 2 + 8];
    if (y1 - y0 < 10) [y0, y1] = [(y0 + y1) / 2 - 5, (y0 + y1) / 2 + 5];
    vx = Math.max(-HALF, x0);
    vw = Math.min(HALF, x1) - vx;
    yMin = Math.floor(y0);
    yMax = Math.ceil(y1);
  }
  const viewBox = `${vx} ${sy(yMax)} ${vw} ${yMax - yMin}`;

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      className={props.className}
      role="img"
      aria-label={data.name}
      style={{ color: "var(--ink)", touchAction: props.onPlayerDrag || props.pen ? "none" : undefined, cursor: props.pen ? "crosshair" : undefined }}
      onPointerDown={
        props.pen
          ? (e) => {
              // start at the nearest player, or where his motion ends
              const at = rawYards(e);
              if (!at) return;
              let best: { id: string; dist: number; from: Point } | null = null;
              for (const p of data.players) {
                const spots: Point[] = [[p.x, p.y]];
                if (data.motion?.player === p.id && data.motion.end && props.pen!.style !== "squiggly") spots.unshift(data.motion.end);
                for (const s of spots) {
                  const dist = Math.hypot(s[0] - at[0], s[1] - at[1]);
                  if (dist < 2.2 && (!best || dist < best.dist - 0.3)) best = { id: p.id, dist, from: s };
                }
              }
              if (!best) return;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              stroke.current = { id: best.id, pts: [best.from] };
              setLive([best.from]);
            }
          : undefined
      }
      onPointerMove={(e) => {
        if (props.pen && stroke.current) {
          const at = rawYards(e);
          const pts = stroke.current.pts;
          const last = pts[pts.length - 1]!;
          if (at && Math.hypot(at[0] - last[0], at[1] - last[1]) > 0.15) {
            pts.push(at);
            setLive([...pts]);
          }
          return;
        }
        if (!props.onPlayerDrag || !dragging.current) return;
        const at = toYards(e);
        if (at) props.onPlayerDrag(dragging.current, at[0], at[1]);
      }}
      onPointerUp={() => {
        dragging.current = null;
        const s = stroke.current;
        stroke.current = null;
        setLive(null);
        if (!s) return;
        let len = 0;
        for (let i = 1; i < s.pts.length; i++) len += Math.hypot(s.pts[i]![0] - s.pts[i - 1]![0], s.pts[i]![1] - s.pts[i - 1]![1]);
        if (len < 1) props.onPlayerTap?.(s.id); // a tap, not a line
        else props.onDraw?.(s.id, s.pts);
      }}
      onPointerCancel={() => {
        dragging.current = null;
        stroke.current = null;
        setLive(null);
      }}
      onPointerLeave={() => (dragging.current = null)}
    >
      <defs>
        <marker id={`arrow-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
        </marker>
        <marker id={`arrowc-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--carry)" />
        </marker>
        <marker id={`block-${uid}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M5 0 L5 10" stroke="currentColor" strokeWidth="2" />
        </marker>
      </defs>
      <rect x={vx} y={sy(yMax)} width={vw} height={yMax - yMin} fill="var(--field)" />
      {Array.from({ length: Math.floor((yMax - yMin) / 5) + 1 }, (_, i) => Math.ceil(yMin / 5) * 5 + i * 5).map((y) => (
        <line key={y} x1={-HALF} x2={HALF} y1={sy(y)} y2={sy(y)} stroke="var(--yard)" strokeWidth={0.12} />
      ))}
      {Array.from({ length: yMax - yMin }, (_, i) => yMin + i).map((y) => (
        <g key={`h${y}`}>
          <line x1={-3.1} x2={-2.5} y1={sy(y)} y2={sy(y)} stroke="var(--yard)" strokeWidth={0.1} />
          <line x1={2.5} x2={3.1} y1={sy(y)} y2={sy(y)} stroke="var(--yard)" strokeWidth={0.1} />
        </g>
      ))}
      <line x1={-HALF} x2={HALF} y1={sy(0)} y2={sy(0)} stroke="var(--los)" strokeWidth={0.2} />

      {look && (
        <g>
          {look.zones.map((z, i) => (
            <g key={i}>
              <ellipse cx={z.x} cy={sy(z.y)} rx={z.rx} ry={z.ry} fill="var(--zone)" stroke="var(--zone-line)" strokeWidth={0.08} />
              <text x={z.x} y={sy(z.y) + 0.35} fontSize={0.9} textAnchor="middle" fill="var(--muted)">
                {z.label}
              </text>
            </g>
          ))}
          {Object.entries(look.man).map(([d, o]) => {
            const def = look.defenders.find((x) => x.id === d);
            const off = data.players.find((x) => x.id === o);
            if (!def || !off) return null;
            return <line key={d} x1={def.x} y1={sy(def.y)} x2={off.x} y2={sy(off.y)} stroke="var(--zone-line)" strokeWidth={0.1} strokeDasharray="0.4 0.4" />;
          })}
          {look.defenders.map((d) => {
            const isKey = keyDef?.id === d.id;
            const sel = props.selectedDefender === d.id;
            return (
              <g
                key={d.id}
                onClick={props.onDefenderTap ? () => props.onDefenderTap!(d.roles, d.id) : undefined}
                style={props.onDefenderTap ? { cursor: "pointer" } : undefined}
              >
                {(isKey || sel) && <circle cx={d.x} cy={sy(d.y)} r={1.5} fill="var(--key)" opacity={0.35} />}
                {props.onDefenderTap && <circle cx={d.x} cy={sy(d.y)} r={1.4} fill="transparent" />}
                <text x={d.x} y={sy(d.y) + 0.45} fontSize={1.3} fontWeight={700} textAnchor="middle" fill={isKey || sel ? "var(--key-ink)" : "var(--def)"}>
                  {d.label}
                </text>
                {look.blitzers.includes(d.id) && <path d={toPath([[0, 0], [0, -2.5]], d.x, d.y - 0.6)} stroke="var(--def)" strokeWidth={0.15} fill="none" markerEnd={`url(#arrow-${uid})`} />}
              </g>
            );
          })}
          {keyDef && props.readKey?.reaction && (
            <path
              d={toPath(reactionVector(props.readKey.reaction, keyDef, data), keyDef.x, keyDef.y - 0.4)}
              stroke="var(--key-ink)"
              strokeWidth={0.3}
              fill="none"
              markerEnd={`url(#arrow-${uid})`}
              className={props.animate ? "draw" : undefined}
            />
          )}
        </g>
      )}

      {!props.routeOnly && lines}
      {!props.routeOnly &&
        data.players.map((p, idx) => {
          const isC = p.id === "C";
          const hl = props.highlight === p.id;
          const tap = props.onPlayerTap && !props.pen ? () => props.onPlayerTap!(p.id) : undefined;
          const r = isLineman(p.id) ? 0.6 : 0.9;
          return (
            <g
              key={`${p.id}:${idx}`}
              onClick={tap}
              onPointerDown={
                props.onPlayerDrag && !props.flip && !props.pen
                  ? (e) => {
                      dragging.current = p.id;
                      (e.target as Element).setPointerCapture?.(e.pointerId);
                    }
                  : undefined
              }
              style={props.pen ? undefined : tap || props.onPlayerDrag ? { cursor: props.onPlayerDrag ? "grab" : "pointer" } : undefined}
            >
              {(tap || props.onPlayerDrag) && <circle cx={p.x} cy={sy(p.y)} r={1.6} fill="transparent" />}
              {props.selected === p.id && <circle cx={p.x} cy={sy(p.y)} r={1.4} fill="none" stroke="var(--brand)" strokeWidth={0.25} />}
              {isC ? (
                <rect x={p.x - r * 0.8} y={sy(p.y) - r * 0.8} width={r * 1.6} height={r * 1.6} fill={hl ? "var(--hl)" : "var(--card)"} stroke="currentColor" strokeWidth={0.18} />
              ) : (
                <circle cx={p.x} cy={sy(p.y)} r={r} fill={hl ? "var(--hl)" : "var(--card)"} stroke="currentColor" strokeWidth={0.18} />
              )}
              {!isLineman(p.id) && (
                <text x={p.x} y={sy(p.y) + 0.38} fontSize={p.id.length > 1 ? 0.8 : 1.05} fontWeight={700} textAnchor="middle" fill={hl ? "var(--hl-ink)" : "currentColor"}>
                  {p.id}
                </text>
              )}
              {props.order?.[p.id] && (
                <g>
                  <circle cx={p.x + 1.1} cy={sy(p.y) - 1.1} r={0.65} fill="var(--accent)" />
                  <text x={p.x + 1.1} y={sy(p.y) - 0.85} fontSize={0.8} fontWeight={700} textAnchor="middle" fill="var(--accent-ink)">
                    {props.order[p.id]}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      {lone}
      {props.overlay && <HandLine pts={props.overlay.pts} pen={props.overlay.pen} color={props.overlay.tone === "ok" ? "var(--ok)" : props.overlay.tone === "bad" ? "var(--bad)" : "var(--brand)"} />}
      {live && live.length > 1 && (
        <path
          d={props.pen?.style === "squiggly" ? zigzag(...live) : toPath(live, 0, 0)}
          stroke="var(--brand)"
          strokeWidth={0.3}
          strokeDasharray={props.pen?.style === "dotted" ? "0.6 0.5" : undefined}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}

export { playSideSign };
