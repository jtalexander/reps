import Link from "next/link";
import type { NamingStatus } from "@/teach/naming-auto";
import { AutoRefresh } from "../converted/converted-client";

/** Where the naming rules stand, and the one thing for the coach to do about it. */
export function NamingCard({ teamId, status }: { teamId: string; status: NamingStatus }) {
  const check = `/t/${teamId}/plays/naming/check`;
  switch (status.state) {
    case "drafting":
      return (
        <div className="card flex flex-col gap-1 p-4">
          <AutoRefresh waiting={1} />
          <span className="font-semibold">Writing down your naming rules…</span>
          <span className="text-sm text-muted">
            Reps is pulling your position letters, formations, tags, motions and play names out of the playbook. It takes a minute or two; this page updates when it&apos;s ready.
          </span>
        </div>
      );
    case "draft":
      return (
        <Link href={check} className="card flex items-center justify-between gap-3 border-brand p-4 hover:border-ink">
          <span>
            <span className="block font-semibold">Check your naming rules · about 2 minutes</span>
            <span className="block text-sm text-muted">
              Reps wrote down how your offense names things. Tap Yes on what&apos;s right and fix what isn&apos;t. Reps uses it to name your plays.
            </span>
          </span>
          <span aria-hidden>→</span>
        </Link>
      );
    case "confirmed":
      return (
        <p className="text-sm text-muted">
          <span className="font-semibold text-ok">Naming rules confirmed.</span>{" "}
          <Link href={`/t/${teamId}/plays/naming`} className="underline">
            Edit them
          </Link>
        </p>
      );
    case "failed":
      return (
        <div className="card flex flex-col gap-1 border-warn p-4">
          <span className="font-semibold">Reps couldn&apos;t write down your naming rules</span>
          <span className="text-sm text-muted">{status.error}</span>
          <Link href={`/t/${teamId}/plays/naming`} className="text-sm underline">
            Try again
          </Link>
        </div>
      );
    default:
      return null;
  }
}
