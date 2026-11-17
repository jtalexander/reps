/**
 * Starts a throwaway embedded Postgres on :54349 for integration tests and
 * applies the migrations. Unit tests ignore it.
 *
 * Windows: embedded-postgres's stop() can leave a backend holding the port,
 * so teardown also kills the postmaster's process tree, and setup clears a
 * leftover from a run that was interrupted.
 */
import EmbeddedPostgres from "embedded-postgres";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TestProject } from "vitest/node";
import { runMigrations } from "../scripts/migrate";

declare module "vitest" {
  export interface ProvidedContext {
    dbUrl: string;
  }
}

const PORT = 54349;
const PID_FILE = path.join(tmpdir(), "reps-test-pg.pid");

function kill(pid: number) {
  try {
    if (process.platform === "win32") execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    else process.kill(pid, "SIGKILL");
  } catch {
    /* already gone */
  }
}

/** The postmaster and its backends (captured while the postmaster is alive). */
function processTree(pid: number): number[] {
  if (process.platform !== "win32") return [pid];
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ParentProcessId=${pid}' | ForEach-Object { $_.ProcessId }"`,
      { encoding: "utf8" },
    );
    return [pid, ...out.split(/\s+/).filter(Boolean).map(Number)];
  } catch {
    return [pid];
  }
}

export default async function setup(project: TestProject) {
  if (existsSync(PID_FILE)) {
    for (const pid of readFileSync(PID_FILE, "utf8").split(",").map(Number)) kill(pid);
    rmSync(PID_FILE, { force: true });
  }
  const dir = mkdtempSync(path.join(tmpdir(), "reps-test-pg-"));
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    // PG18 io workers outlive the postmaster on Windows and keep the port; sync I/O has none.
    postgresFlags: ["-c", "io_method=sync"],
    onLog: () => undefined,
  });
  await pg.initialise();
  await pg.start();
  const pid = Number(readFileSync(path.join(dir, "postmaster.pid"), "utf8").split("\n")[0]);
  await pg.createDatabase("reps_test");
  const url = `postgres://postgres:postgres@localhost:${PORT}/reps_test`;
  await runMigrations(url);
  // Record the postmaster and its background workers now (slow to look up;
  // teardown has only a few seconds). Those workers are what outlive a stop.
  const tree = processTree(pid);
  writeFileSync(PID_FILE, tree.join(","));
  project.provide("dbUrl", url);
  return async () => {
    // A throwaway database: kill it outright. pg.stop() is skipped because on
    // Windows it can leave a worker holding the port.
    void pg;
    kill(pid); // taskkill /T: the postmaster and any backends still attached
    for (const p of tree) kill(p);
    rmSync(PID_FILE, { force: true });
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
    } catch {
      /* the OS temp cleaner gets it later */
    }
  };
}
