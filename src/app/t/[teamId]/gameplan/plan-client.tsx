"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlaySvg } from "@/components/play-svg";
import { customLook, DEFENSE_LOOKS, lookLabel, OFFENSE_LOOKS, type Look, type Side } from "@/domain/matchups";
import type { PlayData } from "@/domain/play";
import { safeCall } from "@/lib/safe-call";
import { createPlanAction, deletePlanAction, sendPlanAction, updatePlanAction } from "./actions";

/** Start a plan: who and when. */
export function NewPlan({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="card flex flex-wrap items-end gap-2 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await safeCall(() => createPlanAction(teamId, opponent, date || null), "Starting the plan");
        setBusy(false);
        if (!r.ok) return setMsg(r.error);
        router.push(`/t/${teamId}/gameplan?plan=${r.id}`);
      }}
    >
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs">
        Opponent
        <input className="input" value={opponent} maxLength={60} onChange={(e) => setOpponent(e.target.value)} placeholder="e.g. Eagles" />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Game day
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <button className="btn btn-primary" disabled={busy || !opponent.trim()}>
        {busy ? "Starting…" : "Start a game plan"}
      </button>
      {msg && <span className="text-sm text-bad">{msg}</span>}
    </form>
  );
}

type Suggestion = { id: string; name: string; approved: boolean; hits: string[]; tags: string[] };
type Plan = { id: string; opponent: string; gameDate: string | null; theyShow: string[]; theyRun: string[]; notes: string; playIds: string[]; sentAt: string | null };

export function PlanEditor(props: {
  teamId: string;
  plan: Plan;
  installName: string;
  labels: Record<string, string>;
  suggestions: { offense: Suggestion[]; defense: Suggestion[] };
  inPlan: Array<{ id: string; name: string; approved: boolean; side: string | null; data: PlayData }>;
  all: Array<{ id: string; name: string; side: "offense" | "defense" }>;
}) {
  const router = useRouter();
  const { teamId, plan } = props;
  const [opponent, setOpponent] = useState(plan.opponent);
  const [date, setDate] = useState(plan.gameDate ?? "");
  const [notes, setNotes] = useState(plan.notes);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [find, setFind] = useState("");
  const [sure, setSure] = useState<"send" | "delete" | null>(null);
  const [own, setOwn] = useState<{ offense: string; defense: string }>({ offense: "", defense: "" });

  const save = async (patch: Record<string, unknown>, text?: string) => {
    setBusy(true);
    const r = await safeCall(() => updatePlanAction(teamId, plan.id, patch), "Saving the plan");
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.error, ok: false });
    if (text) setMsg({ text, ok: true });
    router.refresh();
  };
  const toggleLook = (side: Side, key: string) => {
    const list = side === "offense" ? plan.theyShow : plan.theyRun;
    const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
    void save(side === "offense" ? { theyShow: next } : { theyRun: next });
  };
  const addOwn = (side: Side) => {
    const key = customLook(own[side], side);
    if (!key) return;
    setOwn({ ...own, [side]: "" });
    const list = side === "offense" ? plan.theyShow : plan.theyRun;
    if (!list.includes(key)) void save(side === "offense" ? { theyShow: [...list, key] } : { theyRun: [...list, key] });
  };
  const inPlan = new Set(plan.playIds);
  const add = (id: string) => save({ playIds: [...plan.playIds, id] });
  const remove = (id: string) => save({ playIds: plan.playIds.filter((x) => x !== id) });
  const label = (k: string) => props.labels[k] ?? lookLabel(k);

  const looks = (side: Side, list: Look[], picked: string[]) => {
    const groups = [...new Set(list.map((l) => l.group))];
    const extra = picked.filter((k) => !list.some((l) => l.key === k));
    return (
      <div className="flex flex-col gap-2">
        {groups.map((g) => (
          <div key={g} className="flex flex-wrap items-center gap-1">
            <span className="w-20 text-xs text-muted">{g}</span>
            {list
              .filter((l) => l.group === g)
              .map((l) => (
                <button key={l.key} disabled={busy} onClick={() => toggleLook(side, l.key)} className={`px-2.5 py-1 text-sm ${picked.includes(l.key) ? "bg-brand text-brand-ink" : "border border-line"}`} aria-pressed={picked.includes(l.key)}>
                  {l.label}
                </button>
              ))}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-20 text-xs text-muted">Your words</span>
          {extra.map((k) => (
            <button key={k} disabled={busy} onClick={() => toggleLook(side, k)} className="bg-brand px-2.5 py-1 text-sm text-brand-ink" aria-pressed>
              {label(k)} ×
            </button>
          ))}
          <input className="input w-36 py-1 text-sm" value={own[side]} onChange={(e) => setOwn({ ...own, [side]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addOwn(side)} placeholder="e.g. Cover 6" />
          <button className="text-sm underline" disabled={!own[side].trim()} onClick={() => addOwn(side)}>
            Add
          </button>
        </div>
      </div>
    );
  };

  const suggestList = (rows: Suggestion[], want: number, empty: string) =>
    rows.length === 0 ? (
      <p className="text-sm text-muted">{empty}</p>
    ) : (
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-1.5">
            <span className="min-w-0">
              <Link href={`/t/${teamId}/plays/${r.id}`} className="font-semibold underline">
                {r.name}
              </Link>
              {!r.approved && <span className="text-xs text-warn"> · not approved yet</span>}
              <span className="block text-xs text-muted">{r.hits.length === want ? "Built for all of it" : `Built for ${r.hits.join(", ")}`}</span>
            </span>
            {inPlan.has(r.id) ? (
              <span className="text-sm text-ok">✓ In the plan</span>
            ) : (
              <button className="btn btn-outline min-h-8 px-2 text-sm" disabled={busy} onClick={() => add(r.id)}>
                Add
              </button>
            )}
          </li>
        ))}
      </ul>
    );

  const found = find.trim().length >= 2 ? props.all.filter((p) => !inPlan.has(p.id) && p.name.toLowerCase().includes(find.trim().toLowerCase())).slice(0, 12) : [];

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs">
          Opponent
          <input className="input text-2xl font-semibold" value={opponent} maxLength={60} onChange={(e) => setOpponent(e.target.value)} onBlur={() => opponent.trim() && opponent !== plan.opponent && save({ opponent })} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Game day
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} onBlur={() => date !== (plan.gameDate ?? "") && save({ gameDate: date || null })} />
        </label>
      </div>

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-2xl">What they do</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Their defense shows</h3>
            {looks("offense", DEFENSE_LOOKS, plan.theyShow)}
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Their offense runs</h3>
            {looks("defense", OFFENSE_LOOKS, plan.theyRun)}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-xs">
          Scouting notes (your coaches see these; players don&apos;t)
          <textarea className="input min-h-20 text-sm" value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== plan.notes && save({ notes }, "Notes saved.")} />
        </label>
      </section>

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-2xl">Built for it</h2>
        <p className="text-sm text-muted">Your plays and calls tagged good against what they do (tag more on each play&apos;s page).</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="font-semibold">Our offense</h3>
            {suggestList(props.suggestions.offense, plan.theyShow.length, plan.theyShow.length ? "None of your plays are tagged for that yet." : "Pick what their defense shows.")}
          </div>
          <div>
            <h3 className="font-semibold">Our defense</h3>
            {suggestList(props.suggestions.defense, plan.theyRun.length, plan.theyRun.length ? "None of your calls are tagged for that yet." : "Pick what their offense runs.")}
          </div>
        </div>
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <label className="flex flex-col gap-1 text-xs">
            Add any play or call
            <input className="input" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Type part of its name" />
          </label>
          {found.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {p.name} <span className="text-xs text-muted">{p.side === "defense" ? "defense" : ""}</span>
              </span>
              <button className="btn btn-outline min-h-8 px-2 text-sm" disabled={busy} onClick={() => add(p.id).then(() => setFind(""))}>
                Add
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-4 pt-1 text-sm font-semibold">
            <Link href={`/t/${teamId}/plays/build?plan=${plan.id}`} className="underline">
              Draw a new play for {plan.opponent}
            </Link>
            <Link href={`/t/${teamId}/plays/build?side=defense&plan=${plan.id}`} className="underline">
              Draw a new defensive call
            </Link>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl">
          The plan · {props.inPlan.length} play{props.inPlan.length === 1 ? "" : "s"}
        </h2>
        {props.inPlan.length === 0 ? (
          <p className="card p-4 text-sm text-muted">Add plays from the lists above.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {props.inPlan.map((p) => (
              <li key={p.id} className="card flex flex-col gap-2 p-2">
                <Link href={`/t/${teamId}/plays/${p.id}`}>
                  <PlaySvg data={p.data} fit compact className="pointer-events-none block w-full border border-line" />
                </Link>
                <div className="flex items-start justify-between gap-2 px-1">
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-muted">
                      {p.side === "defense" ? "Defense" : "Offense"}
                      {!p.approved ? " · not approved yet: players get it once you approve it" : ""}
                    </div>
                  </div>
                  <button className="text-sm text-muted underline" disabled={busy} onClick={() => remove(p.id)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <button
            className="btn btn-primary"
            disabled={busy || !props.inPlan.length}
            onClick={async () => {
              if (sure !== "send") return setSure("send");
              setSure(null);
              setBusy(true);
              const r = await safeCall(() => sendPlanAction(teamId, plan.id), "Sending the plan");
              setBusy(false);
              if (!r.ok) return setMsg({ text: r.error, ok: false });
              setMsg({ text: `Sent: players see “${r.name}” with ${r.plays} play${r.plays === 1 ? "" : "s"} on their Study page.`, ok: true });
              router.refresh();
            }}
          >
            {sure === "send" ? `Yes, make it this week's install` : plan.sentAt ? "Send it again" : "Send to players"}
          </button>
          <Link href={`/t/${teamId}/plays/print?plan=${plan.id}`} className="text-sm font-semibold underline">
            Print it
          </Link>
          <Link href={`/t/${teamId}/plays/wristband?plan=${plan.id}`} className="text-sm font-semibold underline">
            Wristband
          </Link>
          <button
            className={`text-sm underline ${sure === "delete" ? "text-bad" : "text-muted"}`}
            disabled={busy}
            onClick={async () => {
              if (sure !== "delete") return setSure("delete");
              await safeCall(() => deletePlanAction(teamId, plan.id), "Deleting");
              router.push(`/t/${teamId}/gameplan`);
            }}
          >
            {sure === "delete" ? "Yes, delete this plan" : "Delete plan"}
          </button>
          <span className={`text-sm ${msg ? (msg.ok ? "text-ok" : "text-bad") : "text-muted"}`} aria-live="polite">
            {msg?.text ??
              (sure === "send"
                ? `This week's install becomes “${props.installName}” with exactly these plays.`
                : plan.sentAt
                  ? `Sent ${new Date(plan.sentAt).toLocaleDateString()}. Players see it as “${props.installName}”.`
                  : `Players will see it as “${props.installName}”.`)}
          </span>
        </div>
      </div>
    </div>
  );
}
