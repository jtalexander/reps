/**
 * Pilot helper (local): load a playbook into a team and run Teach steps.
 *   NODE_OPTIONS=--conditions=react-server pnpm tsx scripts/pilot.ts decode <file.pdf> <pages e.g. 5-10,11,27>
 *   NODE_OPTIONS=--conditions=react-server pnpm tsx scripts/pilot.ts gaps
 *   NODE_OPTIONS=--conditions=react-server pnpm tsx scripts/pilot.ts write
 * The pilot team is "Spread pilot" (join code PILOT1), owned by SEED_COACH_EMAIL.
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

const POOL = 3;

async function pool<T>(items: T[], fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: POOL }, async () => {
    while (queue.length) await fn(queue.shift()!);
  }));
}

function parsePages(spec: string): number[] {
  return spec.split(",").flatMap((part) => {
    const [a, b] = part.split("-").map(Number);
    return b ? Array.from({ length: b - a! + 1 }, (_, i) => a! + i) : [a!];
  });
}

async function main() {
  const [cmd, file, spec] = process.argv.slice(2);
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const { and, eq } = await import("drizzle-orm");
  const { createDb } = await import("../src/db");
  const { teams, teamCoaches, users, uploads } = await import("../src/db/schema");
  const { topics, teachPages } = await import("../src/db/teach-schema");
  const { createUpload, renderPages } = await import("../src/server/ingest");
  const svc = await import("../src/teach/service");
  const { db, pool: pg } = createDb(process.env.DATABASE_URL!);
  try {
    let [team] = await db.select().from(teams).where(eq(teams.joinCode, "PILOT1"));
    if (!team) {
      const [coach] = await db.select().from(users).where(eq(users.email, process.env.SEED_COACH_EMAIL ?? "coach@example.com"));
      if (!coach) throw new Error("Run pnpm db:seed first (needs pnpm dev running).");
      [team] = await db.insert(teams).values({ name: "Spread pilot", level: "high_school", joinCode: "PILOT1" }).returning();
      await db.insert(teamCoaches).values({ teamId: team!.id, userId: coach.id, role: "owner" });
    }
    const teamId = team!.id;

    if (cmd === "decode") {
      const pages = parsePages(spec!);
      let [up] = await db.select().from(uploads).where(and(eq(uploads.teamId, teamId), eq(uploads.filename, path.basename(file!))));
      if (!up) up = await createUpload(teamId, null, path.basename(file!), new Uint8Array(readFileSync(file!)), db);
      for (const n of pages) await renderPages(teamId, up.id, n, n, db);
      const ids = await svc.prepareDecode(teamId, up.id, pages, db);
      const t0 = Date.now();
      await pool(ids, async (id) => {
        const job = await svc.newJob(teamId, "decode_page", id, db);
        const done = await svc.runJob(job.id, db);
        const [p] = await db.select().from(teachPages).where(eq(teachPages.id, id));
        console.log(`p${p!.pageNo}: ${done?.status} ${p!.status} topic="${p!.topicName ?? ""}" facts=${p!.facts.length} diagrams=${p!.diagrams.length} ${done?.error ?? ""}`);
      });
      console.log(`decoded ${ids.length} pages in ${Math.round((Date.now() - t0) / 1000)}s`);
    }
    if (cmd === "gaps" || cmd === "write") {
      const only = file ? file.split(",").map((x) => x.trim().toUpperCase()) : null;
      const ts = (await db.select().from(topics).where(eq(topics.teamId, teamId))).filter((t) => !only || only.includes(t.name.toUpperCase()));
      await pool(ts, async (t) => {
        const job = await svc.newJob(teamId, cmd === "gaps" ? "find_gaps" : "write_topic", t.id, db);
        const done = await svc.runJob(job.id, db);
        console.log(`${t.name}: ${done?.status} ${done?.error ?? ""}`);
      });
    }
    const overview = await svc.topicOverview(teamId, db);
    for (const t of overview)
      console.log(`- ${t.name} [p${t.pageNos.join(",")}] gaps open ${t.gapsOpen} | lessons ${t.lessonsDraft} draft | questions ${t.questionsDraft} draft`);
    console.log(`team ${teamId}`);
  } finally {
    await pg.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
