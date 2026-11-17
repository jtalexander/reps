/**
 * Local seed: a coach account (SEED_COACH_EMAIL / SEED_COACH_PASSWORD), a
 * demo team with a roster, and three hand-built approved plays so the quiz
 * side works before any PDF is read. Idempotent.
 * Usage: pnpm db:seed
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const { eq } = await import("drizzle-orm");
  const { createDb } = await import("../src/db");
  const { players, plays, teamCoaches, teams, users } = await import("../src/db/schema");
  const { SAMPLE_PLAYS } = await import("../tests/fixtures/sample-plays");
  const { readiness } = await import("../src/domain/readiness");

  const email = process.env.SEED_COACH_EMAIL ?? "coach@example.com";
  const password = process.env.SEED_COACH_PASSWORD;
  if (!password) throw new Error("Set SEED_COACH_PASSWORD in .env.local");
  const url = process.env.DATABASE_URL!;
  const { db, pool } = createDb(url);
  try {
    let [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
      // Create through Better Auth so the password hash matches its format.
      const res = await fetch(`${process.env.BETTER_AUTH_URL ?? "http://localhost:3500"}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: process.env.BETTER_AUTH_URL ?? "http://localhost:3500" },
        body: JSON.stringify({ email, password, name: "Coach" }),
      }).catch(() => null);
      if (!res?.ok) throw new Error("Start the dev server (pnpm dev) first; the seed signs the coach up through it.");
      [user] = await db.select().from(users).where(eq(users.email, email));
    }
    let [team] = await db.select().from(teams).where(eq(teams.joinCode, "DEMO42"));
    if (!team) {
      [team] = await db.insert(teams).values({ name: "Demo Hawks", level: "middle_school", joinCode: "DEMO42" }).returning();
      await db.insert(teamCoaches).values({ teamId: team!.id, userId: user!.id, role: "owner" });
      await db.insert(players).values([
        { teamId: team!.id, name: "Sam K", jersey: "7", positions: ["QB"] },
        { teamId: team!.id, name: "Jayden R", jersey: "1", positions: ["X", "Z"] },
        { teamId: team!.id, name: "Marcus T", jersey: "22", positions: ["RB"] },
        { teamId: team!.id, name: "Eli W", jersey: "84", positions: ["Y"] },
      ]);
      for (const [i, data] of SAMPLE_PLAYS.entries()) {
        const r = readiness(data, "middle_school");
        await db.insert(plays).values({
          teamId: team!.id,
          name: data.name,
          playType: String(data.play_type),
          conceptKey: data.concept_key,
          data,
          extraction: "done",
          status: r.complete ? "approved" : "needs_coach_input",
          qbReady: r.complete && r.qbReady,
          approvedAt: r.complete ? new Date() : null,
          sort: i,
        });
      }
    }
    console.log(`Seeded. Coach: ${email}  Team: ${team!.name}  Join code: ${team!.joinCode}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
