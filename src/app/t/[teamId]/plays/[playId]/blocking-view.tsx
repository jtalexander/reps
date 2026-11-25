"use client";
/**
 * A run's blocking against each front: tap a front and see who every blocker
 * takes. Fronts the coach checked are marked; players are quizzed on those.
 */
import { useState } from "react";
import { PlaySvg } from "@/components/play-svg";
import { resolveBlocking, ROLE_LABEL, ruleWhy, type BlockFront } from "@/domain/blocking";
import type { PlayData } from "@/domain/play";

export function BlockingView({ teamId, playId, data, fronts }: { teamId: string; playId: string; data: PlayData; fronts: BlockFront[] }) {
  const b = data.blocking!;
  const list = [...new Set([...(fronts.includes(b.front as BlockFront) ? [] : [b.front as BlockFront]), ...fronts])];
  const [front, setFront] = useState<BlockFront>((list.includes(b.front as BlockFront) ? b.front : list[0]) as BlockFront);
  const r = resolveBlocking(data, b, front);
  const label = (id: string | null) => (id ? (r.defenders.find((d) => d.id === id)?.label ?? id) : "no one");
  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl">Blocking: {b.name}</h2>
        <a className="text-sm underline" href={`/t/${teamId}/plays/build?play=${playId}`}>
          Fix a block
        </a>
      </div>
      <div className="flex flex-wrap gap-1 text-sm" role="group" aria-label="Against">
        {list.map((f) => (
          <button key={f} onClick={() => setFront(f)} className={`px-2 py-1 ${front === f ? "bg-brand text-brand-ink" : "border border-line"}`} aria-pressed={front === f}>
            {f}
            {b.checked.includes(f) ? " ✓" : ""}
          </button>
        ))}
      </div>
      <PlaySvg data={data} blockFront={front} fit className="block w-full" />
      <ul className="grid gap-1 text-sm sm:grid-cols-2">
        {r.blocks.map((x) => (
          <li key={x.id}>
            <span className="font-semibold">{x.id}</span> ({ROLE_LABEL[x.role]}): <span className="font-semibold">{label(x.target)}</span>
            <span className="text-muted"> · {x.fixed ? "your fix" : ruleWhy(x.rule)}</span>
          </li>
        ))}
      </ul>
      {!b.checked.includes(front) && <p className="text-xs text-muted">Not checked against the {front} yet. Players are only quizzed on fronts you check in the builder.</p>}
    </section>
  );
}
