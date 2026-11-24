"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PlaySvg } from "@/components/play-svg";
import type { Naming } from "@/domain/naming";
import { emptyPlay, flipPlay, isLineman, PLAY_TYPES, type PlayData, type Player, type Point } from "@/domain/play";
import { ROUTES } from "@/domain/routes";
import { safeCall } from "@/lib/safe-call";
import { lineupForAction, saveBuiltPlayAction } from "../../actions";

const mk = (id: string, x: number, y: number): Player => ({
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
function blankLineup(n: Naming | null): Player[] {
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
  lineups: Array<{ id: string; name: string }>;
  fromId: string | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<PlayData>(() => props.start ?? { ...emptyPlay(), players: blankLineup(props.naming) });
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const n = props.naming;
  // the call, built from the naming rules
  const [parts, setParts] = useState({ formation: "", dir: "RIGHT", tag: "", motionPlayer: "", motion: "", play: "", playDir: "" });
  const [ownName, setOwnName] = useState(props.start && props.start.name !== "unknown" ? props.start.name : "");
  const built = useMemo(() => {
    const t = (s: string) => s.trim();
    const f = [t(parts.formation), t(parts.formation) ? parts.dir : "", t(parts.tag)].filter(Boolean).join(" ");
    const m = parts.motionPlayer && t(parts.motion) ? `${parts.motionPlayer}-${t(parts.motion)}` : "";
    const p = [t(parts.play), t(parts.play) ? parts.playDir : ""].filter(Boolean).join(" ");
    return [f, m, p].filter(Boolean).join(", ");
  }, [parts]);
  const name = ownName || built;

  // Picking a formation lines the players up the way the playbook draws it.
  const [lineupNote, setLineupNote] = useState<{ text: string; tone: "ok" | "muted" | "warn" } | null>(null);
  const asked = useRef("");
  useEffect(() => {
    const call = { formation: parts.formation.trim(), dir: parts.dir, tag: parts.tag.trim() };
    if (!call.formation) return;
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
        if (++tries < 40) timer = setTimeout(run, 3000);
        else setLineupNote({ text: "That's taking too long. Drag the players into place, or try again in a minute.", tone: "warn" });
        return;
      }
      if (l.kind === "none") return setLineupNote({ text: l.why, tone: "warn" });
      // move the players; anyone with a job keeps it
      setData((d) => ({
        ...d,
        players: l.players.map((np) => {
          const old = d.players.find((o) => o.id === np.id);
          return old ? { ...np, assignment_type: old.assignment_type, route: old.route, block: old.block, path: old.path } : np;
        }),
      }));
      setLineupNote({ text: `Lined up from ${l.from}${l.page ? ` (p${l.page})` : ""}${l.mirrored ? ", flipped" : ""}. Drag anyone who should be somewhere else.`, tone: "ok" });
    };
    const start = setTimeout(run, 400); // wait for typing to settle
    return () => {
      clearTimeout(start);
      if (timer) clearTimeout(timer);
    };
  }, [parts.formation, parts.dir, parts.tag, props.teamId]);

  const me = data.players.find((p) => p.id === sel) ?? null;
  const set = (fn: (d: PlayData) => PlayData) => setData((d) => fn(d));
  const setPlayer = (id: string, patch: Partial<Player>) =>
    set((d) => ({ ...d, players: d.players.map((p) => (p.id === id ? { ...p, ...patch, side: (patch.x ?? p.x) < -1 ? "left" : (patch.x ?? p.x) > 1 ? "right" : "middle" } : p)) }));
  const job: Job = !me ? "none" : me.route ? "route" : me.block ? "block" : me.assignment_type === "carry" ? "carry" : me.assignment_type === "fake" ? "fake" : me.assignment_type === "pass_pro" ? "pass_pro" : "none";

  const setJob = (j: Job) => {
    if (!me) return;
    if (j === "route") setPlayer(me.id, { assignment_type: "route", route: { name: "go", depth_yards: "unknown", break_direction: "unknown", notes: null, path: null }, block: null, path: null });
    else if (j === "block") setPlayer(me.id, { assignment_type: "block", block: { type: "base", target: null, path: [[0, 0], [0, 1.2]] }, route: null, path: null });
    else if (j === "carry" || j === "fake") setPlayer(me.id, { assignment_type: j, path: runPath(1.3, me), route: null, block: null });
    else if (j === "pass_pro") setPlayer(me.id, { assignment_type: "pass_pro", block: { type: "pass_pro", target: null, path: [[0, 0], [0, -1]] }, route: null, path: null });
    else setPlayer(me.id, { assignment_type: "unknown", route: null, block: null, path: null });
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const play: PlayData = {
      ...data,
      name: name || "unknown",
      formation: { ...data.formation, name: [parts.formation, parts.formation ? parts.dir : "", parts.tag].filter(Boolean).join(" ") || data.formation.name, strength: parts.dir === "LEFT" ? "left" : parts.formation ? "right" : data.formation.strength },
      motion: parts.motionPlayer && parts.motion ? { player: parts.motionPlayer, type: "unknown", direction: (data.players.find((p) => p.id === parts.motionPlayer)?.x ?? 0) > 0 ? "left" : "right", timing: "unknown", end: null } : data.motion,
    };
    const r = await safeCall(() => saveBuiltPlayAction(props.teamId, props.playId, play), "Saving");
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    router.push(`/t/${props.teamId}/plays/${r.playId}`);
  };

  const words = (list: Array<{ word: string }> | undefined) => (list ?? []).map((w) => w.word);
  const skill = data.players.filter((p) => !isLineman(p.id));

  return (
    <div className="flex flex-col gap-4 pb-24">
      {!props.playId && props.lineups.length > 0 && (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Start from your formation:
          <select
            className="input w-auto"
            value={props.fromId ?? ""}
            onChange={(e) => router.push(`/t/${props.teamId}/plays/build${e.target.value ? `?from=${e.target.value}` : ""}`)}
          >
            <option value="">Blank 2x2 lineup</option>
            {props.lineups.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <section className="card flex flex-col gap-2 p-3">
        <div className="font-semibold">Name {n ? "from your naming rules" : ""}</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Pick label="Formation" value={parts.formation} options={words(n?.formations)} onChange={(v) => setParts({ ...parts, formation: v })} />
          <Pick label="Direction" value={parts.dir} options={["RIGHT", "LEFT"]} onChange={(v) => setParts({ ...parts, dir: v })} free={false} />
          <Pick label="Tag" value={parts.tag} options={words(n?.formation_tags)} onChange={(v) => setParts({ ...parts, tag: v })} />
          <Pick label="Motion" value={parts.motion} options={words(n?.motions)} onChange={(v) => setParts({ ...parts, motion: v })} />
          <Pick label="Who motions" value={parts.motionPlayer} options={skill.map((p) => p.id)} onChange={(v) => setParts({ ...parts, motionPlayer: v })} free={false} />
          <Pick label="Play" value={parts.play} options={words(n?.plays)} onChange={(v) => setParts({ ...parts, play: v })} />
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
        </div>
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

      <div className="card overflow-hidden p-1">
        <PlaySvg
          data={data}
          selected={sel}
          onPlayerTap={(id) => setSel(id === sel ? null : id)}
          onPlayerDrag={(id, x, y) => setPlayer(id, { x, y: Math.min(y, 0), on_ball: y > -0.75 })}
          className="block w-full select-none"
        />
      </div>
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
                <select className="input w-auto" value={me.route.name} onChange={(e) => setPlayer(me.id, { route: { ...me.route!, name: e.target.value, depth_yards: "unknown" } })}>
                  {ROUTES.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
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
                <button key={label} className="border border-line px-2 py-1" onClick={() => setPlayer(me.id, { block: { ...me.block!, path } })}>
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
        <p className="text-sm text-muted">Tap a player to give him a job. Drag to move him.</p>
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

/** A select of the team's words, plus "type your own" when `free`. */
function Pick({ label, value, options, onChange, free = true }: { label: string; value: string; options: string[]; onChange: (v: string) => void; free?: boolean }) {
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
