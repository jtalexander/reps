import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { plays } from "@/db/schema";
import { groupByFront } from "@/domain/fronts";
import { requireCoach } from "@/server/teams";
import { conversionProgress } from "@/teach/convert-run";
import { playbookDrawings } from "@/teach/drawings";
import { mediaUrl } from "@/teach/page-images";
import { ApproveTopicButton, AutoRefresh, ConvertButton, PlayCompare } from "./converted-client";

export const metadata = { title: "Real plays" };

/**
 * Turning the playbook's drawings into real Reps plays, topic by topic:
 * convert (install first), check each topic side by side, approve it.
 */
export default async function Converted({ params, searchParams }: PageProps<"/t/[teamId]/plays/converted">) {
  const { teamId } = await params;
  const { topic: topicId } = await searchParams;
  const { team } = await requireCoach(teamId);
  const drawings = await playbookDrawings(teamId);
  const rows = await db
    .select()
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false), sql`${plays.aiRaw}->>'drawingKey' is not null`))
    .orderBy(asc(plays.sort));
  const byKey = new Map(rows.map((r) => [(r.aiRaw as { drawingKey: string }).drawingKey, r]));
  const progress = await conversionProgress(teamId);

  // topics in playbook order, install first
  const topics = new Map<string, { id: string; name: string; inInstall: boolean; keys: string[] }>();
  for (const d of drawings) {
    if (!d.topicId) continue;
    const t = topics.get(d.topicId) ?? { id: d.topicId, name: d.topicName ?? "", inInstall: d.inInstall, keys: [] };
    t.keys.push(d.key);
    topics.set(d.topicId, t);
  }
  const list = [...topics.values()].sort((a, b) => Number(b.inInstall) - Number(a.inInstall));
  const stat = (keys: string[]) => {
    const made = keys.map((k) => byKey.get(k)).filter((r) => r !== undefined);
    return {
      total: keys.length,
      made: made.length,
      approved: made.filter((r) => r.status === "approved").length,
      toCheck: made.filter((r) => r.status !== "approved" && r.extraction === "done").length,
    };
  };
  const banner = (
    <>
      <AutoRefresh waiting={progress.waiting} />
      {progress.waiting > 0 && (
        <p className="border border-brand px-3 py-2 text-sm">
          Reps is converting {progress.waiting} drawing{progress.waiting === 1 ? "" : "s"}. This page updates as they finish; you can leave and come back.
        </p>
      )}
      {progress.failed > 0 && progress.waiting === 0 && (
        <p className="bg-warn-bg px-3 py-2 text-sm text-warn">
          {progress.failed} drawing{progress.failed === 1 ? "" : "s"} couldn&apos;t be converted today. Tap Convert on the topic to try them again.
        </p>
      )}
    </>
  );

  const t = typeof topicId === "string" ? topics.get(topicId) : undefined;
  if (t) {
    const s = stat(t.keys);
    const items = t.keys.flatMap((k) => {
      const r = byKey.get(k);
      return r ? [{ id: r.id, name: r.name, page: r.sourcePage, cropUrl: r.cropKey ? mediaUrl(r.cropKey) : null, data: r.data, status: r.status, extraction: r.extraction }] : [];
    });
    const groups = groupByFront(items, team.groupFronts);
    return (
      <div className="flex flex-col gap-4">
        <div>
          <Link href={`/t/${teamId}/plays/converted`} className="text-sm text-muted underline">
            Real plays
          </Link>
          <h1 className="text-4xl">{t.name}</h1>
          <p className="text-sm text-muted">
            {s.made} of {s.total} drawings converted · {s.approved} approved. Left is your page, right is Reps&apos; play. Fix anything off, then approve the topic.
          </p>
        </div>
        {banner}
        <div className="flex flex-wrap items-center gap-3">
          <ApproveTopicButton teamId={teamId} topicId={t.id} count={s.toCheck} />
          {s.made < s.total && progress.waiting === 0 && (
            <ConvertButton teamId={teamId} which={[t.id]} label={`Convert ${s.total - s.made} drawing${s.total - s.made === 1 ? "" : "s"}`} className="btn btn-outline" />
          )}
        </div>
        <ul className="flex flex-col gap-3">
          {groups.map((g) => (
            <li key={g.items[0]!.id}>
              <PlayCompare teamId={teamId} title={g.base} page={g.items[0]!.page} versions={g.items} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const install = list.filter((x) => x.inInstall);
  const installLeft = install.reduce((n, x) => n + x.keys.filter((k) => !byKey.has(k)).length, 0);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/t/${teamId}/plays`} className="text-sm text-muted underline">
          Playbook
        </Link>
        <h1 className="text-4xl">Real plays</h1>
        <p className="text-sm text-muted">
          Reps turns each drawing into a real play: every player&apos;s spot and assignment, so it can flip it, quiz it and draw it against a defense. Convert a topic, check
          it next to your pages, then approve it.{" "}
          <Link className="underline" href={`/t/${teamId}/plays/naming`}>
            Naming rules
          </Link>{" "}
          give the players your letters.
        </p>
      </div>
      {banner}
      {install.length > 0 && installLeft > 0 && progress.waiting === 0 && (
        <ConvertButton teamId={teamId} which="install" label={`Convert this week's install (${installLeft} drawing${installLeft === 1 ? "" : "s"})`} />
      )}
      {install.length === 0 && <p className="text-sm text-muted">Tip: put topics in this week&apos;s install on Teach and they come first here.</p>}
      <ul className="flex flex-col gap-2">
        {list.map((x) => {
          const s = stat(x.keys);
          return (
            <li key={x.id} className="card flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <Link href={`/t/${teamId}/plays/converted?topic=${x.id}`} className="font-semibold underline">
                  {x.name}
                </Link>
                {x.inInstall && <span className="ml-2 bg-brand px-1.5 py-0.5 align-middle font-label text-[10px] font-bold tracking-widest text-brand-ink uppercase">Install</span>}
                <div className="text-xs text-muted">
                  {s.made} of {s.total} converted · {s.approved} approved{s.toCheck ? ` · ${s.toCheck} to check` : ""}
                </div>
              </div>
              {s.made < s.total && progress.waiting === 0 && <ConvertButton teamId={teamId} which={[x.id]} label="Convert" className="btn btn-outline" />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
