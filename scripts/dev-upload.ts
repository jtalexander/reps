/**
 * Dev helper: load a PDF into a team as if uploaded, and split the first N pages.
 * Usage: pnpm tsx scripts/dev-upload.ts <joinCode> <file.pdf> [pages]
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const [code, file, n = "6"] = process.argv.slice(2);
  if (!code || !file) throw new Error("usage: dev-upload <joinCode> <file.pdf> [pages]");
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const { eq } = await import("drizzle-orm");
  const { createDb } = await import("../src/db");
  const { teams } = await import("../src/db/schema");
  const { createUpload, renderPages } = await import("../src/server/ingest");
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  try {
    const [team] = await db.select().from(teams).where(eq(teams.joinCode, code));
    if (!team) throw new Error("No team with that code.");
    const up = await createUpload(team.id, null, path.basename(file), new Uint8Array(readFileSync(file)), db);
    await renderPages(team.id, up.id, 1, Number(n), db);
    console.log(`/t/${team.id}/uploads/${up.id}  (${up.pageCount} pages, ${n} split)`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
