/**
 * Read pages of an uploaded playbook with Teach (local runs).
 *   NODE_OPTIONS=--conditions=react-server pnpm tsx scripts/teach-read.ts <teamId> <uploadId> <pages e.g. 1-138> [atOnce]
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const [teamId, uploadId, spec, atOnce = "3"] = process.argv.slice(2);
  if (!teamId || !uploadId || !spec) throw new Error("usage: teach-read <teamId> <uploadId> <pages> [atOnce]");
  const pages = spec.split(",").flatMap((part) => {
    const [a, b] = part.split("-").map(Number);
    return b ? Array.from({ length: b - a! + 1 }, (_, i) => a! + i) : [a!];
  });
  const { and, eq } = await import("drizzle-orm");
  const { createDb } = await import("../src/db");
  const { uploadPages } = await import("../src/db/schema");
  const { teachPages } = await import("../src/db/teach-schema");
  const { renderPages } = await import("../src/server/ingest");
  const svc = await import("../src/teach/service");
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  try {
    const have = new Set((await db.select({ n: uploadPages.pageNo }).from(uploadPages).where(and(eq(uploadPages.teamId, teamId), eq(uploadPages.uploadId, uploadId)))).map((r) => r.n));
    for (const n of pages) if (!have.has(n)) await renderPages(teamId, uploadId, n, n, db);
    const ids = await svc.prepareDecode(teamId, uploadId, pages, db);
    const queue = [...ids];
    let done = 0;
    const t0 = Date.now();
    const tally: Record<string, number> = {};
    await Promise.all(
      Array.from({ length: Number(atOnce) }, async () => {
        while (queue.length) {
          const id = queue.shift()!;
          const job = await svc.runJob((await svc.newJob(teamId, "decode_page", id, db)).id, db);
          const [p] = await db.select().from(teachPages).where(eq(teachPages.id, id));
          done++;
          tally[p!.status] = (tally[p!.status] ?? 0) + 1;
          if (job?.status === "failed") console.log(`p${p!.pageNo} FAILED: ${job.error}`);
          if (done % 10 === 0 || done === ids.length) console.log(`${done}/${ids.length} pages (${Math.round((Date.now() - t0) / 1000)}s) ${JSON.stringify(tally)}`);
        }
      }),
    );
    const overview = await svc.topicOverview(teamId, db);
    console.log(`\n${overview.length} topics:`);
    for (const t of overview) console.log(`- ${t.name} [p${t.pageNos.join(",")}]`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
