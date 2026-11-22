/**
 * Rank a team's open questions for the coach and link repeats across topics.
 *   NODE_OPTIONS=--conditions=react-server pnpm tsx scripts/teach-triage.ts <teamId>
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const [teamId] = process.argv.slice(2);
  if (!teamId) throw new Error("usage: teach-triage <teamId>");
  const { createDb } = await import("../src/db");
  const svc = await import("../src/teach/service");
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  try {
    const t0 = Date.now();
    const r = await svc.triageTeamGaps(teamId, db);
    console.log(`asked: ${r.key}, optional: ${r.optional}, repeats linked: ${r.repeats} (${Math.round((Date.now() - t0) / 1000)}s)`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
