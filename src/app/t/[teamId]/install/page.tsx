import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { topics } from "@/db/teach-schema";
import { requireCoach } from "@/server/teams";
import { installPlays, TYPE_LABEL, type InstallPlay } from "@/teach/install";
import { ClearInstall, InstallToggle } from "../teach/install-button";
import { Filters, InstallName, PickList, RemovePlay, type FilterOption } from "./install-client";

export const metadata = { title: "Install" };

/** How many plays to draw at once; the filters narrow the rest. */
const SHOW = 60;

const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 80) : "");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9#-]+/g, " ").trim();
const NONE = "none";

/** Count a tag's values over the plays, for one filter's dropdown (A to Z). */
function options(ps: InstallPlay[], get: (p: InstallPlay) => [string, string] | null, none?: string): FilterOption[] {
  const m = new Map<string, FilterOption>();
  for (const p of ps) {
    const v = get(p) ?? (none ? ([NONE, none] as [string, string]) : null);
    if (!v) continue;
    const o = m.get(v[0]) ?? { value: v[0], label: v[1], n: 0 };
    o.n++;
    m.set(v[0], o);
  }
  return [...m.values()].sort((a, b) => Number(a.value === NONE) - Number(b.value === NONE) || a.label.localeCompare(b.label));
}

const tagLine = (p: InstallPlay) =>
  [p.tags.formation, p.tags.motion, p.tags.conceptLabel, TYPE_LABEL[p.tags.type]].filter(Boolean).join(" · ") || "Reps couldn't tell its formation or concept";

/**
 * This week's install: name it, see what's in it, and pick plays one by one,
 * found by formation, motion, concept and type.
 */
export default async function Install({ params, searchParams }: PageProps<"/t/[teamId]/install">) {
  const { teamId } = await params;
  const sp = await searchParams;
  const { team } = await requireCoach(teamId);
  const all = await installPlays(teamId);
  const wholeTopics = await db
    .select({ id: topics.id, name: topics.name })
    .from(topics)
    .where(and(eq(topics.teamId, teamId), eq(topics.inInstall, true), eq(topics.archived, false)))
    .orderBy(asc(topics.sort));

  const f = { formation: str(sp.formation), motion: str(sp.motion), concept: str(sp.concept), type: str(sp.type), q: str(sp.q) };
  const fits = (p: InstallPlay) =>
    (!f.formation || p.tags.formation === f.formation) &&
    (!f.motion || (f.motion === NONE ? p.tags.motion === null : p.tags.motion === f.motion)) &&
    (!f.concept || p.tags.concept === f.concept) &&
    (!f.type || p.tags.type === f.type) &&
    (!f.q || norm(f.q).split(" ").every((w) => norm(`${p.name} ${tagLine(p)} ${p.topicName ?? ""}`).includes(w)));
  const shown = all.filter(fits);
  const inInstall = all.filter((p) => p.picked || p.viaTopic);
  const picked = all.filter((p) => p.picked);
  const total = inInstall.length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-4xl">{team.installName || "This week's install"}</h1>
        <p className="text-sm text-muted">
          Pick the plays you&apos;re putting in this week. Your players get them first in their play quizzes, Draw my job and play cards, with the lessons from their topics.
        </p>
      </div>

      <section className="card flex flex-col gap-3 p-4">
        <InstallName teamId={teamId} name={team.installName} />
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3">
          <span className="font-semibold">
            In the install · {total} play{total === 1 ? "" : "s"}
            {wholeTopics.length ? ` · ${wholeTopics.length} whole topic${wholeTopics.length === 1 ? "" : "s"}` : ""}
          </span>
          {(total > 0 || wholeTopics.length > 0 || team.installName) && <ClearInstall teamId={teamId} count={picked.length + wholeTopics.length} />}
        </div>
        {total === 0 && wholeTopics.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet. Find plays below, tick them, and tap Add.</p>
        ) : (
          <>
            {wholeTopics.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {wholeTopics.map((t) => (
                  <span key={t.id} className="flex items-center gap-2 border border-line px-2 py-1 text-sm">
                    <Link href={`/t/${teamId}/teach/topic/${t.id}`} className="underline">
                      {t.name}
                    </Link>
                    <InstallToggle teamId={teamId} topicId={t.id} on />
                  </span>
                ))}
              </div>
            )}
            {picked.length > 0 && (
              <ul className="flex flex-col text-sm">
                {picked.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 border-t border-line py-1.5">
                    <span className="min-w-0">
                      <Link href={`/t/${teamId}/plays/${p.id}`} className="font-semibold underline">
                        {p.name}
                      </Link>
                      <span className="block text-xs text-muted">
                        {tagLine(p)}
                        {!p.approved && <span className="text-warn"> · not approved yet</span>}
                      </span>
                    </span>
                    <RemovePlay teamId={teamId} id={p.id} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Pick plays</h2>
        {all.length === 0 ? (
          <p className="card p-4 text-sm text-muted">
            No real plays yet. Convert your playbook&apos;s drawings on{" "}
            <Link className="underline" href={`/t/${teamId}/plays/converted`}>
              Real plays
            </Link>{" "}
            or{" "}
            <Link className="underline" href={`/t/${teamId}/plays/build`}>
              draw a play
            </Link>
            , then pick them here.
          </p>
        ) : (
          <>
            <Filters
              teamId={teamId}
              current={f}
              formations={options(all, (p) => (p.tags.formation ? [p.tags.formation, p.tags.formation] : null))}
              motions={options(all, (p) => (p.tags.motion ? [p.tags.motion, p.tags.motion] : null), "No motion")}
              concepts={options(all, (p) => (p.tags.concept ? [p.tags.concept, p.tags.conceptLabel ?? p.tags.concept] : null))}
              types={options(all, (p) => (p.tags.type !== "unknown" ? [p.tags.type, TYPE_LABEL[p.tags.type] ?? p.tags.type] : null))}
            />
            <p className="text-sm text-muted">
              {shown.length === 0
                ? "No plays fit those filters."
                : `${shown.length} play${shown.length === 1 ? "" : "s"}${shown.length > SHOW ? `; showing the first ${SHOW}, narrow it with the filters` : ""}. Tap plays to tick them.`}
            </p>
            <PickList
              key={JSON.stringify(f)}
              teamId={teamId}
              rows={shown.slice(0, SHOW).map((p) => ({
                id: p.id,
                name: p.name,
                tags: tagLine(p),
                approved: p.approved,
                picked: p.picked,
                topicName: p.topicName,
                viaTopic: p.viaTopic,
                data: p.data,
              }))}
            />
          </>
        )}
      </section>
    </div>
  );
}
