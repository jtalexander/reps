"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PlaySvg } from "@/components/play-svg";
import type { PlayData } from "@/domain/play";
import { safeCall } from "@/lib/safe-call";
import { approveAction, unapproveAction } from "../../actions";
import { approveConvertedTopicAction, convertTopicsAction, retryConversionAction } from "../../teach/actions";

/** Queue a topic's (or the install's) drawings, a batch at a time until all are queued. */
export function ConvertButton({ teamId, which, label, className = "btn btn-primary" }: { teamId: string; which: "install" | string[]; label: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          let total = 0;
          let failed = 0;
          for (let round = 0; round < 20; round++) {
            const r = await safeCall(() => convertTopicsAction(teamId, which), "Converting");
            if (!r.ok) {
              setMsg(r.error);
              break;
            }
            total += r.queued;
            failed += r.failed;
            if (r.left <= 0 || r.queued === 0) break;
          }
          setBusy(false);
          setMsg(total ? `Converting ${total} drawing${total === 1 ? "" : "s"}${failed ? ` (${failed} couldn't be cut out of the page)` : ""}. This page updates as they finish.` : "Nothing left to convert there.");
          router.refresh();
        }}
      >
        {busy ? "Getting the drawings ready…" : label}
      </button>
      {msg && <span className="text-sm text-muted">{msg}</span>}
    </span>
  );
}

/** Approve every converted play in a topic. */
export function ApproveTopicButton({ teamId, topicId, count }: { teamId: string; topicId: string; count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (count === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await safeCall(() => approveConvertedTopicAction(teamId, topicId), "Approving");
          setBusy(false);
          setMsg(r.ok ? `Approved ${r.approved}.` : r.error);
          router.refresh();
        }}
      >
        {busy ? "Approving…" : `Looks right: approve ${count} play${count === 1 ? "" : "s"}`}
      </button>
      {msg && <span className="text-sm text-muted">{msg}</span>}
    </span>
  );
}

/** While conversions are running, refresh the page every few seconds. */
export function AutoRefresh({ waiting }: { waiting: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [waiting, router]);
  return null;
}

export interface Version {
  id: string;
  name: string;
  front: string | null;
  cropUrl: string | null;
  data: PlayData | null;
  status: string;
  extraction: string;
}

/** One play (or one play with a version per front): the page on the left, RepWon's play on the right. */
export function PlayCompare({ teamId, title, page, versions }: { teamId: string; title: string; page?: number | null; versions: Version[] }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const v = versions[Math.min(i, versions.length - 1)]!;
  const approved = versions.filter((x) => x.status === "approved").length;
  return (
    <div className="card flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <span className="font-semibold">{title}</span>
        <span className="text-xs text-muted">
          {page ? `page ${page} · ` : ""}
          {versions.length > 1 ? `${versions.length} fronts · ` : ""}
          {approved === versions.length ? "approved" : approved ? `${approved} approved` : "to check"}
        </span>
      </div>
      {versions.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {versions.map((x, j) => (
            <button
              key={x.id}
              onClick={() => setI(j)}
              className={`px-2 py-1 font-label text-[11px] font-bold tracking-widest uppercase ${j === i ? "bg-brand text-brand-ink" : "border border-line"}`}
            >
              vs {x.front ?? "base"}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {v.cropUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.cropUrl} alt="Your drawing" className="w-full border border-line bg-white object-contain" />
        ) : (
          <div />
        )}
        {v.data ? (
          <PlaySvg data={v.data} fit className="w-full border border-line" />
        ) : (
          <div className="flex items-center justify-center border border-line p-4 text-center text-sm text-muted">
            {v.extraction === "not_a_play" ? "Not a play drawing" : "Couldn't read it"}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 px-1 text-sm">
        {v.data &&
          (v.status === "approved" ? (
            <span className="flex items-center gap-2">
              <span className="font-semibold text-ok">Approved</span>
              <button
                className="text-muted underline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await safeCall(() => unapproveAction(teamId, v.id), "Unapproving");
                  setBusy(false);
                  router.refresh();
                }}
              >
                Unapprove
              </button>
            </span>
          ) : (
            <button
              className="btn btn-primary px-3 py-1"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await safeCall(() => approveAction(teamId, v.id), "Approving");
                setBusy(false);
                if (!r.ok) alert(r.error);
                router.refresh();
              }}
            >
              Approve{versions.length > 1 ? ` vs ${v.front ?? "base"}` : ""}
            </button>
          ))}
        {v.data && (
          <Link className="underline" href={`/t/${teamId}/plays/${v.id}`}>
            Fix it
          </Link>
        )}
        <button
          className="text-muted underline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await safeCall(() => retryConversionAction(teamId, v.id), "Reading again");
            setBusy(false);
            router.refresh();
          }}
        >
          Have RepWon read it again
        </button>
      </div>
    </div>
  );
}
