"use client";
import { useState } from "react";
import { PlaySvg } from "@/components/play-svg";
import { COVERAGES, type PlayData } from "@/domain/play";
import { assignmentText, formationLabel, playerMatches } from "@/domain/quiz";
import { reactionLabel, term, type Terms } from "@/domain/terms";

export function PlayCards({ plays, position, terms, start = 0 }: { plays: Array<{ id: string; data: PlayData }>; position: string; terms: Terms; start?: number }) {
  const [i, setI] = useState(start);
  const [flip, setFlip] = useState(false);
  const [hideMine, setHideMine] = useState(true);
  const [k, setK] = useState(0);
  const p = plays[i]!;
  const d = p.data;
  const me = d.players.find((x) => playerMatches(x, [position]));
  const qb = position.toUpperCase() === "QB";
  const go = (n: number) => {
    setI((n + plays.length) % plays.length);
    setHideMine(true);
    setK((x) => x + 1);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm">
        <button className="btn btn-ghost px-3" onClick={() => go(i - 1)}>
          ←
        </button>
        <span className="text-muted">
          {i + 1} / {plays.length}
        </span>
        <button className="btn btn-ghost px-3" onClick={() => go(i + 1)}>
          →
        </button>
      </div>
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-3 pt-3">
          <div>
            <div className="text-lg font-bold">{d.name}</div>
            <div className="text-xs text-muted">{formationLabel(d)}</div>
          </div>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={flip} onChange={(e) => { setFlip(e.target.checked); setK((x) => x + 1); }} /> Flip
          </label>
        </div>
        <PlaySvg key={k} data={d} flip={flip} hide={me && hideMine ? "player" : "none"} highlight={me?.id} animate compact className="block w-full" />
      </div>
      {me && (
        <div className="card p-3">
          <div className="label">Your job</div>
          {hideMine ? (
            <button className="btn btn-accent w-full" onClick={() => { setHideMine(false); setK((x) => x + 1); }}>
              Think first — then tap to see it
            </button>
          ) : (
            <p className="text-lg font-semibold">{assignmentText(me, terms)}</p>
          )}
        </div>
      )}
      {qb && d.pass_details && (
        <div className="card flex flex-col gap-2 p-3 text-sm">
          <div>
            <div className="label">Presnap</div>
            <p>{d.pass_details.presnap_read}</p>
          </div>
          <div>
            <div className="label">Progression</div>
            <ol className="list-inside list-decimal">
              {d.pass_details.progression.map((s) => (
                <li key={s.player}>
                  <strong>{term(terms, "positions", s.player)}</strong> — {s.trigger}
                </li>
              ))}
            </ol>
          </div>
          {COVERAGES.some((c) => d.pass_details!.vs_coverage[c]) && (
            <div>
              <div className="label">Vs coverage</div>
              <ul>
                {COVERAGES.filter((c) => d.pass_details!.vs_coverage[c]).map((c) => (
                  <li key={c}>
                    <strong>{term(terms, "coverages", c)}:</strong> {term(terms, "positions", d.pass_details!.vs_coverage[c]!.target)} — {d.pass_details!.vs_coverage[c]!.why}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {d.option_details && (qb || /^(RB|F|H|B|R)$/i.test(position)) && (
        <div className="card flex flex-col gap-1 p-3 text-sm">
          <div className="label">Read: {term(terms, "read_keys", d.option_details.read_key)}</div>
          <p>
            <strong>Give:</strong> {d.option_details.give_rule}
          </p>
          <p>
            <strong>{d.play_type === "rpo" ? "Throw" : "Keep"}:</strong> {d.option_details.keep_rule}
          </p>
          {d.option_details.pitch_or_pass_rule && (
            <p>
              <strong>Pitch:</strong> {d.option_details.pitch_or_pass_rule}
            </p>
          )}
          <ul className="mt-1 text-xs text-muted">
            {d.option_details.decisions.map((x) => (
              <li key={x.reaction}>
                {reactionLabel(x.reaction)} → {x.action}
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.coaching_points.length > 0 && (
        <div className="card p-3 text-sm">
          <div className="label">Coaching points</div>
          <ul className="list-inside list-disc">
            {d.coaching_points.map((c, j) => (
              <li key={j}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
