/**
 * Local development database: a persistent embedded Postgres on port 54348.
 * Usage: pnpm dev:db   (keep it running; Ctrl+C stops it)
 * .env.local: DATABASE_URL=postgres://postgres:postgres@localhost:54348/reps
 */
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import { existsSync } from "node:fs";

async function main() {
  const databaseDir = path.resolve(".pgdata/dev");
  const fresh = !existsSync(path.join(databaseDir, "PG_VERSION"));
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "postgres",
    port: 54348,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase("reps");
  console.log("dev postgres ready: postgres://postgres:postgres@localhost:54348/reps");
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
