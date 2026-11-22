"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeCall } from "@/lib/safe-call";
import { findGapsAction, mergeTopicsAction, renameTopicAction, writeTopicAction } from "./actions";
import { InstallToggle } from "./install-button";
import { runAndWait } from "./wait-job";

interface Topic {
  id: string;
  name: string;
  pageNos: number[];
  gapsFound: boolean;
  generated: boolean;
  gapsOpen: number;
  gapsDone: number;
  drafts: number;
  reserve: number;
  live: number;
  inInstall: boolean;
}

export function TopicRow({ teamId, topic, others }: { teamId: string; topic: Topic; others: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(topic.name);

  type Res = { ok: true; status?: string; error?: string | null } | { ok: false; error: string };
  async function act(label: string, fn: () => Promise<Res>) {
    setBusy(label);
    setError(null);
    const r = await safeCall(fn, label);
    setBusy(null);
    if (!r.ok) setError(r.error);
    else if (r.status === "failed") setError(r.error ?? "That didn't finish.");
    router.refresh();
  }

  return (
    <li className="card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editing ? (
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setEditing(false);
              act("Renaming", () => renameTopicAction(teamId, topic.id, name));
            }}
          >
            <input className="input min-h-9" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <button className="btn btn-ghost min-h-9">Save</button>
          </form>
        ) : (
          <span className="flex items-baseline gap-2">
            <Link className="font-semibold underline-offset-2 hover:underline" href={`/t/${teamId}/teach/topic/${topic.id}`}>
              {topic.name}
            </Link>
            <span className="text-xs text-muted">p{topic.pageNos.join(", ")}</span>
            <button className="text-xs text-muted underline" onClick={() => setEditing(true)}>
              Rename
            </button>
          </span>
        )}
        <span className="text-xs text-muted">
          {topic.gapsOpen ? <span className="font-semibold text-warn">{topic.gapsOpen} questions for you · </span> : null}
          {topic.drafts ? <span className="font-semibold text-warn">{topic.drafts} to review · </span> : null}
          {topic.reserve ? <span>{topic.reserve} in reserve · </span> : null}
          {topic.live} live
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <InstallToggle teamId={teamId} topicId={topic.id} on={topic.inInstall} />
        <button className="btn btn-ghost min-h-9 px-3" disabled={!!busy} onClick={() => act("Finding gaps", () => runAndWait(teamId, () => findGapsAction(teamId, topic.id), "Finding gaps"))}>
          {busy === "Finding gaps" ? "Looking for gaps…" : topic.gapsFound ? "Find gaps again" : "1. Find gaps"}
        </button>
        {(topic.gapsOpen > 0 || topic.drafts > 0) && (
          <Link className="btn btn-accent min-h-9 px-3" href={`/t/${teamId}/teach/topic/${topic.id}`}>
            Go through it →
          </Link>
        )}
        <button
          className="btn btn-ghost min-h-9 px-3"
          disabled={!!busy}
          onClick={() => act("Writing", () => runAndWait(teamId, () => writeTopicAction(teamId, topic.id), "Writing"))}
          title={topic.gapsOpen ? "You can write now; unanswered questions are left out" : undefined}
        >
          {busy === "Writing" ? "Writing lessons and questions…" : topic.generated ? "Rewrite drafts" : "2. Write lessons & questions"}
        </button>
        {others.length > 0 && (
          <select
            className="ml-auto rounded-lg border border-line bg-card px-2 py-1.5 text-xs"
            value=""
            disabled={!!busy}
            onChange={(e) => {
              if (e.target.value && confirm(`Merge "${topic.name}" into "${others.find((o) => o.id === e.target.value)?.name}"?`))
                act("Merging", () => mergeTopicsAction(teamId, topic.id, e.target.value));
            }}
          >
            <option value="">Merge into…</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {busy && busy !== "Renaming" && busy !== "Merging" && <p className="mt-2 text-xs text-muted">This takes a minute or two. You can stay on this page.</p>}
      {error && <p className="mt-2 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
    </li>
  );
}
