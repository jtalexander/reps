import Link from "next/link";
import { BLOCK_FRONTS, frontOk } from "@/domain/blocking";
import { FRONTS, type Front } from "@/domain/defense";
import { filterFrom, filterQuery, fits } from "@/domain/facets";
import { lookLabel } from "@/domain/matchups";
import { COVERAGES, type Coverage, type PlayData } from "@/domain/play";
import { getPlan, installNameFor, planPlays } from "@/server/game-plans";
import { playbookPlays } from "@/server/playbook";
import { requireCoach } from "@/server/teams";
import { TYPE_LABEL } from "@/teach/install";
import { PlaySvg } from "@/components/play-svg";
import { PrintButton } from "./print-button";

export const metadata = { title: "Print" };

const FORMATS = [
  ["cards", "Play cards"],
  ["wristband", "Wristband"],
  ["callsheet", "Call sheet"],
  ["scout", "Scout cards"],
] as const;
type Format = (typeof FORMATS)[number][0];

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/**
 * Print what a coach hands out: play cards, wristband inserts, a call sheet
 * and scout-team cards, for a game plan or for any set of plays found on the
 * Playbook. Numbers match between the wristband and the call sheet.
 */
export default async function Print({ params, searchParams }: PageProps<"/t/[teamId]/plays/print">) {
  const { teamId } = await params;
  const sp = await searchParams;
  const { team } = await requireCoach(teamId);
  const format: Format = (FORMATS.map((f) => f[0]) as string[]).includes(String(sp.format)) ? (sp.format as Format) : "cards";
  const plan = typeof sp.plan === "string" ? await getPlan(teamId, sp.plan) : null;

  // the plays: the game plan's, or what the Playbook's filters find
  let list: Array<{ id: string; name: string; data: PlayData; side: string }>;
  let title: string;
  const filter = filterFrom(sp);
  const q = typeof sp.q === "string" ? sp.q : "";
  if (plan) {
    list = (await planPlays(teamId, plan)).map((p) => ({ id: p.id, name: p.name, data: p.data, side: p.side ?? "offense" }));
    title = installNameFor(plan);
  } else {
    const rows = (await playbookPlays(teamId)).filter((r) => fits(r.facets, r.name, filter, q));
    list = rows.map((r) => ({ id: r.id, name: r.name, data: r.data, side: r.facets.side?.[0]?.value ?? "offense" }));
    title = team.installName && filter.install?.includes("in") ? team.installName : team.name;
  }
  const offense = list.filter((p) => p.side !== "defense");
  const numbered = list.map((p, i) => ({ ...p, n: i + 1 }));

  const per = [1, 2, 4, 6].includes(Number(sp.per)) ? Number(sp.per) : 4;
  const group = sp.group === "formation" || sp.group === "none" ? sp.group : "type";
  // scout look: from the plan's scouting first
  const covFromPlan = plan?.theyShow.find((k) => (COVERAGES as readonly string[]).includes(k));
  const coverage = ((COVERAGES as readonly string[]).includes(String(sp.coverage)) ? sp.coverage : (covFromPlan ?? "cover_3")) as Coverage;
  const frontFromPlan = plan?.theyShow.includes("odd") ? "3-4" : plan?.theyShow.includes("even") ? "4-3" : undefined;
  const front = typeof sp.front === "string" && (frontOk(sp.front) || (FRONTS as readonly string[]).includes(sp.front)) ? sp.front : (frontFromPlan ?? "4-3");

  const base = new URLSearchParams();
  if (plan) base.set("plan", plan.id);
  else for (const [k, v] of new URLSearchParams(filterQuery(filter, q))) base.append(k, v);
  const href = (more: Record<string, string>) => {
    const u = new URLSearchParams(base);
    for (const [k, v] of Object.entries({ format, per: String(per), group, front, coverage, ...more })) u.set(k, v);
    return `/t/${teamId}/plays/print?${u.toString()}`;
  };
  const opt = (on: boolean) => `px-2 py-1 text-sm ${on ? "bg-brand text-brand-ink" : "border border-line"}`;
  const cardName = (p: { name: string; n: number }) => `${p.n}. ${p.name}`;

  const toolbar = (
    <div className="no-print flex flex-col gap-3">
      <div>
        <Link href={plan ? `/t/${teamId}/gameplan?plan=${plan.id}` : `/t/${teamId}/plays${base.toString() ? `?${base.toString()}` : ""}`} className="text-sm text-muted underline">
          {plan ? "Back to the game plan" : "Back to the Playbook"}
        </Link>
        <h1 className="text-4xl">Print</h1>
        <p className="text-sm text-muted">
          {list.length} play{list.length === 1 ? "" : "s"}
          {plan ? ` in the plan vs ${plan.opponent}` : " from your Playbook (filter them there first to print just some)"}. Numbers match on the wristband and the call sheet.
        </p>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="What to print">
        {FORMATS.map(([f, label]) => (
          <Link key={f} href={href({ format: f })} className={opt(format === f)}>
            {label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {format === "cards" && (
          <>
            <span className="text-muted">Per page:</span>
            {[1, 2, 4, 6].map((n) => (
              <Link key={n} href={href({ per: String(n) })} className={opt(per === n)}>
                {n}
              </Link>
            ))}
          </>
        )}
        {format === "callsheet" && (
          <>
            <span className="text-muted">Group by:</span>
            {(
              [
                ["type", "Play type"],
                ["formation", "Formation"],
                ["none", "Just the list"],
              ] as const
            ).map(([g, label]) => (
              <Link key={g} href={href({ group: g })} className={opt(group === g)}>
                {label}
              </Link>
            ))}
          </>
        )}
        {format === "scout" && (
          <>
            <span className="text-muted">Their front:</span>
            {[...new Set([...BLOCK_FRONTS, ...FRONTS])].map((f) => (
              <Link key={f} href={href({ front: f })} className={opt(front === f)}>
                {f}
              </Link>
            ))}
            <span className="ml-2 text-muted">Coverage:</span>
            {COVERAGES.map((c) => (
              <Link key={c} href={href({ coverage: c })} className={opt(coverage === c)}>
                {lookLabel(c)}
              </Link>
            ))}
          </>
        )}
        <PrintButton />
      </div>
    </div>
  );

  if (!list.length)
    return (
      <div className="flex flex-col gap-4">
        {toolbar}
        <p className="card p-6 text-center text-muted">Nothing to print yet.</p>
      </div>
    );

  let body: React.ReactNode;
  if (format === "cards") {
    const cols = per >= 4 ? "grid-cols-2" : "grid-cols-1";
    body = chunk(numbered, per).map((page, i) => (
      <div key={i} className={`print-page grid ${cols} gap-3 pb-3`}>
        {page.map((p) => (
          <div key={p.id} className="print-avoid card flex flex-col gap-1 p-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{cardName(p)}</span>
              <span className="text-xs text-muted">{[p.data.blocking?.name, TYPE_LABEL[String(p.data.play_type)]].filter(Boolean).join(" · ")}</span>
            </div>
            <PlaySvg data={p.data} fit className="block w-full border border-line" />
            {p.data.coaching_points.length > 0 && (
              <ul className="list-disc pl-4 text-xs">
                {p.data.coaching_points.slice(0, 3).map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    ));
  } else if (format === "wristband") {
    // a panel for a wristband window: numbered calls in columns; print a sheet of them and cut
    const panel = (
      <div className="print-avoid border border-black p-1" style={{ width: "4.5in", minHeight: "2.75in" }}>
        <div className="flex justify-between text-[9px] font-bold uppercase">
          <span>{title}</span>
          <span>{list.length} calls</span>
        </div>
        <ol className="grid grid-cols-2 gap-x-2 text-[9px] leading-tight" style={{ gridAutoFlow: "column", gridTemplateRows: `repeat(${Math.ceil(numbered.length / 2)}, auto)` }}>
          {numbered.map((p) => (
            <li key={p.id} className="truncate">
              <b>{p.n}</b> {p.name}
            </li>
          ))}
        </ol>
      </div>
    );
    body = (
      <div className="flex flex-wrap gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>{panel}</div>
        ))}
      </div>
    );
  } else if (format === "callsheet") {
    const keyOf = (p: (typeof numbered)[number]) =>
      group === "none"
        ? "Calls"
        : group === "formation"
          ? p.data.formation.name && p.data.formation.name !== "unknown"
            ? p.data.formation.name.toUpperCase()
            : "Other"
          : p.side === "defense"
            ? "Defense"
            : (TYPE_LABEL[String(p.data.play_type)] ?? "Other");
    const groups = new Map<string, typeof numbered>();
    for (const p of numbered) groups.set(keyOf(p), [...(groups.get(keyOf(p)) ?? []), p]);
    body = (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink pb-1">
          <span className="text-2xl font-black uppercase">{title}</span>
          {plan && (
            <span className="text-xs">
              {plan.theyShow.length ? `Their D: ${plan.theyShow.map((k) => lookLabel(k)).join(", ")}` : ""}
              {plan.theyRun.length ? ` · Their O: ${plan.theyRun.map((k) => lookLabel(k)).join(", ")}` : ""}
            </span>
          )}
        </div>
        <div className="columns-2 gap-4 text-sm">
          {[...groups.entries()].map(([g, ps]) => (
            <div key={g} className="print-avoid mb-3 break-inside-avoid">
              <div className="border-b border-ink text-xs font-bold uppercase">{g}</div>
              <ul>
                {ps.map((p) => (
                  <li key={p.id} className="flex gap-2 border-b border-line py-0.5">
                    <span className="inline-block w-4 border border-ink" aria-hidden />
                    <b className="w-6 text-right">{p.n}</b>
                    <span>{p.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  } else {
    // scout cards: our play with the look the scout team shows, so the scout defense knows where to line up
    const blockFront = frontOk(front) ? front : null;
    const lookFront = ((FRONTS as readonly string[]).includes(front) ? front : "4-3") as Front;
    body = chunk(
      numbered.filter((p) => offense.some((o) => o.id === p.id)),
      2,
    ).map((page, i) => (
      <div key={i} className="print-page grid grid-cols-1 gap-3 pb-3">
        {page.map((p) => (
          <div key={p.id} className="print-avoid card flex flex-col gap-1 p-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">
                Scout: {front}, {lookLabel(coverage)}
              </span>
              <span className="text-sm">{cardName(p)}</span>
            </div>
            {p.data.blocking && blockFront ? (
              <PlaySvg data={p.data} blockFront={blockFront} fit className="block w-full border border-line" />
            ) : (
              <PlaySvg data={p.data} front={lookFront} coverage={coverage} className="block w-full border border-line" />
            )}
          </div>
        ))}
      </div>
    ));
  }

  return (
    <div className="flex flex-col gap-4">
      {toolbar}
      <div>{body}</div>
    </div>
  );
}
