"use client";
/**
 * Coach review for one play: the original crop, the redrawn diagram, and
 * every field, with the "to finish this play" checklist on top. Built for a
 * phone: tap receivers on the diagram to set the progression, tap a
 * defender to set the read key.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { PlaySvg } from "@/components/play-svg";
import { COVERAGE_LABEL, READ_KEYS, REACTIONS, type Front } from "@/domain/defense";
import {
  ASSIGNMENT_TYPES,
  BLOCK_TYPES,
  COVERAGES,
  MOTION_TYPES,
  OPTION_TYPES,
  PLAY_TYPES,
  QB_DROPS,
  UNKNOWN,
  isPassFamily,
  needsOptionRules,
  setPath,
  skillPlayers,
  type PlayData,
} from "@/domain/play";
import { readiness, type Level } from "@/domain/readiness";
import { ROUTES } from "@/domain/routes";
import { term, title, type Terms } from "@/domain/terms";
import { approveAction, archivePlayAction, savePlayAction, setConceptAction, unapproveAction } from "../../actions";

type Tap = "none" | "progression" | "read_key";

export function PlayReview(props: {
  teamId: string;
  playId: string;
  level: Level;
  initial: PlayData;
  status: string;
  cropUrl: string | null;
  sourceText: string;
  concepts: Array<{ key: string; name: string; kind: string }>;
  terms: Terms;
  position: { index: number; total: number };
  nextId: string | null;
  /** converted from a Teach drawing: approve once the drawing matches; reads come from Teach */
  converted?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<PlayData>(props.initial);
  const [status, setStatus] = useState(props.status);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [tap, setTap] = useState<Tap>("none");
  const [flip, setFlip] = useState(false);
  const [showCrop, setShowCrop] = useState(true);
  const [front, setFront] = useState<Front>("4-3");
  const [coverage, setCoverage] = useState<(typeof COVERAGES)[number] | "">("");

  const r = useMemo(() => readiness(data, props.level), [data, props.level]);
  const t = data.play_type;
  const passy = isPassFamily(t as PlayData["play_type"]);
  const optiony = needsOptionRules(t as PlayData["play_type"]);
  const runny = t === "run" || t === "option" || t === "rpo";
  const skill = skillPlayers(data);
  const order = Object.fromEntries((data.pass_details?.progression ?? []).map((s, i) => [s.player, i + 1]));

  /** Set a field; the coach's own value is no longer a suggestion or low-confidence. */
  function set(path: string, value: unknown) {
    setData((d) => {
      let next = setPath(d, path, value);
      const clear = (list: string[]) => list.filter((p) => p !== path && !p.startsWith(path + "."));
      const fc = { ...next.field_confidence };
      for (const k of Object.keys(fc)) if (k === path || k.startsWith(path + ".")) delete fc[k];
      next = { ...next, suggested: clear(next.suggested), from_concept: clear(next.from_concept), field_confidence: fc };
      return next;
    });
    setDirty(true);
  }
  function confirm(path: string) {
    setData((d) => ({ ...d, suggested: d.suggested.filter((p) => p !== path) }));
    setDirty(true);
  }

  function ensurePass() {
    if (data.pass_details) return;
    set("pass_details", {
      concept_key: null,
      concept_name: UNKNOWN,
      protection: UNKNOWN,
      qb_drop: UNKNOWN,
      presnap_read: UNKNOWN,
      progression: [],
      hot_or_sight_adjustment: null,
      vs_coverage: { cover_0: null, cover_1: null, cover_2: null, cover_3: null, cover_4: null },
    });
  }
  function ensureRun() {
    if (!data.run_details) set("run_details", { point_of_attack: UNKNOWN, scheme: UNKNOWN, ball_carrier: UNKNOWN });
  }
  function ensureOption() {
    if (!data.option_details)
      set("option_details", { option_type: UNKNOWN, read_key: UNKNOWN, give_rule: UNKNOWN, keep_rule: UNKNOWN, pitch_or_pass_rule: null, decisions: [] });
  }

  function onPlayerTap(id: string) {
    if (tap !== "progression") return;
    ensurePass();
    const prog = data.pass_details?.progression ?? [];
    const exists = prog.find((s) => s.player === id);
    set("pass_details.progression", exists ? prog.filter((s) => s.player !== id) : [...prog, { player: id, trigger: "" }]);
  }
  function onDefenderTap(roles: string[]) {
    if (tap !== "read_key") return;
    const key = roles.find((x) => READ_KEYS.some((k) => k.key === x)) ?? roles[0];
    if (!key) return;
    ensureOption();
    set("option_details.read_key", key);
    setTap("none");
  }

  async function save(): Promise<boolean> {
    const res = await savePlayAction(props.teamId, props.playId, data);
    if (!res.ok) {
      setMsg({ kind: "bad", text: res.error });
      return false;
    }
    setStatus(res.status);
    setDirty(false);
    setMsg({ kind: "ok", text: "Saved." });
    return true;
  }

  const flag = (path: string) => {
    const c = data.field_confidence[path];
    const s = data.suggested.includes(path);
    const miss = r.missing.some((m) => m.path === path);
    return (
      <span className="ml-1 inline-flex gap-1 align-middle">
        {miss && <span className="rounded bg-warn-bg px-1.5 text-[10px] font-semibold text-warn uppercase">needed</span>}
        {c && c !== "high" && <span className="rounded bg-bad-bg px-1.5 text-[10px] font-semibold text-bad uppercase">AI {c}</span>}
        {s && (
          <button type="button" onClick={() => confirm(path)} className="rounded bg-suggest-bg px-1.5 text-[10px] font-semibold text-suggest uppercase" title="From the concept library. Tap to confirm.">
            suggested · ok
          </button>
        )}
      </span>
    );
  };
  const fieldClass = (path: string) => {
    const c = data.field_confidence[path];
    if (r.missing.some((m) => m.path === path)) return "input border-warn";
    if (c === "low") return "input border-bad";
    if (data.suggested.includes(path)) return "input border-suggest";
    return "input";
  };
  const txt = (v: unknown) => (v == null || v === UNKNOWN ? "" : String(v));
  const orUnknown = (v: string) => (v.trim() ? v : UNKNOWN);

  return (
    <div className="flex flex-col gap-4 pb-28">
      <div className="flex items-center justify-between gap-2 text-sm">
        <Link href={`/t/${props.teamId}/plays`} className="text-muted underline">
          Playbook
        </Link>
        <span className="text-muted">
          Play {props.position.index} of {props.position.total}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-4xl">{data.name === UNKNOWN ? "Unnamed play" : data.name}</h1>
        <StatusChip status={status} dirty={dirty} />
      </div>

      {/* checklist */}
      {props.converted ? (
        <div className={`p-3 text-sm ${status === "approved" && !dirty ? "bg-ok-bg text-ok" : "border border-line"}`}>
          <strong>{status === "approved" && !dirty ? "Approved." : "Converted from your drawing."}</strong> Check that every player, route and block matches your page, fix
          anything off, then approve. Reads and coaching points come from the topic&apos;s lessons in Teach.
        </div>
      ) : r.missing.length > 0 ? (
        <div className="rounded-xl border border-warn/40 bg-warn-bg p-3">
          <p className="text-sm font-semibold text-warn">To finish this play ({r.missing.length})</p>
          <ul className="mt-1 list-inside list-disc text-sm">
            {r.missing.map((m) => (
              <li key={m.path}>{m.label}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl bg-ok-bg p-3 text-sm text-ok">
          <strong>{status === "approved" && !dirty ? "Approved — this play is in quizzes." : "Ready to approve."}</strong> {r.qbPlay ? (r.qbReady ? "QB reads are complete." : "") : ""}
          {data.suggested.length > 0 && ` ${data.suggested.length} suggested value${data.suggested.length > 1 ? "s" : ""} from the concept library will be confirmed when you approve.`}
        </div>
      )}
      {r.lowConfidence.length > 0 && (
        <p className="text-xs text-muted">Red outlines: the AI wasn&apos;t sure. Check those first.</p>
      )}

      {/* diagrams */}
      <div className="grid gap-3 lg:grid-cols-2">
        {props.cropUrl && (
          <div className="card overflow-hidden">
            <button className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-muted uppercase" onClick={() => setShowCrop((s) => !s)}>
              Original {showCrop ? "▲" : "▼"}
            </button>
            {showCrop && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.cropUrl} alt="Original play from the PDF" className="block w-full" />
            )}
          </div>
        )}
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
            <span className="font-semibold text-muted uppercase">Redrawn</span>
            <label className="ml-auto flex items-center gap-1">
              <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} /> Flip
            </label>
            <select className="rounded border border-line bg-card px-1 py-0.5" value={coverage} onChange={(e) => setCoverage(e.target.value as typeof coverage)}>
              <option value="">No defense</option>
              {COVERAGES.map((c) => (
                <option key={c} value={c}>
                  vs {COVERAGE_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          {tap !== "none" && (
            <div className="flex items-center justify-between bg-accent px-3 py-2 text-sm font-semibold text-accent-ink">
              {tap === "progression" ? "Tap receivers in read order (tap again to remove)" : "Tap the defender the QB reads"}
              <button className="underline" onClick={() => setTap("none")}>
                Done
              </button>
            </div>
          )}
          <PlaySvg
            data={data}
            flip={flip}
            coverage={tap === "read_key" ? "cover_3" : coverage || null}
            front={front}
            readKey={data.option_details && data.option_details.read_key !== UNKNOWN ? { key: data.option_details.read_key } : null}
            order={order}
            onPlayerTap={tap === "progression" ? onPlayerTap : undefined}
            onDefenderTap={tap === "read_key" ? onDefenderTap : undefined}
            fit
            className="block w-full"
          />
        </div>
      </div>
      {props.sourceText && <p className="text-xs whitespace-pre-line text-muted">Text on the card: {props.sourceText}</p>}

      {/* basics */}
      <Section title="Basics">
        <Field label="Play name" extra={flag("name")}>
          <input className={fieldClass("name")} value={txt(data.name)} onChange={(e) => set("name", orUnknown(e.target.value))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Play type" extra={flag("play_type")}>
            <select className={fieldClass("play_type")} value={String(data.play_type)} onChange={(e) => set("play_type", e.target.value)}>
              <option value={UNKNOWN}>—</option>
              {PLAY_TYPES.map((x) => (
                <option key={x} value={x}>
                  {title(x)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Concept">
            <select
              className="input"
              value={data.concept_key ?? ""}
              onChange={(e) =>
                start(async () => {
                  if (dirty && !(await save())) return;
                  const res = await setConceptAction(props.teamId, props.playId, e.target.value || null);
                  if (res.ok) {
                    setData(res.data);
                    setStatus(res.status);
                    setDirty(false);
                  } else setMsg({ kind: "bad", text: res.error });
                })
              }
            >
              <option value="">None</option>
              {props.concepts.map((c) => (
                <option key={c.key} value={c.key}>
                  {term(props.terms, "concepts", c.key) || c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Formation" extra={flag("formation.name")}>
            <input className={fieldClass("formation.name")} value={txt(data.formation.name)} onChange={(e) => set("formation.name", orUnknown(e.target.value))} />
          </Field>
          <Field label="Strength" extra={flag("formation.strength")}>
            <select className={fieldClass("formation.strength")} value={String(data.formation.strength)} onChange={(e) => set("formation.strength", e.target.value)}>
              <option value={UNKNOWN}>—</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="balanced">Balanced</option>
            </select>
          </Field>
          <Field label="Personnel" extra={flag("formation.personnel")}>
            <input className={fieldClass("formation.personnel")} inputMode="numeric" value={txt(data.formation.personnel)} onChange={(e) => set("formation.personnel", orUnknown(e.target.value))} placeholder="11" />
          </Field>
          <Field label="Backfield" extra={flag("formation.backfield_alignment")}>
            <input className={fieldClass("formation.backfield_alignment")} value={txt(data.formation.backfield_alignment)} onChange={(e) => set("formation.backfield_alignment", orUnknown(e.target.value))} placeholder="Gun, RB right" />
          </Field>
        </div>
      </Section>

      {/* motion */}
      <Section title="Motion">
        {data.motion ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Who" extra={flag("motion.player")}>
              <select className="input" value={data.motion.player} onChange={(e) => set("motion.player", e.target.value)}>
                {skill.map((p) => (
                  <option key={p.id} value={p.id}>
                    {term(props.terms, "positions", p.id)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type" extra={flag("motion.type")}>
              <select className={fieldClass("motion.type")} value={String(data.motion.type)} onChange={(e) => set("motion.type", e.target.value)}>
                <option value={UNKNOWN}>—</option>
                {MOTION_TYPES.map((x) => (
                  <option key={x} value={x}>
                    {title(x)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Direction">
              <select className="input" value={String(data.motion.direction)} onChange={(e) => set("motion.direction", e.target.value)}>
                <option value={UNKNOWN}>—</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </Field>
            <Field label="Snap">
              <select className="input" value={String(data.motion.timing)} onChange={(e) => set("motion.timing", e.target.value)}>
                <option value={UNKNOWN}>—</option>
                <option value="at_snap">Snap during motion</option>
                <option value="set">Motion, then set</option>
              </select>
            </Field>
            <button className="col-span-2 text-left text-sm text-muted underline" onClick={() => set("motion", null)}>
              Remove motion
            </button>
          </div>
        ) : (
          <button
            className="btn btn-ghost self-start"
            onClick={() => set("motion", { player: skill.find((p) => p.id !== "QB")?.id ?? "X", type: UNKNOWN, direction: UNKNOWN, timing: UNKNOWN, end: null })}
          >
            + Add motion
          </button>
        )}
      </Section>

      {/* players */}
      <Section title="Assignments">
        <ul className="flex flex-col divide-y divide-line">
          {data.players.map((p, i) => {
            if (!skill.includes(p)) return null;
            const base = `players.${i}`;
            return (
              <li key={p.id + i} className="flex flex-col gap-2 py-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-brand px-2 text-sm font-bold text-brand-ink">{p.id}</span>
                  <select className={`${fieldClass(`${base}.assignment_type`)} flex-1`} value={String(p.assignment_type)} onChange={(e) => {
                    const v = e.target.value;
                    set(`${base}.assignment_type`, v);
                    if (v === "route" && !p.route) set(`${base}.route`, { name: UNKNOWN, depth_yards: UNKNOWN, break_direction: UNKNOWN, notes: null, path: null });
                    if ((v === "block" || v === "pass_pro" || v === "lead") && !p.block) set(`${base}.block`, { type: v === "pass_pro" ? "pass_pro" : "base", target: null, path: null });
                  }}>
                    <option value={UNKNOWN}>Job?</option>
                    {ASSIGNMENT_TYPES.map((x) => (
                      <option key={x} value={x}>
                        {title(x)}
                      </option>
                    ))}
                  </select>
                  {flag(`${base}.assignment_type`)}
                </div>
                {p.assignment_type === "route" && (
                  <div className="grid grid-cols-3 gap-2 pl-10">
                    <select
                      className={`${fieldClass(`${base}.route.name`)} col-span-3 sm:col-span-1`}
                      value={p.route?.name ?? UNKNOWN}
                      onChange={(e) => {
                        set(`${base}.route.name`, e.target.value);
                        set(`${base}.route.path`, null); // redraw from the route tree
                      }}
                    >
                      <option value={UNKNOWN}>Route?</option>
                      {ROUTES.map((x) => (
                        <option key={x.key} value={x.key}>
                          {term(props.terms, "routes", x.key)}
                        </option>
                      ))}
                      {p.route && !ROUTES.some((x) => x.key === p.route!.name) && p.route.name !== UNKNOWN && <option value={p.route.name}>{p.route.name}</option>}
                    </select>
                    <input
                      className={fieldClass(`${base}.route.depth_yards`)}
                      inputMode="numeric"
                      placeholder="yds"
                      value={typeof p.route?.depth_yards === "number" ? p.route.depth_yards : ""}
                      onChange={(e) => set(`${base}.route.depth_yards`, e.target.value === "" ? UNKNOWN : Number(e.target.value))}
                    />
                    <select className="input" value={String(p.route?.break_direction ?? UNKNOWN)} onChange={(e) => { set(`${base}.route.break_direction`, e.target.value); set(`${base}.route.path`, null); }}>
                      <option value={UNKNOWN}>Break</option>
                      <option value="in">In</option>
                      <option value="out">Out</option>
                      <option value="none">None</option>
                    </select>
                    {flag(`${base}.route.name`)}
                  </div>
                )}
                {(p.assignment_type === "block" || p.assignment_type === "pass_pro" || p.assignment_type === "lead") && (
                  <div className="grid grid-cols-2 gap-2 pl-10">
                    <select className="input" value={p.block?.type ?? "base"} onChange={(e) => set(`${base}.block.type`, e.target.value)}>
                      {BLOCK_TYPES.map((x) => (
                        <option key={x} value={x}>
                          {title(x)}
                        </option>
                      ))}
                    </select>
                    <input className="input" placeholder="Who (e.g. DE, Mike)" value={p.block?.target ?? ""} onChange={(e) => set(`${base}.block.target`, e.target.value || null)} />
                  </div>
                )}
                <input className="input ml-10 w-auto text-sm" placeholder="Notes for this player (optional)" value={p.notes ?? ""} onChange={(e) => set(`${base}.notes`, e.target.value || null)} />
              </li>
            );
          })}
        </ul>
      </Section>

      {/* run */}
      {runny && (
        <Section title="Run">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Point of attack" extra={flag("run_details.point_of_attack")}>
              <input className={fieldClass("run_details.point_of_attack")} value={txt(data.run_details?.point_of_attack)} onFocus={ensureRun} onChange={(e) => set("run_details.point_of_attack", orUnknown(e.target.value))} placeholder="4 hole / B gap" />
            </Field>
            <Field label="Ball carrier" extra={flag("run_details.ball_carrier")}>
              <select className={fieldClass("run_details.ball_carrier")} value={txt(data.run_details?.ball_carrier) || UNKNOWN} onFocus={ensureRun} onChange={(e) => set("run_details.ball_carrier", e.target.value)}>
                <option value={UNKNOWN}>—</option>
                {skill.map((p) => (
                  <option key={p.id} value={p.id}>
                    {term(props.terms, "positions", p.id)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Scheme" extra={flag("run_details.scheme")}>
              <input className={fieldClass("run_details.scheme")} value={txt(data.run_details?.scheme)} onFocus={ensureRun} onChange={(e) => set("run_details.scheme", orUnknown(e.target.value))} placeholder="inside zone, power, counter…" />
            </Field>
          </div>
        </Section>
      )}

      {/* option */}
      {optiony && (
        <Section title={t === "rpo" ? "RPO read" : "Option read"}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Option type">
              <select className="input" value={String(data.option_details?.option_type ?? UNKNOWN)} onFocus={ensureOption} onChange={(e) => set("option_details.option_type", e.target.value)}>
                <option value={UNKNOWN}>—</option>
                {OPTION_TYPES.map((x) => (
                  <option key={x} value={x}>
                    {title(x)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Read key" extra={flag("option_details.read_key")}>
              <div className="flex gap-2">
                <select className={`${fieldClass("option_details.read_key")} flex-1`} value={txt(data.option_details?.read_key) || UNKNOWN} onFocus={ensureOption} onChange={(e) => set("option_details.read_key", e.target.value)}>
                  <option value={UNKNOWN}>—</option>
                  {READ_KEYS.map((k) => (
                    <option key={k.key} value={k.key}>
                      {term(props.terms, "read_keys", k.key)}
                    </option>
                  ))}
                </select>
                <button className="btn btn-ghost px-3" onClick={() => { ensureOption(); setTap("read_key"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                  Tap
                </button>
              </div>
            </Field>
            <Field label="Front for tapping" >
              <select className="input" value={front} onChange={(e) => setFront(e.target.value as Front)}>
                {["4-3", "4-2-5", "3-4", "5-3", "4-4"].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Give rule" extra={flag("option_details.give_rule")}>
            <textarea className={`${fieldClass("option_details.give_rule")} py-2`} rows={2} value={txt(data.option_details?.give_rule)} onFocus={ensureOption} onChange={(e) => set("option_details.give_rule", orUnknown(e.target.value))} />
          </Field>
          <Field label={t === "rpo" ? "Throw rule" : "Keep rule"} extra={flag("option_details.keep_rule")}>
            <textarea className={`${fieldClass("option_details.keep_rule")} py-2`} rows={2} value={txt(data.option_details?.keep_rule)} onFocus={ensureOption} onChange={(e) => set("option_details.keep_rule", orUnknown(e.target.value))} />
          </Field>
          {t === "option" && (
            <Field label="Pitch rule (optional)">
              <textarea className="input py-2" rows={2} value={txt(data.option_details?.pitch_or_pass_rule)} onFocus={ensureOption} onChange={(e) => set("option_details.pitch_or_pass_rule", e.target.value || null)} />
            </Field>
          )}
          <Field label="What the QB does when the key…" extra={flag("option_details.decisions")}>
            <ul className="flex flex-col gap-2">
              {REACTIONS.map((re) => {
                const cur = data.option_details?.decisions.find((d) => d.reaction === re.key)?.action ?? "";
                const actions = t === "rpo" ? ["give", "throw"] : ["give", "keep", "pitch"];
                return (
                  <li key={re.key} className="flex items-center justify-between gap-2 text-sm">
                    <span>{re.label}</span>
                    <select
                      className="rounded-lg border border-line bg-card px-2 py-1.5"
                      value={cur}
                      onFocus={ensureOption}
                      onChange={(e) => {
                        const others = (data.option_details?.decisions ?? []).filter((d) => d.reaction !== re.key);
                        set("option_details.decisions", e.target.value ? [...others, { reaction: re.key, action: e.target.value }] : others);
                      }}
                    >
                      <option value="">n/a</option>
                      {actions.map((a) => (
                        <option key={a} value={a}>
                          {title(a)}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </Field>
        </Section>
      )}

      {/* pass */}
      {passy && (
        <Section title="QB reads">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Drop" extra={flag("pass_details.qb_drop")}>
              <select className="input" value={String(data.pass_details?.qb_drop ?? UNKNOWN)} onFocus={ensurePass} onChange={(e) => set("pass_details.qb_drop", e.target.value)}>
                <option value={UNKNOWN}>—</option>
                {QB_DROPS.map((x) => (
                  <option key={x} value={x}>
                    {title(x)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Protection">
              <input className="input" value={txt(data.pass_details?.protection)} onFocus={ensurePass} onChange={(e) => set("pass_details.protection", orUnknown(e.target.value))} placeholder="Half slide right" />
            </Field>
          </div>
          <Field label="Presnap read — what does the QB look at, and what does it tell him?" extra={flag("pass_details.presnap_read")}>
            <textarea className={`${fieldClass("pass_details.presnap_read")} py-2`} rows={3} value={txt(data.pass_details?.presnap_read)} onFocus={ensurePass} onChange={(e) => set("pass_details.presnap_read", orUnknown(e.target.value))} />
          </Field>
          <Field label="Progression" extra={flag("pass_details.progression")}>
            <button className="btn btn-ghost mb-2 w-full" onClick={() => { ensurePass(); setTap("progression"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              Tap receivers on the diagram in order
            </button>
            <ol className="flex flex-col gap-2">
              {(data.pass_details?.progression ?? []).map((s, i) => (
                <li key={s.player + i} className="flex items-start gap-2">
                  <span className="mt-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-ink">{i + 1}</span>
                  <div className="flex-1">
                    <div className="mb-1 text-sm font-semibold">{term(props.terms, "positions", s.player)}</div>
                    <input className="input text-sm" placeholder="When to throw it / when to move on" value={s.trigger} onChange={(e) => set(`pass_details.progression.${i}.trigger`, e.target.value)} />
                  </div>
                </li>
              ))}
            </ol>
          </Field>
          <Field label="Hot / sight adjustment">
            <input className="input" value={txt(data.pass_details?.hot_or_sight_adjustment)} onFocus={ensurePass} onChange={(e) => set("pass_details.hot_or_sight_adjustment", e.target.value || null)} />
          </Field>
          <Field label="Best throw vs each coverage" extra={flag("pass_details.vs_coverage")}>
            <ul className="flex flex-col gap-3">
              {COVERAGES.map((c) => {
                const a = data.pass_details?.vs_coverage[c];
                const path = `pass_details.vs_coverage.${c}`;
                return (
                  <li key={c} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-sm font-semibold">{term(props.terms, "coverages", c)}</span>
                      <select
                        className={`${fieldClass(path)} flex-1`}
                        value={a?.target ?? ""}
                        onFocus={ensurePass}
                        onChange={(e) => set(path, e.target.value ? { target: e.target.value, why: a?.why ?? "" } : null)}
                      >
                        <option value="">—</option>
                        {skill.filter((p) => p.assignment_type === "route" || p.assignment_type === "carry").map((p) => (
                          <option key={p.id} value={p.id}>
                            {term(props.terms, "positions", p.id)}
                          </option>
                        ))}
                        <option value="run">Hand off / run</option>
                      </select>
                      {flag(path)}
                    </div>
                    {a && <input className="input text-sm" placeholder="Why" value={a.why} onChange={(e) => set(`${path}.why`, e.target.value)} />}
                  </li>
                );
              })}
            </ul>
          </Field>
        </Section>
      )}

      <Section title="Coaching points">
        <CoachingPoints points={data.coaching_points} suggested={data.suggested.includes("coaching_points")} onChange={(v) => set("coaching_points", v)} onConfirm={() => confirm("coaching_points")} />
      </Section>

      <button className="self-start text-sm text-muted underline" onClick={() => start(async () => { await archivePlayAction(props.teamId, props.playId); router.push(`/t/${props.teamId}/plays`); })}>
        Remove this play from the playbook
      </button>

      {/* action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          {msg && <span className={`hidden text-sm sm:inline ${msg.kind === "bad" ? "text-bad" : "text-ok"}`}>{msg.text}</span>}
          <button className="btn btn-ghost flex-1 sm:flex-none" disabled={pending || !dirty} onClick={() => start(async () => { await save(); router.refresh(); })}>
            {dirty ? "Save" : "Saved"}
          </button>
          {status === "approved" && !dirty ? (
            <button className="btn btn-ghost flex-1 sm:flex-none" disabled={pending} onClick={() => start(async () => { const res = await unapproveAction(props.teamId, props.playId); if (res.ok) setStatus("draft"); })}>
              Unapprove
            </button>
          ) : (
            <button
              className="btn btn-primary flex-1 sm:flex-none"
              disabled={pending || (!r.complete && !props.converted)}
              onClick={() =>
                start(async () => {
                  if (dirty && !(await save())) return;
                  const res = await approveAction(props.teamId, props.playId);
                  if (!res.ok) return setMsg({ kind: "bad", text: res.error });
                  setStatus("approved");
                  setData((d) => ({ ...d, suggested: [] }));
                  if (props.nextId) router.push(`/t/${props.teamId}/plays/${props.nextId}`);
                  else router.refresh();
                })
              }
            >
              {r.complete || props.converted ? "Approve" : `${r.missing.length} to go`}
            </button>
          )}
          {props.nextId && (
            <Link href={`/t/${props.teamId}/plays/${props.nextId}`} className="btn btn-ghost px-3" aria-label="Next play needing review">
              Next →
            </Link>
          )}
        </div>
        {msg?.kind === "bad" && <p className="px-4 pb-2 text-sm text-bad sm:hidden">{msg.text}</p>}
      </div>
    </div>
  );
}

function StatusChip({ status, dirty }: { status: string; dirty: boolean }) {
  const map: Record<string, [string, string]> = {
    approved: ["Approved", "bg-ok-bg text-ok"],
    draft: ["Ready to approve", "bg-suggest-bg text-suggest"],
    needs_coach_input: ["Needs your input", "bg-warn-bg text-warn"],
  };
  const [label, cls] = map[status] ?? [status, "bg-line"];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
      {dirty ? " · unsaved" : ""}
    </span>
  );
}

function Section({ title: t, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 p-4">
      <h2 className="font-semibold">{t}</h2>
      {children}
    </section>
  );
}

function Field({ label, extra, children }: { label: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">
        {label}
        {extra}
      </div>
      {children}
    </div>
  );
}

function CoachingPoints({ points, suggested, onChange, onConfirm }: { points: string[]; suggested: boolean; onChange: (v: string[]) => void; onConfirm: () => void }) {
  const [listening, setListening] = useState(false);
  const text = points.join("\n");
  type Rec = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; start: () => void };
  const [unsupported, setUnsupported] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      {suggested && (
        <button className="self-start rounded bg-suggest-bg px-2 py-0.5 text-xs font-semibold text-suggest" onClick={onConfirm}>
          Suggested from the concept library · tap to confirm
        </button>
      )}
      <textarea className="input py-2" rows={4} placeholder="One point per line" value={text} onChange={(e) => onChange(e.target.value.split("\n").map((l) => l.trimStart()).filter((l, i, a) => l || i < a.length - 1))} />
      {!unsupported && (
        <button
          className="btn btn-ghost self-start"
          onClick={() => {
            // Checked on tap (not during render) so server and client HTML match.
            const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
            const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
            if (!SR) return setUnsupported(true);
            const rec = new SR();
            rec.lang = "en-US";
            rec.interimResults = false;
            rec.onresult = (e) => {
              const said = e.results[0]?.[0]?.transcript ?? "";
              if (said) onChange([...points.filter(Boolean), said.charAt(0).toUpperCase() + said.slice(1)]);
            };
            rec.onend = () => setListening(false);
            setListening(true);
            rec.start();
          }}
        >
          {listening ? "Listening…" : "🎙 Speak a point"}
        </button>
      )}
      {unsupported && <p className="text-xs text-muted">This browser doesn&apos;t support voice input. Your phone&apos;s keyboard microphone works too.</p>}
    </div>
  );
}
