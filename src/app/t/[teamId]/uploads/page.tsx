import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { plays, uploads } from "@/db/schema";
import { hasApiKey } from "@/ingest/extract";
import { requireCoach } from "@/server/teams";
import { UploadForm } from "./upload-form";

export const metadata = { title: "Upload a playbook" };

export default async function Uploads({ params }: PageProps<"/t/[teamId]/uploads">) {
  const { teamId } = await params;
  await requireCoach(teamId);
  const list = await db
    .select({
      upload: uploads,
      plays: sql<number>`(select count(*)::int from ${plays} where ${plays.uploadId} = ${uploads.id} and not ${plays.archived})`,
    })
    .from(uploads)
    .where(eq(uploads.teamId, teamId))
    .orderBy(desc(uploads.createdAt));
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Upload a playbook</h1>
        <p className="mt-1 text-sm text-muted">
          A PDF from Hudl or similar. Each page can hold 1 to 8 plays. Reps splits the pages, you check the boxes, then it reads every play.
        </p>
      </div>
      {!hasApiKey() && (
        <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
          The server has no Anthropic API key yet. Uploads still split into plays, but you&apos;ll enter each play by hand until the key is set.
        </p>
      )}
      <UploadForm teamId={teamId} />
      {list.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Uploads</h2>
          <ul className="flex flex-col gap-2">
            {list.map(({ upload, plays: n }) => (
              <li key={upload.id}>
                <Link href={`/t/${teamId}/uploads/${upload.id}`} className="card flex items-center justify-between gap-3 p-3 hover:border-ink">
                  <span className="truncate font-medium">{upload.filename}</span>
                  <span className="shrink-0 text-sm text-muted">
                    {upload.status === "uploading"
                      ? "upload didn't finish"
                      : upload.status === "failed"
                        ? upload.error ?? "failed"
                        : `${upload.pageCount} pages · ${n} plays${upload.status === "rendering" ? " · not finished" : ""}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
