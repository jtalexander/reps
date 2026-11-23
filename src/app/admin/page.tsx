import Link from "next/link";
import { LEVEL_LABEL, type Level } from "@/domain/readiness";
import { adminTeams, requireAdmin, unattributedSpend, type AdminTeam } from "@/server/admin";
import { DEFAULT_CAP_USD } from "@/teach/usage";
import { setAiAccessAction, setAiCapAction } from "./actions";

export const metadata = { title: "Admin" };

const money = (n: number) => `$${n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString()}`;
const day = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "never");

/** Every team on Reps: who runs it, how big it is, what its AI costs, and the switch and cap for its AI. */
export default async function Admin() {
  await requireAdmin();
  const list = await adminTeams();
  const loose = await unattributedSpend();
  const waiting = list.filter((t) => t.access === "pending");
  const total = list.reduce((a, t) => a + t.spend, 0) + loose;
  const players = list.reduce((a, t) => a + t.players, 0);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/coach" className="text-sm text-muted underline">
          Your teams
        </Link>
        <h1 className="text-4xl">Admin</h1>
      </div>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Teams" value={String(list.length)} />
        <Stat label="Players" value={String(players)} />
        <Stat label="AI this month" value={money(total)} />
        <Stat label="Waiting" value={String(waiting.length)} />
      </section>

      {waiting.length > 0 && (
        <section className="card flex flex-col gap-2 p-4">
          <h2 className="font-semibold">Waiting for you to turn on AI</h2>
          <p className="text-sm text-muted">
            New coaches can make a team and invite players, but Reps won&apos;t read their playbook until you turn AI on. Coaches you&apos;ve approved before skip this for
            their next teams.
          </p>
          <ul className="flex flex-col">
            {waiting.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2">
                <span className="text-sm">
                  <b>{t.name}</b> · {t.ownerName ?? "no owner"} <span className="text-muted">{t.ownerEmail}</span>
                  <span className="block text-xs text-muted">Made {day(t.createdAt)}</span>
                </span>
                <form action={setAiAccessAction.bind(null, t.id, "on")}>
                  <button className="btn btn-primary">Turn on AI</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">All teams</h2>
        <p className="text-sm text-muted">
          AI stops for a team when it reaches its monthly cap ({money(DEFAULT_CAP_USD)} unless you set one); players&apos; own-words answers fall back to a simple word check
          until then. Spend is estimated from tokens at Anthropic&apos;s list price.
          {loose > 0 ? ` ${money(loose)} this month wasn't tied to a team.` : ""}
        </p>
        <ul className="flex flex-col gap-2">
          {list.map((t) => (
            <TeamRow key={t.id} t={t} />
          ))}
        </ul>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function TeamRow({ t }: { t: AdminTeam }) {
  const pct = t.cap > 0 ? Math.min(100, Math.round((t.spend / t.cap) * 100)) : 100;
  const state = t.access === "on" ? (t.spend >= t.cap ? "At cap" : "AI on") : t.access === "off" ? "AI off" : "Waiting";
  const tone = t.access === "on" && t.spend < t.cap ? "text-ok" : t.access === "pending" ? "text-warn" : "text-bad";
  return (
    <li className="card flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">
            {t.name} <span className="text-sm font-normal text-muted">· {LEVEL_LABEL[t.level as Level] ?? t.level}</span>
          </p>
          <p className="text-sm text-muted">
            {t.ownerName ?? "No owner"} {t.ownerEmail && <span>· {t.ownerEmail}</span>}
          </p>
          <p className="text-xs text-muted">
            {t.coaches} coach{t.coaches === 1 ? "" : "es"} · {t.players} player{t.players === 1 ? "" : "s"} · made {day(t.createdAt)} · last player activity {day(t.lastActive)}
          </p>
        </div>
        <span className={`text-sm font-semibold ${tone}`}>{state}</span>
      </div>
      <div>
        <div className="flex justify-between text-sm">
          <span>AI this month</span>
          <span>
            {money(t.spend)} of {money(t.cap)}
            {!t.capSet && <span className="text-muted"> (default)</span>}
          </span>
        </div>
        <div className="mt-1 h-1.5 bg-line">
          <div className={`h-full ${pct >= 100 ? "bg-bad" : pct >= 80 ? "bg-warn" : "bg-ink"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <form action={setAiCapAction.bind(null, t.id)} className="flex items-end gap-2">
          <div>
            <label className="label" htmlFor={`cap-${t.id}`}>
              Monthly cap ($, blank = default)
            </label>
            <input id={`cap-${t.id}`} name="cap" inputMode="numeric" className="input w-28" defaultValue={t.capSet ? t.cap : ""} />
          </div>
          <button className="btn btn-outline">Save cap</button>
        </form>
        <form action={setAiAccessAction.bind(null, t.id, t.access === "on" ? "off" : "on")} className="ml-auto">
          <button className={t.access === "on" ? "btn btn-outline" : "btn btn-primary"}>{t.access === "on" ? "Turn off AI" : "Turn on AI"}</button>
        </form>
      </div>
    </li>
  );
}
