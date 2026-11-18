/**
 * Library items (concepts, formations, terms, reading) stored as rows in
 * `plays` with kind != "play". Keyed per team by kind + name_key so that
 * pieces read from several pages merge into one item.
 *
 * No "server-only" import: the Netlify background reader imports this.
 * Every query is scoped by teamId; callers authorize first.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { plays } from "@/db/schema";
import {
  LIBRARY_KINDS,
  itemName,
  itemReadiness,
  mergeItem,
  nameKey,
  parseItem,
  type LibraryItem,
  type LibraryKind,
} from "@/domain/library";
import type { PageItems } from "@/domain/page-extraction";

export type ItemRow = typeof plays.$inferSelect;

export function rowItem(row: ItemRow): LibraryItem | null {
  if (!row.item || !(LIBRARY_KINDS as readonly string[]).includes(row.kind)) return null;
  return { kind: row.kind as LibraryKind, data: row.item } as LibraryItem;
}

function statusFor(item: LibraryItem, wasApproved: boolean): ItemRow["status"] {
  const r = itemReadiness(item);
  return wasApproved && r.complete ? "approved" : r.complete ? "draft" : "needs_coach_input";
}

export function pageItemsList(items: PageItems): LibraryItem[] {
  const out: LibraryItem[] = [];
  if (items.concept) out.push({ kind: "concept", data: items.concept });
  for (const f of items.formations) out.push({ kind: "formation", data: f });
  for (const t of items.terms) out.push({ kind: "term", data: t });
  if (items.reading) out.push({ kind: "reading", data: items.reading });
  return out;
}

/**
 * Store what one page produced. New names become new items; known names
 * merge into the existing item. A merge that changes an approved item sends
 * it back for review, so players are never quizzed on unreviewed content.
 */
export async function upsertItems(
  teamId: string,
  source: { id: string; uploadId: string | null; sourcePage: number | null; cropKey: string | null },
  items: LibraryItem[],
  database: Db = db,
) {
  const ids: string[] = [];
  for (const item of items) {
    const key = nameKey(itemName(item));
    if (!key) continue;
    const [existing] = await database
      .select()
      .from(plays)
      .where(and(eq(plays.teamId, teamId), eq(plays.kind, item.kind), eq(plays.nameKey, key)));
    if (existing) {
      const before = rowItem(existing);
      const merged = before ? mergeItem(before, item) : item;
      const changed = JSON.stringify(merged.data) !== JSON.stringify(existing.item);
      const pages = [...new Set([...existing.sourcePages, ...(source.sourcePage ? [source.sourcePage] : [])])].sort((a, b) => a - b);
      await database
        .update(plays)
        .set({
          item: merged.data,
          sourcePages: pages,
          archived: false,
          ...(changed ? { status: statusFor(merged, false), approvedAt: null, approvedBy: null } : {}),
        })
        .where(eq(plays.id, existing.id));
      ids.push(existing.id);
    } else {
      const [row] = await database
        .insert(plays)
        .values({
          teamId,
          kind: item.kind,
          item: item.data,
          name: itemName(item),
          nameKey: key,
          parentId: source.id,
          uploadId: source.uploadId,
          sourcePage: source.sourcePage,
          sourcePages: source.sourcePage ? [source.sourcePage] : [],
          cropKey: source.cropKey,
          extraction: "done",
          status: statusFor(item, false),
          sort: (source.sourcePage ?? 0) * 100 + ids.length,
        })
        .returning({ id: plays.id });
      ids.push(row!.id);
    }
  }
  return ids;
}

export async function listItems(teamId: string, kind?: LibraryKind, database: Db = db) {
  const where = [eq(plays.teamId, teamId), eq(plays.archived, false), inArray(plays.kind, kind ? [kind] : [...LIBRARY_KINDS])];
  return database.select().from(plays).where(and(...where)).orderBy(asc(plays.sort), asc(plays.name));
}

export async function approvedItems(teamId: string, database: Db = db) {
  return database
    .select()
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false), eq(plays.status, "approved"), inArray(plays.kind, [...LIBRARY_KINDS])))
    .orderBy(asc(plays.sort), asc(plays.name));
}

export async function getItem(teamId: string, id: string, database: Db = db): Promise<ItemRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await database
    .select()
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.id, id), inArray(plays.kind, [...LIBRARY_KINDS])));
  return row ?? null;
}

export async function saveItem(teamId: string, id: string, raw: unknown, database: Db = db) {
  const row = await getItem(teamId, id, database);
  if (!row) throw new Error("Item not found.");
  const kind = row.kind as LibraryKind;
  const data = parseItem(kind, raw);
  const item = { kind, data } as LibraryItem;
  const key = nameKey(itemName(item));
  if (!key) throw new Error("It needs a name.");
  const clash = await database
    .select({ id: plays.id })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.kind, kind), eq(plays.nameKey, key), sql`${plays.id} <> ${id}`));
  if (clash.length) throw new Error(`There's already a ${kind} named ${itemName(item)}. Rename one or delete the duplicate.`);
  const [saved] = await database
    .update(plays)
    .set({ item: data, name: itemName(item), nameKey: key, status: statusFor(item, row.status === "approved") })
    .where(eq(plays.id, id))
    .returning();
  return saved!;
}

export async function approveItem(teamId: string, id: string, userId: string, database: Db = db) {
  const row = await getItem(teamId, id, database);
  const item = row && rowItem(row);
  if (!row || !item) throw new Error("Item not found.");
  const r = itemReadiness(item);
  if (!r.complete) throw new Error(`Still needed: ${r.missing.join(", ")}`);
  await database.update(plays).set({ status: "approved", approvedAt: new Date(), approvedBy: userId }).where(eq(plays.id, id));
}

export async function unapproveItem(teamId: string, id: string, database: Db = db) {
  const row = await getItem(teamId, id, database);
  const item = row && rowItem(row);
  if (!row || !item) throw new Error("Item not found.");
  await database.update(plays).set({ status: statusFor(item, false), approvedAt: null, approvedBy: null }).where(eq(plays.id, id));
}

/** Approve every item of a kind whose checklist is complete; returns how many. */
export async function approveAllReady(teamId: string, kind: LibraryKind, userId: string, database: Db = db) {
  const rows = await database
    .select()
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.kind, kind), eq(plays.status, "draft"), eq(plays.archived, false)));
  const ready = rows.filter((r) => {
    const it = rowItem(r);
    return it && itemReadiness(it).complete;
  });
  if (ready.length)
    await database
      .update(plays)
      .set({ status: "approved", approvedAt: new Date(), approvedBy: userId })
      .where(inArray(plays.id, ready.map((r) => r.id)));
  return ready.length;
}

export async function archiveItem(teamId: string, id: string, database: Db = db) {
  await database
    .update(plays)
    .set({ archived: true, status: "draft", approvedAt: null })
    .where(and(eq(plays.teamId, teamId), eq(plays.id, id), inArray(plays.kind, [...LIBRARY_KINDS])));
}

export async function libraryCounts(teamId: string, database: Db = db) {
  const rows = await database
    .select({ kind: plays.kind, status: plays.status, n: sql<number>`count(*)::int` })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false), inArray(plays.kind, [...LIBRARY_KINDS])))
    .groupBy(plays.kind, plays.status);
  const out: Record<string, { total: number; approved: number; ready: number; needs: number }> = {};
  for (const k of LIBRARY_KINDS) out[k] = { total: 0, approved: 0, ready: 0, needs: 0 };
  for (const r of rows) {
    const o = out[r.kind]!;
    o.total += r.n;
    if (r.status === "approved") o.approved += r.n;
    else if (r.status === "draft") o.ready += r.n;
    else o.needs += r.n;
  }
  return out;
}
