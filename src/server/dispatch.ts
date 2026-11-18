/**
 * Start reading a box. On Netlify (READ_IN_BACKGROUND=true) the read runs in
 * a background function, which has up to 15 minutes; a normal request would
 * time out on a big page. Locally and in tests it runs inline.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { plays } from "@/db/schema";
import { appBaseUrl } from "@/lib/base-url";
import { extractPlayRow } from "./extract-row";

const STALE_MINUTES = 16;

function secret(): string {
  const s = process.env.PLAYER_COOKIE_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("PLAYER_COOKIE_SECRET is not set.");
  return s;
}

export function signRead(teamId: string, playId: string): string {
  return createHmac("sha256", secret()).update(`read:${teamId}:${playId}`).digest("base64url");
}

export function verifyRead(teamId: string, playId: string, sig: string | null): boolean {
  if (!sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(signRead(teamId, playId));
  return a.length === b.length && timingSafeEqual(a, b);
}

export const readsInBackground = () => process.env.READ_IN_BACKGROUND === "true";

export async function queueRead(teamId: string, playId: string, database: Db = db): Promise<"queued" | "done"> {
  if (!readsInBackground()) {
    await extractPlayRow(teamId, playId, { database });
    return "done";
  }
  await database
    .update(plays)
    .set({ extraction: "queued", extractionError: null })
    .where(and(eq(plays.teamId, teamId), eq(plays.id, playId)));
  const res = await fetch(`${appBaseUrl()}/.netlify/functions/read-box-background`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-reps-signature": signRead(teamId, playId) },
    body: JSON.stringify({ teamId, playId }),
  });
  if (res.status !== 202 && !res.ok) {
    await database
      .update(plays)
      .set({ extraction: "failed", extractionError: `Couldn't start the reader (${res.status}).` })
      .where(eq(plays.id, playId));
    throw new Error(`Couldn't start the reader (${res.status}).`);
  }
  return "queued";
}

/**
 * Current reading state of some boxes. A read that has been queued or
 * running for too long died with its function; mark it failed so it can be
 * retried.
 */
export async function readStatus(teamId: string, ids: string[], database: Db = db) {
  if (ids.length === 0) return [];
  await database
    .update(plays)
    .set({ extraction: "failed", extractionError: "The read stopped before finishing. Try again." })
    .where(
      and(
        eq(plays.teamId, teamId),
        inArray(plays.id, ids),
        or(eq(plays.extraction, "queued"), eq(plays.extraction, "running")),
        lt(plays.updatedAt, sql`now() - make_interval(mins => ${STALE_MINUTES})`),
      ),
    );
  return database
    .select({ id: plays.id, extraction: plays.extraction, extractionError: plays.extractionError, kind: plays.kind })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), inArray(plays.id, ids)));
}
