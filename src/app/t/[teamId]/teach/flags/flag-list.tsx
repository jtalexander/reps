"use client";
import { useState } from "react";
import { safeCall } from "@/lib/safe-call";
import type { PageRef } from "@/teach/page-images";
import { resolveFlagsAction } from "../actions";
import { QuestionCard, type QuestionItem } from "../review/review-queue";

interface Flagged {
  notes: Array<{ player: string; note: string | null }>;
  topic: string;
  status: string;
  item: QuestionItem;
}

export function FlagList({ teamId, items, pages }: { teamId: string; items: Flagged[]; pages: Record<number, PageRef> }) {
  const [done, setDone] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  if (items.length === 0) return <p className="card p-6 text-center text-muted">No flagged questions.</p>;
  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
      {items.map((f) =>
        done[f.item.id] ? (
          <p key={f.item.id} className="rounded-lg border border-dashed border-line px-3 py-2 text-sm text-muted">
            {done[f.item.id]}: {f.item.question.prompt}
          </p>
        ) : (
          <div key={f.item.id} className="flex flex-col gap-2">
            <ul className="flex flex-col gap-1 rounded-lg bg-warn-bg px-3 py-2 text-sm">
              {f.notes.map((n, i) => (
                <li key={i}>
                  <strong>{n.player}:</strong> {n.note ?? <span className="text-muted">no note</span>}
                </li>
              ))}
            </ul>
            <QuestionCard
              teamId={teamId}
              item={f.item}
              topic={f.topic}
              pages={pages}
              mode="flag"
              onDone={async (s) => {
                const r = await safeCall(() => resolveFlagsAction(teamId, f.item.id), "Saving");
                if (!r.ok) return setError(r.error);
                setDone((d) => ({ ...d, [f.item.id]: s === "fine" ? "Kept" : s === "approved" ? "Fixed" : "Taken off" }));
              }}
            />
          </div>
        ),
      )}
    </div>
  );
}
