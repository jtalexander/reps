"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PlaySvg, type LineRef } from "@/components/play-svg";
import type { Naming } from "@/domain/naming";
import { applyBlocking, frontOk, newBlocking, resolveBlocking, ROLE_LABEL, RULE_LABEL, RULES, schemeForWords, withScheme, type TeamScheme } from "@/domain/blocking";
import { motionKind } from "@/domain/motion-draw";
import { emptyPlay, flipPlay, isLineman, isPassFamily, PLAY_TYPES, type Line, type PlayData, type Player, type Point } from "@/domain/play";
import { ROUTES } from "@/domain/routes";
import { applyStroke, matchRoute, simplify } from "@/domain/sketch";
import { safeCall } from "@/lib/safe-call";
import { drawPlayAction, lineupForAction, nameDrawingAction, readAheadAction, saveBuiltPlayAction } from "../../actions";

export const mk = (id: string, x: number, y: number): Player => ({
  id,
  position: id,
  x,
  y,
  on_ball: y > -0.75,
  side: x < -1 ? "left" : x > 1 ? "right" : "middle",
  split: null,
  assignment_type: "unknown",
  route: null,
  block: null,
  path: null,
  notes: null,
});

/** A 2x2 shotgun lineup, using the team's letters when its naming rules have them. */
export function blankLineup(n: Naming | null): Player[] {
  const has = (l: string) => !n || n.positions.some((p) => p.letter.toUpperCase() === l);
  const pick = (want: string, fallback: string) => (has(want) ? want : fallback);
  return [
    mk(pick("X", "WR"), -14, 0),
    mk(pick("H", "SL"), -7, -1),
    mk("LT", -2.6, 0),
    mk("LG", -1.3, 0),
    mk("C", 0, 0),
    mk("RG", 1.3, 0),
    mk("RT", 2.6, 0),
    mk(pick("Y", "TE"), 7, -1),
    mk(pick("Z", "FL"), 14, 0),
    mk("QB", 0, -5),
    mk(pick("F", "RB"), 1.5, -5),
  ];
}

type Job = "route" | "block" | "carry" | "fake" | "pass_pro" | "none";
const JOBS: Array<[Job, string]> = [
  ["route", "Route"],
  ["block", "Block"],
  ["carry", "Carry"],
  ["fake", "Fake"],
  ["pass_pro", "Pass pro"],
  ["none", "Nothing"],
];

/** A carry or fake path: through the aiming point, then downfield. */
const runPath = (aim: number, from: Player): Point[] => [
  [0, 0],
  [aim - from.x, -from.y],
  [aim - from.x, -from.y + 6],
];

export function PlayBuilder(props: {
  teamId: string;
  naming: Naming | null;
  start: PlayData | null;
  playId: string | null;
  /** the team's blocking schemes and the fronts it sees */
  schemes: TeamScheme[];
  fronts: string[];
}) {
  const router = useRouter();
  const [data, setData] = useState<PlayData>(() => props.start ?? { ...emptyPlay(), players: blankLineup(props.naming) });
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const n = props.naming;
  // the call, built from the naming rules
  const [parts, setPartsRaw] = useState({ shift: "", formation: "", dir: "RIGHT", tag: "", motionPlayer: "", motion: "", play: "", playDir: "" });
  type Parts = typeof parts;
  // parts the coach picked himself (Reps' naming leaves them alone) and parts Reps filled in from a drawing
  const mine = useRef(new Set<keyof Parts>());
  const auto = useRef<Partial<Parts>>({});
  // Undo: every change is a step (a drag is one step); what Reps fills in after a pick undoes with the pick
  const restored = useRef<string | null>(null);
  const merge = useRef(false);
  const setParts = (next: Parts) => {
    for (const k of Object.keys(next) as Array<keyof Parts>) if (next[k] !== parts[k]) mine.current.add(k);
    restored.current = null;
    setPartsRaw(next);
  };
  const [ownName, setOwnName] = useState(props.start && props.start.name !== "unknown" ? props.start.name : "");
  const built = useMemo(() => {
    const t = (s: string) => s.trim();
    // a shift is called in front of the formation it ends in: "DANCE SLOT RIGHT"
    const f = [t(parts.shift), t(parts.formation), t(parts.formation) ? parts.dir : "", t(parts.tag)].filter(Boolean).join(" ");
    const m = parts.motionPlayer && t(parts.motion) ? `${parts.motionPlayer}-${t(parts.motion)}` : "";
    const p = [t(parts.play), t(parts.play) ? parts.playDir : ""].filter(Boolean).join(" ");
    return [f, m, p].filter(Boolean).join(", ");
  }, [parts]);
  const name = ownName || built;

  // Read the playbook's formations ahead of time so picks don't wait (each drawing is read once, ever)
  const [ahead, setAhead] = useState(0);
  const [batch, setBatch] = useState<{ status: string; drawings: number } | null>(null);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const go = async () => {
      const r = await safeCall(() => readAheadAction(props.teamId), "Reading ahead");
      if (stop || !r.ok) return;
      const a = r.ahead;
      setAhead(a.blocked ? 0 : a.left + a.reading);
      setBatch(a.batch ?? null);
      // queue more right away; once all are queued, check back while they're read
      if (!a.blocked && a.left > 0) timer = setTimeout(go, 1500);
      else if (!a.blocked && a.reading > 0) timer = setTimeout(go, 10000);
      else if (a.batch) timer = setTimeout(go, 60000);
    };
    void go();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [props.teamId]);

  // Picking a formation lines the players up the way the playbook draws it.
  const [lineupNote, setLineupNote] = useState<{ text: string; tone: "ok" | "muted" | "warn" } | null>(null);
  const [lineupVersion, setLineupVersion] = useState(0);
  const asked = useRef("");
  useEffect(() => {
    const call = { formation: parts.formation.trim(), dir: parts.dir, tag: parts.tag.trim() };
    if (!call.formation) return;
    if (restored.current === JSON.stringify(parts)) return; // put back by Undo: the players are already where they were
    // Reps named this formation from where the coach put the players: leave them there
    if (auto.current.formation === parts.formation && auto.current.dir === parts.dir && auto.current.tag === parts.tag) return;
    const ask = JSON.stringify(call);
    asked.current = ask;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const r = await safeCall(() => lineupForAction(props.teamId, call), "Lining up");
      if (asked.current !== ask) return; // the coach picked something else meanwhile
      if (!r.ok) return setLineupNote({ text: r.error, tone: "warn" });
      const l = r.lineup;
      if (l.kind === "converting") {
        setLineupNote({ text: `Reading your drawing of ${l.from} (p${l.page}) to line up the players… a few seconds.`, tone: "muted" });
        if (++tries < 60) timer = setTimeout(run, 3000);
        else setLineupNote({ text: "That's taking too long. Drag the players into place, or try again in a minute.", tone: "warn" });
        return;
      }
      if (l.kind === "none") return setLineupNote({ text: l.why, tone: "warn" });
      // move the players; anyone with a job keeps it
      merge.current = true;
      setData((d) => ({
        ...d,
        players: l.players.map((np) => {
          const old = d.players.find((o) => o.id === np.id);
          return old ? { ...np, assignment_type: old.assignment_type, route: old.route, block: old.block, path: old.path, line: old.line } : np;
        }),
      }));
      setLineupVersion((v) => v + 1);
      setLineupNote(
        l.withoutTag
          ? { text: `Your playbook has no drawing with ${l.withoutTag}, so Reps lined up ${l.from}${l.page ? ` (p${l.page})` : ""}${l.mirrored ? ", flipped" : ""}. Drag the players where ${l.withoutTag} puts them.`, tone: "warn" }
          : { text: `Lined up from ${l.from}${l.page ? ` (p${l.page})` : ""}${l.mirrored ? ", flipped" : ""}. Drag anyone who should be somewhere else.`, tone: "ok" },
      );
    };
    const start = setTimeout(run, 400); // wait for typing to settle
    return () => {
      clearTimeout(start);
      if (timer) clearTimeout(timer);
    };
  }, [parts.formation, parts.dir, parts.tag, props.teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Picking the play (and motion) draws everyone's job onto this lineup.
  const [playNote, setPlayNote] = useState<{ lines: string[]; tone: "ok" | "muted" | "warn" } | null>(null);
  const drawAsked = useRef("");
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    if (restored.current === JSON.stringify(parts)) return;
    const call = { ...parts };
    if (auto.current.play === call.play && auto.current.playDir === call.playDir) call.play = "";
    if (auto.current.motion === call.motion && auto.current.motionPlayer === call.motionPlayer) call.motion = "";
    if (!call.play.trim() && !(call.motion.trim() && call.motionPlayer)) return;
    const ask = JSON.stringify([call, lineupVersion]);
    drawAsked.current = ask;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const lineup = dataRef.current.players.map((p) => ({ ...p, assignment_type: "unknown" as const, route: null, block: null, path: null }));
      const r = await safeCall(() => drawPlayAction(props.teamId, call, lineup), "Drawing the play");
      if (drawAsked.current !== ask) return;
      if (!r.ok) return setPlayNote({ lines: [r.error], tone: "warn" });
      const res = r.result;
      if (res.kind === "reading") {
        setPlayNote({ lines: [`Reading your drawing of ${res.from} (p${res.page})… a few seconds.`], tone: "muted" });
        if (++tries < 60) timer = setTimeout(run, 3000);
        else setPlayNote({ lines: ["That's taking too long. Draw the jobs yourself, or try again in a minute."], tone: "warn" });
        return;
      }
      merge.current = true;
      setData((d) => ({
        ...d,
        play_type: res.playType ?? d.play_type,
        motion: call.motion.trim() && call.motionPlayer ? res.motion : (res.motion ?? (res.jobs ? null : d.motion)),
        players: res.jobs
          ? d.players.map((p) => {
              const j = res.jobs!.find((x) => x.id === p.id);
              return j ? { ...p, assignment_type: j.assignment_type, route: j.route, block: j.block, path: j.path, line: null } : { ...p, assignment_type: "unknown", route: null, block: null, path: null, line: null };
            })
          : d.players,
      }));
      setPlayNote({ lines: res.notes, tone: res.missing.length || res.notes.some((n) => n.startsWith("Reps doesn't")) ? "warn" : "ok" });
    };
    const start = setTimeout(run, 400);
    return () => {
      clearTimeout(start);
      if (timer) clearTimeout(timer);
    };
  }, [parts.play, parts.playDir, parts.motion, parts.motionPlayer, lineupVersion, props.teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drawing by hand: a pen, the coach's strokes (with undo), and a name from the team's words
  const [mode, setMode] = useState<"move" | "draw">("move");
  const [pen, setPen] = useState<Line>({ style: "solid", end: "arrow" });
  const typeGuess = useRef<PlayData["play_type"] | null>(null);
  const [drawNote, setDrawNote] = useState<string | null>(null);
  const [sketched, setSketched] = useState(0);
  const [nameNote, setNameNote] = useState<{ lines: string[]; same: { id: string; name: string } | null } | null>(null);
  const routeName = (k: string) => ROUTES.find((r) => r.key === k)?.label ?? k;
  const onDraw = (id: string, pts: Point[]) => {
    const r = applyStroke(data, id, pts, pen, routeName);
    // a run once someone carries the ball, a pass once there are routes (unless the coach picked the type)
    const carry = r.data.players.some((p) => p.assignment_type === "carry");
    const routes = r.data.players.some((p) => p.route);
    if (r.data.play_type === "unknown" || r.data.play_type === typeGuess.current) {
      const t = carry ? "run" : routes ? "pass" : r.data.play_type;
      typeGuess.current = t;
      r.data.play_type = t;
    }
    setData(r.data);
    setSel(id);
    setDrawNote(r.said);
    setSketched((v) => v + 1);
  };
  type Snap = { data: PlayData; parts: Parts; ownName: string };
  const [history, setHistory] = useState<Snap[]>([]);
  const last = useRef<Snap>({ data, parts, ownName });
  const lastAt = useRef(0);
  const restoring = useRef(false);
  useEffect(() => {
    const prev = last.current;
    if (prev.data === data && prev.parts === parts && prev.ownName === ownName) return;
    last.current = { data, parts, ownName };
    if (restoring.current || merge.current) {
      restoring.current = false;
      merge.current = false;
      return;
    }
    const now = Date.now();
    if (now - lastAt.current > 600) setHistory((h) => [...h.slice(-79), prev]);
    lastAt.current = now;
  }, [data, parts, ownName]);
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    restoring.current = true;
    restored.current = JSON.stringify(prev.parts);
    lastAt.current = 0;
    setData(prev.data);
    setPartsRaw(prev.parts);
    setOwnName(prev.ownName);
    setDrawNote(null);
    setLine(null);
  };

  // Tap a line to pick it; Delete (or the button) takes it off
  const [line, setLine] = useState<LineRef | null>(null);
  const lineLabel = (l: LineRef) => {
    const p = data.players.find((x) => x.id === l.id);
    if (l.kind === "motion") return `${l.id}'s motion`;
    if (l.kind === "option") return `${l.id}'s option route`;
    return `${l.id}'s ${p?.route ? "route" : p?.block ? "block" : p?.assignment_type === "carry" ? "run path" : p?.assignment_type === "fake" ? "fake" : "line"}`;
  };
  const deleteLine = (l: LineRef) => {
    setData((d) => {
      if (l.kind === "motion") return { ...d, motion: null };
      return {
        ...d,
        players: d.players.map((p) => {
          if (p.id !== l.id) return p;
          if (l.kind === "option") return p.route ? { ...p, route: { ...p.route, options: (p.route.options ?? []).filter((_, k) => k !== l.index) } } : p;
          return { ...p, assignment_type: "unknown", route: null, block: null, path: null, line: null };
        }),
      };
    });
    setLine(null);
    setDrawNote(null);
  };
  // a dotted line off a route: an option branch, kept relative to where his route starts
  const onDrawOption = (id: string, pts: Point[]) => {
    const p = data.players.find((x) => x.id === id);
    if (!p?.route) return;
    const from: Point = data.motion?.player === id && data.motion.end ? data.motion.end : [p.x, p.y];
    const rel = simplify(pts, 0.35).map(([x, y]) => [Math.round((x - from[0]) * 10) / 10, Math.round((y - from[1]) * 10) / 10] as Point);
    setPlayer(id, { route: { ...p.route, options: [...(p.route.options ?? []), rel] } });
    setSel(id);
    setLine(null);
    setDrawNote(`${id}: option route`);
  };
  const keys = useRef({ undo, deleteLine, line });
  useEffect(() => {
    keys.current = { undo, deleteLine, line };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (typing) return; // the box being typed in has its own undo
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
  useEffect(() => {
    if (!sketched) return;
    let stale = false;
    const t = setTimeout(async () => {
      const r = await safeCall(() => nameDrawingAction(props.teamId, dataRef.current), "Naming the play");
      if (stale || !r.ok) return;
      const g = r.guess;
      const fill: Partial<Parts> = {};
      for (const [k, v] of Object.entries(g.parts) as Array<[keyof Parts, string]>) if (!mine.current.has(k)) fill[k] = v;
      // a part Reps filled in before but can't tell any more is cleared, not left stale
      for (const k of Object.keys(auto.current) as Array<keyof Parts>) if (!(k in g.parts) && !mine.current.has(k)) fill[k] = k === "dir" ? "RIGHT" : "";
      auto.current = { ...auto.current, ...fill };
      if (Object.keys(fill).length) merge.current = true;
      setPartsRaw((cur) => ({ ...cur, ...fill }));
      setNameNote({ lines: g.notes, same: g.same });
    }, 700);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [sketched, props.teamId]);

  const me = data.players.find((p) => p.id === sel) ?? null;
  const set = (fn: (d: PlayData) => PlayData) => setData((d) => fn(d));
  const setPlayer = (id: string, patch: Partial<Player>) =>
    set((d) => ({ ...d, players: d.players.map((p) => (p.id === id ? { ...p, ...patch, side: (patch.x ?? p.x) < -1 ? "left" : (patch.x ?? p.x) > 1 ? "right" : "middle" } : p)) }));
  const job: Job = !me ? "none" : me.route ? "route" : me.block ? "block" : me.assignment_type === "carry" ? "carry" : me.assignment_type === "fake" ? "fake" : me.assignment_type === "pass_pro" ? "pass_pro" : "none";

  // Blocking: a run's scheme, worked out against each front the team sees; the coach fixes any block per front
  const [front, setFront] = useState<string>(() => (props.start?.blocking?.front && props.fronts.includes(props.start.blocking.front) ? props.start.blocking.front : props.fronts[0] ?? "4-3"));
  const schemeMine = useRef(Boolean(props.start?.blocking));
  const [blockNote, setBlockNote] = useState<string | null>(null);
  // the play goes the way the play direction (else the formation direction) says
  const sideOf = (x: Parts) => ((x.playDir || x.dir) === "LEFT" ? ("left" as const) : ("right" as const));
  const side = sideOf(parts);
  const pickScheme = (key: string | null, mine: boolean) => {
    const sc = key ? props.schemes.find((x) => x.key === key) : undefined;
    if (mine) schemeMine.current = true;
    set((d) => ({ ...d, play_type: sc && (d.play_type === "unknown" || isPassFamily(d.play_type)) ? "run" : d.play_type, blocking: sc ? (d.blocking ? withScheme(d.blocking, sc) : newBlocking(sc, side, front)) : null }));
  };
  // picking the play word picks the scheme ("24 POWER" -> Power) until the coach picks one himself
  const playPicked = (next: Parts) => {
    setParts(next);
    if (schemeMine.current) return;
    const key = next.play.trim() ? schemeForWords(next.play, props.schemes) : null;
    if (key !== (data.blocking?.scheme ?? null)) pickScheme(key, false);
  };
  // the blocking always goes the play's way
  const view: PlayData = useMemo(() => (data.blocking && data.blocking.side !== side ? { ...data, blocking: { ...data.blocking, side } } : data), [data, side]);
  const resolved = useMemo(() => (view.blocking && frontOk(front) ? resolveBlocking(view, view.blocking, front) : null), [view, front]);
  const myBlock = resolved && me ? (resolved.blocks.find((b) => b.id === me.id) ?? null) : null;
  const defLabel = (id: string | null) => (id ? (resolved?.defenders.find((d) => d.id === id)?.label ?? id) : "no one");
  const fixBlock = (blocker: string, target: string | null | undefined) =>
    set((d) => {
      if (!d.blocking) return d;
      const forFront = { ...(d.blocking.fixes[front] ?? {}) };
      if (target === undefined) delete forFront[blocker];
      else forFront[blocker] = target;
      return { ...d, blocking: { ...d.blocking, fixes: { ...d.blocking.fixes, [front]: forFront } } };
    });
  const onDefender = (id: string) => {
    if (!myBlock || !me) return setBlockNote("Tap a blocker first, then tap the defender he blocks.");
    fixBlock(me.id, id);
    setBlockNote(`${me.id} blocks ${defLabel(id)} against the ${front}.`);
  };
  const checkFront = (on: boolean) =>
    set((d) => {
      if (!d.blocking) return d;
      const checked = on ? [...new Set([...d.blocking.checked, front])] : d.blocking.checked.filter((f) => f !== front);
      // the main drawing is the first front the coach checks
      const main = checked.includes(d.blocking.front) ? d.blocking.front : (checked[0] ?? d.blocking.front);
      return { ...d, blocking: { ...d.blocking, checked, front: main } };
    });

  const setJob = (j: Job) => {
    if (!me) return;
    const drawn = me.line ? (me.route?.path ?? me.block?.path ?? me.path) : null;
    if (drawn && j !== "none" && j !== "pass_pro") {
      const line = { ...me.line!, end: j === "block" ? ("t" as const) : me.line!.end === "t" ? ("arrow" as const) : me.line!.end, style: j === "fake" ? ("dotted" as const) : me.line!.style === "dotted" && j !== "route" ? ("solid" as const) : me.line!.style };
      const r = j === "route" ? matchRoute(drawn, me) : null;
      if (j === "route") setPlayer(me.id, { assignment_type: "route", route: { name: r?.key ?? "custom", depth_yards: r && r.depth > 0 ? r.depth : "unknown", break_direction: r?.break_direction ?? "unknown", notes: null, path: drawn }, block: null, path: null, line });
      else if (j === "block") setPlayer(me.id, { assignment_type: "block", block: { type: "base", target: null, path: drawn }, route: null, path: null, line });
      else setPlayer(me.id, { assignment_type: j, path: drawn, route: null, block: null, line });
      return;
    }
    if (j === "route") setPlayer(me.id, { assignment_type: "route", route: { name: "go", depth_yards: "unknown", break_direction: "unknown", notes: null, path: null }, block: null, path: null, line: null });
    else if (j === "block") setPlayer(me.id, { assignment_type: "block", block: { type: "base", target: null, path: [[0, 0], [0, 1.2]] }, route: null, path: null, line: null });
    else if (j === "carry" || j === "fake") setPlayer(me.id, { assignment_type: j, path: runPath(1.3, me), route: null, block: null, line: null });
    else if (j === "pass_pro") setPlayer(me.id, { assignment_type: "pass_pro", block: { type: "pass_pro", target: null, path: [[0, 0], [0, -1]] }, route: null, path: null, line: null });
    else setPlayer(me.id, { assignment_type: "unknown", route: null, block: null, path: null, line: null });
    if (j === "none" && data.motion?.player === me.id) set((d) => ({ ...d, motion: null }));
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const play: PlayData = {
      ...view,
      name: name || "unknown",
      formation: { ...data.formation, name: [parts.formation, parts.formation ? parts.dir : "", parts.tag].filter(Boolean).join(" ") || data.formation.name, strength: parts.dir === "LEFT" ? "left" : parts.formation ? "right" : data.formation.strength },
      motion:
        parts.motionPlayer && parts.motion && data.motion?.player !== parts.motionPlayer
          ? { player: parts.motionPlayer, type: "unknown", direction: (data.players.find((p) => p.id === parts.motionPlayer)?.x ?? 0) > 0 ? "left" : "right", timing: "unknown", end: null }
          : data.motion,
    };
    if (play.blocking) {
      const main = frontOk(play.blocking.front) ? play.blocking.front : frontOk(front) ? front : "4-3";
      play.blocking = { ...play.blocking, front: main };
      play.players = applyBlocking(play, play.blocking, main);
    }
    const r = await safeCall(() => saveBuiltPlayAction(props.teamId, props.playId, play), "Saving");
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    router.push(`/t/${props.teamId}/plays/${r.playId}`);
  };

  const words = (list: Array<{ word: string }> | undefined) => (list ?? []).map((w) => w.word);
  // shifts (everyone resets before the snap) get their own pick; motions are one player moving
  const isShift = (w: { word: string; means: string }) => motionKind(w.word, w.means) === "shift";
  const shifts = (n?.motions ?? []).filter(isShift);
  const motions = (n?.motions ?? []).filter((w) => !isShift(w));
  const shiftMeans = shifts.find((w) => w.word === parts.shift.trim())?.means;
  const skill = data.players.filter((p) => !isLineman(p.id));

  return (
    <div className="flex flex-col gap-4 pb-24">
      <section className="card flex flex-col gap-2 p-3">
        <div className="font-semibold">Pick the call {n ? "from your naming rules" : ""}</div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Formation</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {shifts.length > 0 && <Pick label="Shift (optional)" value={parts.shift} options={words(shifts)} onChange={(v) => setParts({ ...parts, shift: v })} />}
          <Pick label="Formation" value={parts.formation} options={words(n?.formations)} onChange={(v) => setParts({ ...parts, formation: v })} />
          <Pick label="Direction" value={parts.dir} options={["RIGHT", "LEFT"]} onChange={(v) => setParts({ ...parts, dir: v })} free={false} />
          <Pick label="Tag" value={parts.tag} options={words(n?.formation_tags)} onChange={(v) => setParts({ ...parts, tag: v })} />
        </div>
        {shiftMeans && (
          <p className="text-xs text-muted">
            {parts.shift.trim()}: {shiftMeans} The players are drawn where they end up{parts.formation.trim() ? ` (${parts.formation.trim()} ${parts.dir})` : ""}.
          </p>
        )}
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Motion</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Pick label="Motion" value={parts.motion} options={words(motions)} onChange={(v) => setParts({ ...parts, motion: v })} />
          <Pick label="Who motions" value={parts.motionPlayer} options={skill.map((p) => p.id)} onChange={(v) => setParts({ ...parts, motionPlayer: v })} free={false} />
        </div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Play</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Pick label="Play" value={parts.play} options={words(n?.plays)} onChange={(v) => playPicked({ ...parts, play: v })} />
          <Pick label="Play direction" value={parts.playDir} options={["RIGHT", "LEFT"]} onChange={(v) => setParts({ ...parts, playDir: v })} free={false} />
          <label className="flex flex-col gap-1 text-xs">
            Play type
            <select className="input" value={String(data.play_type)} onChange={(e) => set((d) => ({ ...d, play_type: e.target.value as PlayData["play_type"] }))}>
              <option value="unknown">Formation only</option>
              {PLAY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Blocking scheme
            <select className="input" value={data.blocking?.scheme ?? ""} onChange={(e) => pickScheme(e.target.value, true)}>
              <option value="">—</option>
              {props.schemes.map((sc) => (
                <option key={sc.key} value={sc.key}>
                  {sc.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {parts.motion.trim() && !parts.motionPlayer && <p className="text-sm text-warn">Pick who motions, and Reps draws the {parts.motion.trim()} motion.</p>}
        {playNote && (
          <div className={`flex flex-col text-sm ${playNote.tone === "ok" ? "text-ok" : playNote.tone === "warn" ? "text-warn" : "text-muted"}`} aria-live="polite">
            {playNote.lines.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
        )}
        {nameNote && (
          <div className="flex flex-col text-sm text-muted" aria-live="polite">
            {nameNote.same && (
              <span className="text-ok">
                This looks like{" "}
                <a className="underline" href={`/t/${props.teamId}/plays/${nameNote.same.id}`}>
                  {nameNote.same.name}
                </a>{" "}
                from your playbook.
              </span>
            )}
            {nameNote.lines.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
        )}
        {batch && (
          <p className="text-xs text-muted" aria-live="polite">
            Reps is reading all {batch.drawings} drawings in your playbook behind the scenes ({batch.status === "importing" ? "almost done" : "usually under an hour"}). Until then, a formation or play Reps hasn&apos;t read yet takes about 30 seconds the first time.
          </p>
        )}
        {ahead > 0 && (
          <p className="text-xs text-muted" aria-live="polite">
            Reps is reading your playbook&apos;s formations ahead of time ({ahead} to go), so picking one is instant once it&apos;s read. You can keep working.
          </p>
        )}
        {lineupNote && (
          <p className={`text-sm ${lineupNote.tone === "ok" ? "text-ok" : lineupNote.tone === "warn" ? "text-warn" : "text-muted"}`} aria-live="polite">
            {lineupNote.text}
          </p>
        )}
        <label className="flex flex-col gap-1 text-xs">
          The play&apos;s name {built && !ownName ? "(built from the parts above; type to change it)" : ""}
          <input className="input text-base font-semibold" value={ownName || built} onChange={(e) => setOwnName(e.target.value)} placeholder="e.g. SPREAD RIGHT ZIP, VEER RIGHT" />
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
            <>
              <PenGroup
                label="Line"
                value={pen.style}
                onChange={(style) => setPen({ style, end: style === "squiggly" ? "none" : pen.end === "none" && pen.style === "squiggly" ? "arrow" : pen.end })}
                options={[
                  ["solid", "Solid", <path key="s" d="M2 6 H26" />],
                  ["dotted", "Dotted", <path key="d" d="M2 6 H26" strokeDasharray="3 2.5" />],
                  ["squiggly", "Squiggly (motion)", <path key="z" d="M2 6 L5 3 L8 9 L11 3 L14 9 L17 3 L20 9 L23 3 L26 6" />],
                ]}
              />
              <PenGroup
                label="End"
                value={pen.end}
                disabled={pen.style === "squiggly"}
                onChange={(end) => setPen({ ...pen, end })}
                options={[
                  ["arrow", "Arrow", <path key="a" d="M2 6 H22 M18 2 L24 6 L18 10" />],
                  ["t", "T (block)", <path key="t" d="M2 6 H22 M22 1.5 V10.5" strokeWidth={2} />],
                  ["none", "None", <path key="n" d="M2 6 H24" />],
                ]}
              />
            </>
          )}
          <button className="ml-auto border border-line px-2 py-1 text-sm disabled:opacity-40" onClick={undo} disabled={!history.length} title="Undo (Ctrl+Z)">
            Undo
          </button>
        </div>
        {mode === "draw" && (
          <p className="text-xs text-muted">
            Touch a player and draw his line with your finger or mouse. Squiggly is motion before the snap. End in a T for a block. Draw from where his motion ends for what he does after it. For an option route, pick Dotted and draw from the spot on his route where he reads it. Tap any line to delete it.
            {drawNote ? <span className="text-ok"> Got it: {drawNote}.</span> : null}
          </p>
        )}
        {data.blocking && (
          <div className="flex flex-col gap-1" aria-live="polite">
            <div className="flex flex-wrap items-center gap-1 text-sm" role="group" aria-label="Blocking against">
              <span className="text-xs text-muted">{data.blocking.name} against:</span>
              {props.fronts.map((f) => (
                <button key={f} onClick={() => setFront(f)} className={`px-2 py-1 ${front === f ? "bg-brand text-brand-ink" : "border border-line"}`} aria-pressed={front === f}>
                  {f}
                  {data.blocking!.checked.includes(f) ? " ✓" : ""}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={data.blocking.checked.includes(front)} onChange={(e) => checkFront(e.target.checked)} />
              The blocking against the {front} is right (players are quizzed on the fronts you check)
            </label>
            <p className="text-xs text-muted">
              {blockNote ?? "Tap a lineman to see his rule, then tap a defender to change who he blocks against this front."}{" "}
              <a className="underline" href={`/t/${props.teamId}/plays/blocking?scheme=${data.blocking.scheme}`}>
                Change {data.blocking.name}&apos;s rules for every play
              </a>
            </p>
          </div>
        )}
        <div className="overflow-hidden">
          <PlaySvg
            data={view}
            blockFront={data.blocking ? front : null}
            onBlockDefenderTap={data.blocking ? onDefender : undefined}
            markDefender={myBlock?.target ?? null}
            selected={sel}
            onPlayerTap={(id) => {
              setSel(id === sel ? null : id);
              setLine(null);
            }}
            onLineTap={(l) => setLine(line && line.kind === l.kind && line.id === l.id && line.index === l.index ? null : l)}
            selectedLine={line}
            onDrawOption={onDrawOption}
            onPlayerDrag={mode === "move" ? (id, x, y) => setPlayer(id, { x, y: Math.min(y, 0), on_ball: y > -0.75 }) : undefined}
            pen={mode === "draw" ? pen : null}
            onDraw={onDraw}
            className="block w-full select-none"
          />
        </div>
        {line && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2 text-sm" aria-live="polite">
            <span className="font-semibold">{lineLabel(line)}</span>
            <button className="btn btn-outline min-h-9 px-3 text-sm" onClick={() => deleteLine(line)}>
              Delete line
            </button>
            <button className="text-muted underline" onClick={() => setLine(null)}>
              Keep it
            </button>
          </div>
        )}
      </section>
      <div className="flex flex-wrap gap-3 text-sm">
        <button className="underline" onClick={() => set((d) => flipPlay(d))}>
          Flip left/right
        </button>
        <button
          className="underline"
          onClick={() => {
            const id = prompt("Letter for the new player (e.g. W, U)")?.trim().toUpperCase();
            if (!id || data.players.some((p) => p.id === id)) return;
            set((d) => ({ ...d, players: [...d.players, mk(id, 4, -3)] }));
            setSel(id);
          }}
        >
          Add a player
        </button>
      </div>

      {me ? (
        <section className="card flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              Player
              <input
                className="input w-20 font-bold"
                value={me.id}
                onChange={(e) => {
                  const id = e.target.value.toUpperCase().slice(0, 4);
                  if (!id || data.players.some((p) => p.id === id && p !== me)) return;
                  set((d) => ({ ...d, players: d.players.map((p) => (p.id === me.id ? { ...p, id, position: id } : p)) }));
                  setSel(id);
                }}
              />
            </label>
            <button
              className="text-sm text-muted underline"
              onClick={() => {
                set((d) => ({ ...d, players: d.players.filter((p) => p.id !== me.id) }));
                setSel(null);
              }}
            >
              Remove player
            </button>
          </div>
          {myBlock && data.blocking && (
            <div className="flex flex-col gap-2 rounded border border-line p-2 text-sm">
              <div>
                <span className="font-semibold">{ROLE_LABEL[myBlock.role]}</span> against the {front}: blocks <span className="font-semibold">{defLabel(myBlock.target)}</span>
                {myBlock.fixed ? " (your fix)" : ""}. Tap a defender on the field to change it.
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs">
                  His rule on this play
                  <select
                    className="input w-auto"
                    value={myBlock.rule}
                    onChange={(e) => set((d) => (d.blocking ? { ...d, blocking: { ...d.blocking, rules: { ...d.blocking.rules, [myBlock.role]: e.target.value } } } : d))}
                  >
                    {RULES.map((r) => (
                      <option key={r} value={r}>
                        {RULE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </label>
                {myBlock.fixed && (
                  <button className="btn btn-outline min-h-9 px-3 text-sm" onClick={() => fixBlock(myBlock.id, undefined)}>
                    Back to the rule
                  </button>
                )}
                {myBlock.target && (
                  <button className="text-muted underline" onClick={() => fixBlock(myBlock.id, null)}>
                    He blocks no one
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {JOBS.map(([j, label]) => (
              <button key={j} onClick={() => setJob(j)} className={`px-3 py-1.5 text-sm ${job === j ? "bg-brand text-brand-ink" : "border border-line"}`}>
                {label}
              </button>
            ))}
          </div>
          {job === "route" && me.route && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs">
                Route
                <select className="input w-auto" value={me.route.name} onChange={(e) => setPlayer(me.id, { route: { ...me.route!, name: e.target.value, depth_yards: me.route!.path ? me.route!.depth_yards : "unknown" } })}>
                  {me.route.name === "custom" && <option value="custom">His own route</option>}
                  {ROUTES.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              {me.line && me.route.path ? (
                <span className="pb-2 text-xs text-muted">Drawn by hand. Pick the route name if Reps got it wrong; your drawing stays.</span>
              ) : (
              <>
              <label className="flex flex-col gap-1 text-xs">
                Depth (yards)
                <input
                  className="input w-20"
                  inputMode="numeric"
                  placeholder={String(ROUTES.find((r) => r.key === me.route!.name)?.depth ?? "")}
                  value={typeof me.route.depth_yards === "number" ? me.route.depth_yards : ""}
                  onChange={(e) => setPlayer(me.id, { route: { ...me.route!, depth_yards: e.target.value ? Number(e.target.value) : "unknown" } })}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={me.route.break_direction === "in" || me.route.break_direction === "out"}
                  onChange={(e) => {
                    const def = ROUTES.find((r) => r.key === me.route!.name);
                    const flipped = def?.breaks === "in" ? "out" : def?.breaks === "out" ? "in" : "unknown";
                    setPlayer(me.id, { route: { ...me.route!, break_direction: e.target.checked ? flipped : "unknown" } });
                  }}
                />
                Break the other way
              </label>
              </>
              )}
            </div>
          )}
          {job === "block" && me.block && (
            <div className="flex flex-wrap gap-1 text-sm">
              {(
                [
                  ["Left", [[0, 0], [-0.9, 1.1]]],
                  ["Straight", [[0, 0], [0, 1.2]]],
                  ["Right", [[0, 0], [0.9, 1.1]]],
                  ["Climb left", [[0, 0], [-0.8, 1], [-1.5, 4]]],
                  ["Climb right", [[0, 0], [0.8, 1], [1.5, 4]]],
                  ["Pull right", [[0, 0], [0, -1], [5, -1], [6, 1]]],
                  ["Pull left", [[0, 0], [0, -1], [-5, -1], [-6, 1]]],
                ] as Array<[string, Point[]]>
              ).map(([label, path]) => (
                <button key={label} className="border border-line px-2 py-1" onClick={() => setPlayer(me.id, { block: { ...me.block!, path }, line: null })}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {(job === "carry" || job === "fake") && (
            <label className="flex flex-col gap-1 text-xs">
              Aiming point (yards from the ball: left −, right +)
              <input
                type="range"
                min={-12}
                max={12}
                step={0.5}
                defaultValue={me.path?.[1] ? me.path[1][0] + me.x : 1.3}
                onChange={(e) => setPlayer(me.id, { path: runPath(Number(e.target.value), me) })}
              />
            </label>
          )}
        </section>
      ) : (
        <p className="text-sm text-muted">{mode === "draw" ? "Touch a player and draw his line, or tap him to pick his job." : "Tap a player to give him a job. Drag to move him. Tap a line to delete it."}</p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <button className="btn btn-primary" disabled={busy || !name} onClick={save}>
            {busy ? "Saving…" : props.playId ? "Save changes" : "Save play"}
          </button>
          <span className="text-sm text-muted">{msg ?? (name ? name : "Give the play a name first.")}</span>
        </div>
      </div>
    </div>
  );
}

/** A row of pen buttons, each a little picture of the line. */
export function PenGroup<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: Array<[T, string, React.ReactNode]>; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className={`flex items-center gap-1 text-xs ${disabled ? "opacity-40" : ""}`} role="group" aria-label={label}>
      <span className="text-muted">{label}</span>
      {options.map(([v, name, icon]) => (
        <button
          key={v}
          title={name}
          aria-label={name}
          aria-pressed={value === v}
          disabled={disabled}
          onClick={() => onChange(v)}
          className={`rounded border px-1.5 py-1 ${value === v ? "border-brand bg-brand text-brand-ink" : "border-line"}`}
        >
          <svg width="28" height="12" viewBox="0 0 28 12" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {icon}
          </svg>
        </button>
      ))}
    </div>
  );
}

/** A select of the team's words, plus "type your own" when `free`. */
export function Pick({ label, value, options, onChange, free = true }: { label: string; value: string; options: string[]; onChange: (v: string) => void; free?: boolean }) {
  const own = free && value !== "" && !options.includes(value);
  return (
    <label className="flex flex-col gap-1 text-xs">
      {label}
      {own ? (
        <input className="input" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} onBlur={(e) => !e.target.value && onChange("")} autoFocus />
      ) : (
        <select className="input" value={value} onChange={(e) => onChange(e.target.value === "__own" ? " " : e.target.value)}>
          <option value="">—</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          {free && <option value="__own">Type my own…</option>}
        </select>
      )}
    </label>
  );
}
