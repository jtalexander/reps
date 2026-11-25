"use client";
/**
 * Edit a blocking scheme: a rule for each blocker, where the back hits it,
 * and the play words that use it; see it against any front on a few common
 * formations. Also the fronts the team sees.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlaySvg } from "@/components/play-svg";
import {
  BLOCK_FRONTS,
  HOLES,
  newBlocking,
  resolveBlocking,
  ROLE_LABEL,
  ROLES,
  RULE_LABEL,
  RULES,
  SCHEME_LIBRARY,
  type BlockFront,
  type Hole,
  type Role,
  type Rule,
  type TeamScheme,
} from "@/domain/blocking";
import { emptyPlay, type PlayData, type Player } from "@/domain/play";
import { safeCall } from "@/lib/safe-call";
import { assignSchemesAction, copyBlockingAction, resetSchemeAction, saveFrontsAction, saveSchemeAction } from "../../actions";

const p = (id: string, x: number, y: number): Player => ({ id, position: id, x, y, on_ball: Math.abs(y) < 0.8, side: x < -1 ? "left" : x > 1 ? "right" : "middle", split: null, assignment_type: "unknown", route: null, block: null, path: null, notes: null });
const OL = [p("LT", -2.6, 0), p("LG", -1.3, 0), p("C", 0, 0), p("RG", 1.3, 0), p("RT", 2.6, 0)];
const FORMATIONS: Array<{ key: string; name: string; players: Player[] }> = [
  { key: "pro_i", name: "Pro I (tight end right)", players: [...OL, p("Y", 4, 0), p("X", -14, 0), p("Z", 12, -1), p("QB", 0, -1), p("F", 0, -4), p("RB", 0, -6.5)] },
  { key: "gun_te", name: "Gun, tight end and H-back", players: [...OL, p("Y", 4, 0), p("H", -4, -1.2), p("X", -14, 0), p("Z", 12, -1), p("QB", 0, -5), p("RB", 1.5, -5)] },
  { key: "gun_2x2", name: "Gun 2x2 (no tight end)", players: [...OL, p("X", -14, 0), p("H", -8, -1), p("Y", 8, -1), p("Z", 14, 0), p("QB", 0, -5), p("RB", 1.5, -5)] },
  { key: "wing", name: "Wing T (tight end and wing right)", players: [...OL, p("Y", 4, 0), p("W", 5.5, -1), p("X", -12, 0), p("QB", 0, -1), p("F", 0, -4), p("RB", -1.5, -4.5)] },
];

const SIDE_NOTE: Partial<Record<Role, string>> = { PSW: "only when there's a wing", PSTE: "only with a tight end", BSTE: "only with a tight end", BSW: "only when there's a wing", FB: "the back who isn't carrying it" };

export function SchemeEditor({
  teamId,
  schemes,
  fronts,
  initial,
  matches,
  otherTeams,
}: {
  teamId: string;
  schemes: TeamScheme[];
  fronts: BlockFront[];
  initial: string;
  /** run plays whose name fits a scheme but have none yet */
  matches: number;
  otherTeams: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [all, setAll] = useState(schemes);
  const [key, setKey] = useState(initial);
  const saved = all.find((s) => s.key === key) ?? all[0]!;
  const [draft, setDraft] = useState<TeamScheme>(saved);
  const [words, setWords] = useState(saved.words.join(", "));
  const [formation, setFormation] = useState(FORMATIONS[0]!.key);
  const [front, setFront] = useState<BlockFront>(fronts[0] ?? "4-3");
  const [side, setSide] = useState<"left" | "right">("right");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [seen, setSeen] = useState<BlockFront[]>(fronts);
  const [newName, setNewName] = useState("");
  const [toTeam, setToTeam] = useState("");
  const [sure, setSure] = useState(false);
  const [teamMsg, setTeamMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [left, setLeft] = useState(matches);
  const [playMsg, setPlayMsg] = useState<string | null>(null);
  const giveSchemes = async () => {
    setBusy(true);
    const res = await safeCall(() => assignSchemesAction(teamId), "Matching plays");
    setBusy(false);
    if (!res.ok) return setPlayMsg(res.error);
    setLeft(0);
    setPlayMsg(`${res.matched} play${res.matched === 1 ? "" : "s"} now have their scheme. Open one to see it against each front, and check the fronts that are right.`);
    router.refresh();
  };
  const copyTo = async () => {
    if (!sure) return setSure(true);
    setBusy(true);
    const res = await safeCall(() => copyBlockingAction(teamId, toTeam), "Copying");
    setBusy(false);
    setSure(false);
    if (!res.ok) return setTeamMsg({ text: res.error, ok: false });
    const name = otherTeams.find((t) => t.id === toTeam)?.name ?? "That team";
    setTeamMsg({ text: `Copied to ${name}: ${res.matched} of its plays got a scheme${res.redrawn ? `, ${res.redrawn} redrawn` : ""}.`, ok: true });
  };
  const isLib = SCHEME_LIBRARY.some((s) => s.key === draft.key);
  const changed = JSON.stringify({ ...draft, words: undefined }) !== JSON.stringify({ ...saved, words: undefined }) || words !== saved.words.join(", ");

  const choose = (k: string) => {
    const s = all.find((x) => x.key === k)!;
    setKey(k);
    setDraft(s);
    setWords(s.words.join(", "));
    setMsg(null);
  };

  const play: PlayData = useMemo(() => {
    const f = FORMATIONS.find((x) => x.key === formation)!;
    const data = { ...emptyPlay(draft.name), play_type: "run" as const, players: f.players };
    return { ...data, blocking: { ...newBlocking(draft, side, front), rules: { ...draft.rules } as Record<string, string> } };
  }, [draft, formation, front, side]);
  const r = resolveBlocking(play, play.blocking!, front);
  const label = (id: string | null) => (id ? (r.defenders.find((d) => d.id === id)?.label ?? id) : "no one");

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const scheme: TeamScheme = { ...draft, words: words.split(/[,;\n]/).map((w) => w.trim()).filter(Boolean) };
    const res = await safeCall(() => saveSchemeAction(teamId, scheme), "Saving");
    setBusy(false);
    if (!res.ok) return setMsg({ text: res.error, ok: false });
    setAll((a) => (a.some((x) => x.key === scheme.key) ? a.map((x) => (x.key === scheme.key ? scheme : x)) : [...a, scheme]));
    setDraft(scheme);
    setMsg({ text: `Saved. ${res.plays ? `${res.plays} play${res.plays === 1 ? "" : "s"} use the new rules.` : "No plays use it yet."}${res.matched ? ` ${res.matched} more matched by name.` : ""}`, ok: true });
    router.refresh();
  };
  const reset = async () => {
    setBusy(true);
    const res = await safeCall(() => resetSchemeAction(teamId, draft.key), "Resetting");
    setBusy(false);
    if (!res.ok) return setMsg({ text: res.error, ok: false });
    const lib = SCHEME_LIBRARY.find((s) => s.key === draft.key);
    if (lib) {
      const back = { ...lib, words: [] };
      setAll((a) => a.map((x) => (x.key === lib.key ? back : x)));
      setDraft(back);
      setWords("");
      setMsg({ text: `Back to RepWon's ${lib.name}. ${res.plays} play${res.plays === 1 ? "" : "s"} redrawn.`, ok: true });
    } else {
      const rest = all.filter((x) => x.key !== draft.key);
      setAll(rest);
      choose(rest[0]!.key);
      setMsg({ text: "Removed. Plays that used it keep their rules.", ok: true });
    }
    router.refresh();
  };
  const add = () => {
    const name = newName.trim();
    if (!name) return;
    const k = `t_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}`;
    if (all.some((x) => x.key === k)) return choose(k);
    const s: TeamScheme = { ...draft, key: k, name, words: [name.toUpperCase()] };
    setAll((a) => [...a, s]);
    setKey(k);
    setDraft(s);
    setWords(s.words.join(", "));
    setNewName("");
    setMsg({ text: `${name} starts as a copy of ${draft.name}. Change the rules and save.`, ok: true });
  };
  const saveSeen = async (next: BlockFront[]) => {
    setSeen(next);
    const res = await safeCall(() => saveFrontsAction(teamId, next), "Saving");
    if (!res.ok) setMsg({ text: res.error, ok: false });
  };

  return (
    <div className="flex flex-col gap-4">
      {(left > 0 || playMsg) && (
        <section className="card flex flex-col gap-2 p-4" aria-live="polite">
          {playMsg ? (
            <p className="text-sm text-ok">{playMsg}</p>
          ) : (
            <>
              <p className="text-sm">
                {left} run play{left === 1 ? "" : "s"} in your playbook {left === 1 ? "fits" : "fit"} a scheme by name but {left === 1 ? "doesn't have one" : "don't have one"} yet. RepWon keeps the blocks your playbook draws and adds the scheme, so you can see each play against every front.
              </p>
              <button className="btn btn-primary self-start" disabled={busy} onClick={giveSchemes}>
                Give {left === 1 ? "it its scheme" : "them their schemes"}
              </button>
            </>
          )}
        </section>
      )}
      <section className="card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            Scheme
            <select className="input w-auto text-base font-semibold" value={key} onChange={(e) => choose(e.target.value)}>
              {all.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Name
            <input className="input w-40" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Where the back hits it
            <select className="input w-auto" value={draft.hole} onChange={(e) => setDraft({ ...draft, hole: e.target.value as Hole })}>
              {HOLES.map((h) => (
                <option key={h} value={h}>
                  {h === "edge" ? "Outside, the edge" : `${h} gap`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs">
            Play words that use it (comma between)
            <input className="input" value={words} onChange={(e) => setWords(e.target.value)} placeholder="e.g. 24, 25, POWER" />
          </label>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {ROLES.map((role) => (
            <label key={role} className="flex flex-col gap-1 text-xs">
              <span>
                {ROLE_LABEL[role]} {SIDE_NOTE[role] ? <span className="text-muted">({SIDE_NOTE[role]})</span> : null}
              </span>
              <select
                className="input"
                value={draft.rules[role] ?? ""}
                onChange={(e) => {
                  const rules = { ...draft.rules };
                  if (e.target.value) rules[role] = e.target.value as Rule;
                  else delete rules[role];
                  setDraft({ ...draft, rules });
                }}
              >
                <option value="">—</option>
                {RULES.map((x) => (
                  <option key={x} value={x}>
                    {RULE_LABEL[x]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" disabled={busy || !changed || !draft.name.trim()} onClick={save}>
            {busy ? "Saving…" : `Save ${draft.name || "scheme"}`}
          </button>
          {all.some((x) => x.key === draft.key) && (
            <button className="text-sm text-muted underline" disabled={busy} onClick={reset}>
              {isLib ? "Back to RepWon's rules" : "Remove this scheme"}
            </button>
          )}
          {msg && (
            <span className={`text-sm ${msg.ok ? "text-ok" : "text-warn"}`} aria-live="polite">
              {msg.text}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <label className="flex flex-col gap-1 text-xs">
            Add your own scheme (starts as a copy of {draft.name})
            <input className="input w-48" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Dart" />
          </label>
          <button className="btn btn-outline min-h-9 px-3 text-sm" disabled={!newName.trim()} onClick={add}>
            Add
          </button>
        </div>
      </section>

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-2xl">How it looks</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            Formation
            <select className="input w-auto" value={formation} onChange={(e) => setFormation(e.target.value)}>
              {FORMATIONS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Going
            <select className="input w-auto" value={side} onChange={(e) => setSide(e.target.value as "left" | "right")}>
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-1 text-sm" role="group" aria-label="Against">
          {BLOCK_FRONTS.map((f) => (
            <button key={f} onClick={() => setFront(f)} className={`px-2 py-1 ${front === f ? "bg-brand text-brand-ink" : "border border-line"}`} aria-pressed={front === f}>
              {f}
            </button>
          ))}
        </div>
        <PlaySvg data={play} blockFront={front} fit className="block w-full" />
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {r.blocks.map((x) => (
            <li key={x.id}>
              <span className="font-semibold">{x.id}</span> ({ROLE_LABEL[x.role]}): <span className="font-semibold">{label(x.target)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card flex flex-col gap-2 p-4">
        <h2 className="text-2xl">Fronts you see</h2>
        <p className="text-sm text-muted">The builder shows these, and linemen are quizzed on them once you check a play against them.</p>
        <div className="flex flex-wrap gap-3">
          {BLOCK_FRONTS.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={seen.includes(f)}
                onChange={(e) => {
                  const next = e.target.checked ? BLOCK_FRONTS.filter((x) => x === f || seen.includes(x)) : seen.filter((x) => x !== f);
                  if (next.length) void saveSeen(next);
                }}
              />
              {f}
            </label>
          ))}
        </div>
      </section>

      {otherTeams.length > 0 && (
        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-2xl">Use these on another team</h2>
          <p className="text-sm text-muted">Copies every scheme&apos;s rules, the play words and the fronts you see. It replaces that team&apos;s blocking rules; fixes on its plays stay.</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              Team
              <select
                className="input w-auto"
                value={toTeam}
                onChange={(e) => {
                  setToTeam(e.target.value);
                  setSure(false);
                  setTeamMsg(null);
                }}
              >
                <option value="">Pick a team</option>
                {otherTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button className={sure ? "btn btn-primary" : "btn btn-outline"} disabled={busy || !toTeam || changed} onClick={copyTo}>
              {sure ? `Yes, replace ${otherTeams.find((t) => t.id === toTeam)?.name ?? "it"}'s blocking` : "Copy"}
            </button>
          </div>
          {changed && <p className="text-xs text-warn">Save your changes to {draft.name} first.</p>}
          {teamMsg && (
            <p className={`text-sm ${teamMsg.ok ? "text-ok" : "text-warn"}`} aria-live="polite">
              {teamMsg.text}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
