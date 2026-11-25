"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageView } from "@/components/page-view";
import { VoiceButton } from "@/components/voice-button";
import { safeCall } from "@/lib/safe-call";
import type { PageRef } from "@/teach/page-images";
import { acceptSuggestionsAction, answerGapAction } from "../../actions";

interface Gap {
  id: string;
  question: string;
  why: string | null;
  suggestion: string | null;
  appliesTo: string[];
  page: PageRef | null;
  alsoIn: string[];
}

export function TopicGaps({ teamId, topicId, items, optional }: { teamId: string; topicId: string; items: Gap[]; optional: number }) {
  const router = useRouter();
  const [done, setDone] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = items.filter((g) => !done[g.id]);
  const suggested = left.filter((g) => g.suggestion);

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 ? (
        <p className="card p-3 text-sm text-muted">No questions waiting on this topic.</p>
      ) : (
        <>
          {suggested.length > 0 && (
            <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
              <span className="flex-1">
                Read RepWon&apos;s suggestions below. If they&apos;re right, accept {suggested.length === 1 ? "it" : `all ${suggested.length}`} at once.
              </span>
              <button
                className="btn btn-primary min-h-9 px-3"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  const r = await safeCall(() => acceptSuggestionsAction(teamId, topicId), "Saving");
                  setBusy(false);
                  if (!r.ok) return setError(r.error);
                  setDone((d) => ({ ...d, ...Object.fromEntries(suggested.map((g) => [g.id, "Accepted"])) }));
                  router.refresh();
                }}
              >
                Accept {suggested.length === 1 ? "suggestion" : `all ${suggested.length} suggestions`}
              </button>
            </div>
          )}
          {error && <p className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
          <ul className="flex flex-col gap-2">
            {items.map((g) =>
              done[g.id] ? (
                <li key={g.id} className="rounded-lg border border-dashed border-line px-3 py-2 text-sm text-muted">
                  {done[g.id]}: {g.question}
                </li>
              ) : (
                <GapCard key={g.id} teamId={teamId} gap={g} onDone={(label) => setDone((d) => ({ ...d, [g.id]: label }))} />
              ),
            )}
          </ul>
        </>
      )}
      {optional > 0 && (
        <Link href={`/t/${teamId}/teach/interview?topic=${topicId}&pile=optional`} className="self-start text-sm text-muted underline">
          {optional} optional question{optional === 1 ? "" : "s"} you can skip
        </Link>
      )}
    </div>
  );
}

function GapCard({ teamId, gap, onDone }: { teamId: string; gap: Gap; onDone: (label: string) => void }) {
  const [text, setText] = useState("");
  const [writing, setWriting] = useState(!gap.suggestion);
  const [showPage, setShowPage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: Parameters<typeof answerGapAction>[2], label: string) {
    setBusy(true);
    setError(null);
    const r = await safeCall(() => answerGapAction(teamId, gap.id, action), "Saving");
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onDone(label);
  }

  return (
    <li className="card flex flex-col gap-2 p-3 text-sm">
      <div className="font-semibold">{gap.question}</div>
      {gap.why && <div className="text-xs text-muted">Why players need it: {gap.why}</div>}
      {gap.alsoIn.length > 0 && <div className="text-xs text-muted">Your answer also covers: {gap.alsoIn.join(", ")}</div>}
      {gap.page && (
        <div>
          <button className="text-xs text-muted underline" onClick={() => setShowPage((s) => !s)}>
            {showPage ? "Hide" : "Show"} page {gap.page.pageNo}
          </button>
          {showPage && <PageView url={gap.page.url} width={gap.page.width} height={gap.page.height} className="mt-1 max-h-[55vh] w-full rounded border border-line" />}
        </div>
      )}
      {gap.suggestion && !writing && (
        <div className="rounded-lg bg-suggest-bg p-2">
          <div className="text-[11px] font-semibold text-suggest uppercase">RepWon&apos;s suggestion</div>
          <p>{gap.suggestion}</p>
        </div>
      )}
      {writing && (
        <div className="flex flex-col gap-2">
          <textarea className="input py-2" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer, the way you'd tell a player" />
          <div className="flex items-center gap-2">
            <VoiceButton onText={(t) => setText((x) => (x ? `${x} ${t}` : t))} />
            <button className="btn btn-primary ml-auto min-h-9 px-3" disabled={busy || !text.trim()} onClick={() => act({ kind: "answer", text }, "Answered")}>
              Save answer
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {gap.suggestion && !writing && (
          <>
            <button className="btn btn-primary min-h-9 px-3" disabled={busy} onClick={() => act({ kind: "approve" }, "Accepted")}>
              That&apos;s right
            </button>
            <button
              className="btn btn-ghost min-h-9 px-3"
              disabled={busy}
              onClick={() => {
                setText(gap.suggestion ?? "");
                setWriting(true);
              }}
            >
              Change it
            </button>
          </>
        )}
        <button className="btn btn-ghost min-h-9 px-3" disabled={busy} onClick={() => act({ kind: "skip" }, "Skipped")}>
          Skip
        </button>
      </div>
      {error && <p className="rounded-lg bg-bad-bg px-3 py-2 text-bad">{error}</p>}
    </li>
  );
}
