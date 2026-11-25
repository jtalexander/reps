/**
 * Naming rules without a button: as soon as RepWon has read playbook pages and
 * the team has no naming draft, RepWon drafts one in the background. The coach
 * only checks it (the guided check on Teach). A failed draft isn't retried
 * for a day, so a broken playbook can't burn AI over and over.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { teams } from "@/db/schema";
import { jobs, teachPages } from "@/db/teach-schema";
import { dispatchJob } from "./dispatch";
import { newJob } from "./service";
import { aiBlockedReason } from "./usage";

export type NamingStatus =
  | { state: "no_pages" }
  | { state: "drafting" }
  | { state: "failed"; error: string }
  | { state: "blocked"; reason: string }
  | { state: "draft" }
  | { state: "confirmed"; at: Date };

const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

/** Where the team's naming rules stand (no side effects). */
export async function namingStatus(teamId: string, database: Db = db): Promise<NamingStatus> {
  const [team] = await database.select({ naming: teams.naming, approvedAt: teams.namingApprovedAt }).from(teams).where(eq(teams.id, teamId));
  if (team?.naming) return team.approvedAt ? { state: "confirmed", at: team.approvedAt } : { state: "draft" };
  const [job] = await database
    .select({ status: jobs.status, error: jobs.error, at: jobs.createdAt })
    .from(jobs)
    .where(and(eq(jobs.teamId, teamId), eq(jobs.kind, "naming")))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  if (job && (job.status === "queued" || job.status === "running")) return { state: "drafting" };
  const [read] = await database
    .select({ n: sql<number>`count(*)::int` })
    .from(teachPages)
    .where(and(eq(teachPages.teamId, teamId), eq(teachPages.status, "decoded")));
  if (!read?.n) return { state: "no_pages" };
  if (job?.status === "failed") return { state: "failed", error: job.error ?? "The draft didn't finish." };
  const blocked = await aiBlockedReason(teamId, database);
  if (blocked) return { state: "blocked", reason: blocked };
  return { state: "drafting" }; // ensureNamingDraft starts it
}

/**
 * Start a naming draft when one is due: pages read, no rules yet, nothing
 * running, no failure in the last day, AI on for the team. Returns the status
 * after any start. Safe to call on every page view.
 */
export async function ensureNamingDraft(teamId: string, origin: string | null, database: Db = db): Promise<NamingStatus> {
  const status = await namingStatus(teamId, database);
  if (status.state !== "drafting" && status.state !== "failed") return status;
  const recent = await database
    .select({ status: jobs.status })
    .from(jobs)
    .where(and(eq(jobs.teamId, teamId), eq(jobs.kind, "naming"), gte(jobs.createdAt, new Date(Date.now() - RETRY_AFTER_MS))));
  if (recent.some((j) => j.status === "queued" || j.status === "running")) return { state: "drafting" };
  if (recent.some((j) => j.status === "failed")) return status.state === "failed" ? status : { state: "failed", error: "The draft didn't finish." };
  if (status.state === "failed" && (await aiBlockedReason(teamId, database))) return status;
  const job = await newJob(teamId, "naming", teamId, database);
  await dispatchJob(job.id, origin, database);
  return { state: "drafting" };
}

