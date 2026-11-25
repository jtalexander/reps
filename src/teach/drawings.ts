/**
 * The playbook's drawings, as Teach found them: every labeled diagram region
 * on every page RepWon read (formations, plays, blocking against fronts), filed
 * under the topic that page belongs to. Nothing here costs an AI call; it's
 * what decodePage already stored.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { db, type Db } from "@/db";
import { teachPages, topics } from "@/db/teach-schema";
import type { Box, Fact } from "./types";

export interface Drawing {
  /** `${pageNo}.${diagram id}`, stable while the page isn't read again */
  key: string;
  pageNo: number;
  label: string;
  box: Box;
  topicId: string | null;
  topicName: string | null;
  inInstall: boolean;
}

export interface DrawingPage {
  pageNo: number;
  section: string | null;
  summary: string | null;
  facts: Fact[];
  drawings: Drawing[];
}

/** Read pages by page number (the latest read of each), with their drawings. */
export async function playbookPages(teamId: string, database: Db = db): Promise<DrawingPage[]> {
  const rows = await database
    .select()
    .from(teachPages)
    .where(and(eq(teachPages.teamId, teamId), eq(teachPages.status, "decoded")))
    .orderBy(desc(teachPages.createdAt));
  const ts = await database.select().from(topics).where(and(eq(topics.teamId, teamId), eq(topics.archived, false))).orderBy(asc(topics.sort));
  // a page can sit under more than one topic after a merge; file it under the first
  const topicOf = new Map<number, (typeof ts)[number]>();
  for (const t of ts) for (const p of t.pageNos) if (!topicOf.has(p)) topicOf.set(p, t);
  const seen = new Set<number>();
  const out: DrawingPage[] = [];
  for (const r of rows) {
    if (seen.has(r.pageNo)) continue;
    seen.add(r.pageNo);
    const t = topicOf.get(r.pageNo) ?? null;
    out.push({
      pageNo: r.pageNo,
      section: r.section,
      summary: r.summary,
      facts: r.facts,
      drawings: r.diagrams
        .filter((d) => d.box.w > 0 && d.box.h > 0)
        .map((d) => ({
          key: `${r.pageNo}.${d.id}`,
          pageNo: r.pageNo,
          label: d.label.trim() || `Page ${r.pageNo} drawing`,
          box: d.box,
          topicId: t?.id ?? null,
          topicName: t?.name ?? null,
          inInstall: t?.inInstall ?? false,
        })),
    });
  }
  return out.sort((a, b) => a.pageNo - b.pageNo);
}

/** Every drawing, in playbook order. */
export async function playbookDrawings(teamId: string, database: Db = db): Promise<Drawing[]> {
  return (await playbookPages(teamId, database)).flatMap((p) => p.drawings);
}

/** Case- and punctuation-blind match on a drawing's label, topic or page section. */
export function matches(d: Drawing, q: string) {
  // keep "-" so "4-3" doesn't also match "3-4"
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9#-]+/g, " ").trim();
  const want = norm(q);
  if (!want) return true;
  const hay = norm(`${d.label} ${d.topicName ?? ""}`);
  return want.split(" ").every((w) => hay.includes(w));
}
