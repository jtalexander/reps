/**
 * Run a Teach step for every topic of a team (local runs).
 *   NODE_OPTIONS=--conditions=react-server pnpm tsx scripts/teach-topics.ts <teamId> <gaps|write> [atOnce] [--missing]
 * --missing: only topics that haven't had this step yet (or whose last run failed).
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const [teamId, step, atOnce = "3", flag] = process.argv.slice(2);
  if (!teamId || (step !== "gaps" && step !== "write")) throw new Error("usage: teach-topics <teamId> <gaps|write> [atOnce] [--missing]");
  const { and, asc, eq } = await import("drizzle-orm");
  const { createDb } = await import("../src/db");
  const { topics } = await import("../src/db/teach-schema");
  const svc = await import("../src/teach/service");
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  try {
    let ts = await db.select().from(topics).where(and(eq(topics.teamId, teamId), eq(topics.archived, false))).orderBy(asc(topics.sort));
    if (flag === "--missing") ts = ts.filter((t) => (step === "gaps" ? !t.gapsFoundAt : !t.generatedAt));
    const queue = [...ts];
    let done = 0;
    const failed: string[] = [];
    const t0 = Date.now();
    await Promise.all(
      Array.from({ length: Number(atOnce) }, async () => {
        while (queue.length) {
          const t = queue.shift()!;
          const job = await svc.runJob((await svc.newJob(teamId, step === "gaps" ? "find_gaps" : "write_topic", t.id, db)).id, db);
          done++;
          if (job?.status !== "done") {
            failed.push(t.name);
            console.log(`FAILED ${t.name}: ${job?.error}`);
          }
          if (done % 5 === 0 || done === ts.length) console.log(`${done}/${ts.length} topics (${Math.round((Date.now() - t0) / 1000)}s)`);
        }
      }),
    );
    console.log(`done; failed: ${failed.length ? failed.join(", ") : "none"}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
