/**
 * Read the playbook's drawings before the coach needs them, so picking a
 * formation or a play in the builder doesn't wait on a read (each read is one
 * AI call of 30-45 s). What gets read ahead: one drawing of every formation
 * (with each tag it's drawn with), and the drawings in this week's install.
 * Each drawing is still read only once, ever; a few are queued per call so
 * the request stays quick, and the builder asks again until none are left.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, type Db } from "@/db";
import { plays } from "@/db/schema";
import { jobs } from "@/db/teach-schema";
import type { Naming } from "@/domain/naming";
import { prepareCrop } from "./convert";
import { playbookDrawings, type Drawing } from "./drawings";
import { SIDES, words } from "./lineup";
import { getNaming } from "./naming";
import { dispatchWorkers, WORKERS } from "./playbook-run";
import { onNetlify } from "./dispatch";
import { activeBatch } from "./read-batch";
import { aiBlockedReason } from "./usage";

/** Drawings queued per call (each one is cropped in the request). */
const BATCH = 6;

/**
 * The formation a drawing's label calls and nothing else ("TRIPS RIGHT
 * STACK" -> "TRIPS STACK"), or null when the label is a play, a page title or
 * not a formation. The side is left out: one side is mirrored for the other.
 */
export function formationCall(label: string, n: Naming | null): string | null {
  const w = words(label);
  const has = (word: string) => {
    const ww = words(word);
    return ww.length > 0 && ww.every((x) => w.includes(x));
  };
  // the longest formation word that fits ("FULL HOUSE" over "HOUSE")
  const f = (n?.formations ?? []).filter((x) => has(x.word)).sort((a, b) => words(b.word).length - words(a.word).length)[0];
  if (!f) return null;
  const fw = new Set(words(f.word));
  const tags = (n?.formation_tags ?? []).filter((t) => has(t.word) && !words(t.word).every((x) => fw.has(x)));
  const tw = new Set(tags.flatMap((t) => words(t.word)));
  const rest = w.filter((x) => !fw.has(x) && !tw.has(x) && !SIDES[x]);
  const playWords = new Set((n?.plays ?? []).flatMap((p) => words(p.word)));
  // a play word, a motion number ("Z-7") or a page title: not just a formation
  if (rest.some((x) => playWords.has(x) || /^\d+$/.test(x)) || rest.length > 1) return null;
  return [f.word.toUpperCase(), ...tags.map((t) => t.word.toUpperCase()).sort()].join(" ");
}

/** What's worth reading ahead, best first: formations (right side first), then the install's drawings. */
export function readAheadList(drawings: Drawing[], n: Naming | null, skip: Set<string>, haveCalls: Set<string>): Drawing[] {
  const byCall = new Map<string, Drawing>();
  for (const d of drawings) {
    const call = formationCall(d.label, n);
    if (!call || haveCalls.has(call)) continue;
    const cur = byCall.get(call);
    const right = words(d.label).some((x) => SIDES[x] === "RIGHT");
    if (!cur || (right && !words(cur.label).some((x) => SIDES[x] === "RIGHT"))) byCall.set(call, d);
  }
  const formations = [...byCall.values()];
  const install = drawings.filter((d) => d.inInstall && !formations.includes(d));
  return [...formations, ...install].filter((d) => !skip.has(d.key));
}

export interface ReadAhead {
  /** queued by this call */
  queued: number;
  /** still to queue after this call */
  left: number;
  /** being read now or waiting for a worker */
  reading: number;
  blocked?: string;
  /** the whole playbook being read in the background: how many drawings */
  batch?: { status: string; drawings: number } | null;
}

export async function readAhead(teamId: string, origin: string | null, database: Db = db): Promise<ReadAhead> {
  const reads = await database.select({ ref: jobs.ref, status: jobs.status }).from(jobs).where(and(eq(jobs.teamId, teamId), eq(jobs.kind, "convert_drawing")));
  const reading = reads.filter((j) => j.status === "queued" || j.status === "running").length;
  const blocked = await aiBlockedReason(teamId, database);
  if (blocked) return { queued: 0, left: 0, reading, blocked };
  const batch = await activeBatch(teamId, database);
  // reads ahead on the live site only (a local dev server would spend real money on test teams); AUTO_READ_LOCAL=1 to try it locally
  if (!onNetlify() && process.env.AUTO_READ_LOCAL !== "1") return { queued: 0, left: 0, reading, batch: batch ? { status: batch.status, drawings: batch.keys.length } : null };

  const made = await database
    .select({ name: plays.name, aiRaw: plays.aiRaw })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false)));
  const { naming } = await getNaming(teamId, database);
  // never read a drawing twice: anything converted or ever queued is skipped
  const skip = new Set<string>([...(batch?.keys ?? []), ...reads.map((j) => j.ref), ...made.flatMap((p) => ((p.aiRaw as { drawingKey?: string } | null)?.drawingKey ? [(p.aiRaw as { drawingKey: string }).drawingKey] : []))]);
  // a formation the team already has as a play doesn't need another drawing read
  const haveCalls = new Set(made.flatMap((p) => formationCall(p.name, naming) ?? []));
  const list = readAheadList(await playbookDrawings(teamId, database), naming, skip, haveCalls);

  const next = list.slice(0, BATCH);
  let queued = 0;
  for (const d of next) {
    try {
      await prepareCrop(teamId, d.key, database);
      await database.insert(jobs).values({ teamId, kind: "convert_drawing", ref: d.key });
      queued++;
    } catch (err) {
      // no page image to crop: mark it so it isn't tried again
      await database.insert(jobs).values({ teamId, kind: "convert_drawing", ref: d.key, status: "failed", error: err instanceof Error ? err.message.slice(0, 200) : "Couldn't crop it." });
    }
  }
  if (queued) await dispatchWorkers(teamId, origin, Math.min(WORKERS, queued), database);
  return { queued, left: list.length - next.length, reading: reading + queued, batch: batch ? { status: batch.status, drawings: batch.keys.length } : null };
}

/** How many drawings of this team are being read right now (for the builder's note). */
export async function readingCount(teamId: string, database: Db = db) {
  const rows = await database
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.teamId, teamId), eq(jobs.kind, "convert_drawing"), inArray(jobs.status, ["queued", "running"])));
  return rows.length;
}
