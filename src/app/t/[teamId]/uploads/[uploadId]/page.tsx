import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { plays, uploadPages, uploads } from "@/db/schema";
import { requireCoach } from "@/server/teams";
import { UploadReview } from "./upload-review";

export const metadata = { title: "Check play boxes" };

export default async function UploadPage({ params }: PageProps<"/t/[teamId]/uploads/[uploadId]">) {
  const { teamId, uploadId } = await params;
  await requireCoach(teamId);
  if (!/^[0-9a-f-]{36}$/i.test(uploadId)) notFound();
  const [upload] = await db.select().from(uploads).where(and(eq(uploads.teamId, teamId), eq(uploads.id, uploadId)));
  if (!upload) notFound();
  const pages = await db
    .select()
    .from(uploadPages)
    .where(and(eq(uploadPages.teamId, teamId), eq(uploadPages.uploadId, uploadId)))
    .orderBy(asc(uploadPages.pageNo));
  const rows = await db
    .select({
      id: plays.id,
      pageId: plays.pageId,
      boxIndex: plays.boxIndex,
      name: plays.name,
      extraction: plays.extraction,
      extractionError: plays.extractionError,
      status: plays.status,
      archived: plays.archived,
    })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.uploadId, uploadId)))
    .orderBy(asc(plays.sort));
  return (
    <UploadReview
      teamId={teamId}
      upload={{ id: upload.id, filename: upload.filename, pageCount: upload.pageCount, status: upload.status }}
      pages={pages.map((p) => ({ id: p.id, pageNo: p.pageNo, width: p.width, height: p.height, imageKey: p.imageKey, boxes: p.boxes, confirmed: p.boxesConfirmed }))}
      plays={rows}
      canRead={false}
    />
  );
}
