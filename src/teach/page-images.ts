/** Where each decoded page's image lives, for showing pages and diagrams. */
import { and, desc, eq } from "drizzle-orm";
import { db, type Db } from "@/db";
import { uploadPages } from "@/db/schema";
import { teachPages } from "@/db/teach-schema";

export interface PageRef {
  pageNo: number;
  url: string;
  width: number;
  height: number;
}

export const mediaUrl = (key: string) => `/media/${key.split("/").map(encodeURIComponent).join("/")}`;

export async function pageRefs(teamId: string, database: Db = db): Promise<Record<number, PageRef>> {
  const rows = await database
    .select({ pageNo: teachPages.pageNo, imageKey: uploadPages.imageKey, width: uploadPages.width, height: uploadPages.height })
    .from(teachPages)
    .innerJoin(uploadPages, eq(uploadPages.id, teachPages.pageId))
    .where(and(eq(teachPages.teamId, teamId)))
    .orderBy(desc(teachPages.createdAt));
  const out: Record<number, PageRef> = {};
  for (const r of rows) if (!out[r.pageNo]) out[r.pageNo] = { pageNo: r.pageNo, url: mediaUrl(r.imageKey), width: r.width, height: r.height };
  return out;
}
