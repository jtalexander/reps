/**
 * The upload pipeline, in steps the browser drives one call at a time (so
 * no single request runs long and the coach sees progress):
 *   createUpload -> renderPages (a few at a time) -> [coach adjusts boxes]
 *   -> cropPage (one play row per box) -> extractPlayRow (parallel, 4 at once)
 */
import "server-only";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, type Db } from "@/db";
import { plays, teams, uploadPages, uploads } from "@/db/schema";
import { emptyPlay, PlayDataSchema, UNKNOWN } from "@/domain/play";
import { detectBoxes, type Box } from "@/ingest/boxes";
import { extractPlay, hasApiKey, askModel } from "@/ingest/extract";
import { pdfInfo, renderPage, textIn } from "@/ingest/pdf";
import { media } from "@/media/store";
import { conceptsForTeam, statusFor, withConcept } from "./plays";

const DPI = 144;

export async function createUpload(teamId: string, userId: string | null, filename: string, bytes: Uint8Array, database: Db = db) {
  if (bytes.length < 5 || Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") throw new Error("That file is not a PDF.");
  const { pages } = await pdfInfo(bytes);
  const [upload] = await database
    .insert(uploads)
    .values({ teamId, filename, mediaKey: "pending", pageCount: pages.length, createdBy: userId })
    .returning();
  const key = `${teamId}/uploads/${upload!.id}.pdf`;
  await media().put(key, bytes, "application/pdf");
  await database.update(uploads).set({ mediaKey: key }).where(eq(uploads.id, upload!.id));
  return { ...upload!, mediaKey: key };
}

async function getUpload(teamId: string, uploadId: string, database: Db) {
  const [u] = await database.select().from(uploads).where(and(eq(uploads.teamId, teamId), eq(uploads.id, uploadId)));
  if (!u) throw new Error("Upload not found.");
  return u;
}

/** Render pages [from, to] (1-based, inclusive), detect boxes, store images. */
export async function renderPages(teamId: string, uploadId: string, from: number, to: number, database: Db = db) {
  const upload = await getUpload(teamId, uploadId, database);
  const file = await media().get(upload.mediaKey);
  if (!file) throw new Error("The PDF is missing from storage.");
  const last = Math.min(to, upload.pageCount);
  for (let n = from; n <= last; n++) {
    const page = await renderPage(file.bytes, n, DPI);
    const boxes = detectBoxes(page.gray, page.pixelWidth, page.pixelHeight, page.scale);
    const imageKey = `${teamId}/pages/${uploadId}/${n}.png`;
    await media().put(imageKey, page.png, "image/png");
    await database
      .insert(uploadPages)
      .values({ teamId, uploadId, pageNo: n, width: page.width, height: page.height, imageKey, boxes, text: page.text })
      .onConflictDoUpdate({
        target: [uploadPages.uploadId, uploadPages.pageNo],
        set: { imageKey, boxes, text: page.text, width: page.width, height: page.height, boxesConfirmed: false },
      });
  }
  if (last >= upload.pageCount) await database.update(uploads).set({ status: "ready" }).where(eq(uploads.id, uploadId));
  return { rendered: last - from + 1, done: last >= upload.pageCount };
}

export async function setPageBoxes(teamId: string, pageId: string, boxes: Box[], database: Db = db) {
  const clean = boxes
    .filter((b) => b.w > 20 && b.h > 20)
    .map((b) => ({ x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.w.toFixed(1), h: +b.h.toFixed(1) }));
  await database
    .update(uploadPages)
    .set({ boxes: clean, boxesConfirmed: true })
    .where(and(eq(uploadPages.teamId, teamId), eq(uploadPages.id, pageId)));
}

async function cropFromImage(png: Uint8Array, pageWidth: number, box: Box, pad = 1.5) {
  const img = await loadImage(Buffer.from(png));
  const s = img.width / pageWidth;
  const x = Math.max(0, Math.round((box.x - pad) * s));
  const y = Math.max(0, Math.round((box.y - pad) * s));
  const w = Math.min(img.width - x, Math.round((box.w + pad * 2) * s));
  const h = Math.min(img.height - y, Math.round((box.h + pad * 2) * s));
  const c = createCanvas(w, h);
  c.getContext("2d").drawImage(img, x, y, w, h, 0, 0, w, h);
  return { png: new Uint8Array(c.toBuffer("image/png")), width: w, height: h };
}

/**
 * Make one play row per box on a page. Plays already on the page are
 * replaced unless approved (an approved play keeps its data; its crop is
 * updated if its box index still exists).
 */
export async function cropPage(teamId: string, pageId: string, database: Db = db) {
  const [page] = await database
    .select()
    .from(uploadPages)
    .where(and(eq(uploadPages.teamId, teamId), eq(uploadPages.id, pageId)));
  if (!page) throw new Error("Page not found.");
  const image = await media().get(page.imageKey);
  if (!image) throw new Error("Page image missing.");
  const existing = await database.select().from(plays).where(and(eq(plays.teamId, teamId), eq(plays.pageId, pageId)));
  const keep = existing.filter((p) => p.status === "approved");
  const drop = existing.filter((p) => p.status !== "approved");
  if (drop.length) await database.delete(plays).where(inArray(plays.id, drop.map((p) => p.id)));
  const made: string[] = [];
  for (const [i, box] of page.boxes.entries()) {
    const crop = await cropFromImage(image.bytes, page.width, box);
    const cropKey = `${teamId}/crops/${page.uploadId}/${page.pageNo}-${i}-${Date.now()}.png`;
    await media().put(cropKey, crop.png, "image/png");
    const sourceText = textIn(page.text, box);
    const kept = keep.find((p) => p.boxIndex === i);
    if (kept) {
      await database.update(plays).set({ box, cropKey, cropWidth: crop.width, cropHeight: crop.height }).where(eq(plays.id, kept.id));
      continue;
    }
    const [row] = await database
      .insert(plays)
      .values({
        teamId,
        uploadId: page.uploadId,
        pageId,
        sourcePage: page.pageNo,
        boxIndex: i,
        box,
        cropKey,
        cropWidth: crop.width,
        cropHeight: crop.height,
        sourceText,
        name: sourceText.split("\n")[0] || UNKNOWN,
        sort: page.pageNo * 100 + i,
      })
      .returning({ id: plays.id });
    made.push(row!.id);
  }
  await database.update(uploadPages).set({ boxesConfirmed: true }).where(eq(uploadPages.id, pageId));
  return made;
}

export async function pendingPlays(teamId: string, uploadId: string, database: Db = db) {
  return database
    .select({ id: plays.id, extraction: plays.extraction })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.uploadId, uploadId)))
    .orderBy(asc(plays.sort));
}

type Reader = typeof askModel;

/** Read one play crop with the model and store the draft. */
export async function extractPlayRow(teamId: string, playId: string, opts: { database?: Db; reader?: Reader } = {}) {
  const database = opts.database ?? db;
  const [row] = await database.select().from(plays).where(and(eq(plays.teamId, teamId), eq(plays.id, playId)));
  if (!row || !row.cropKey) throw new Error("Play not found.");
  if (row.status === "approved") return row;
  const [team] = await database.select().from(teams).where(eq(teams.id, teamId));
  if (!opts.reader && !hasApiKey()) {
    await database
      .update(plays)
      .set({ extraction: "failed", extractionError: "No ANTHROPIC_API_KEY on the server — fill this play in by hand." })
      .where(eq(plays.id, playId));
    return null;
  }
  await database.update(plays).set({ extraction: "running", extractionError: null }).where(eq(plays.id, playId));
  try {
    const crop = await media().get(row.cropKey);
    if (!crop) throw new Error("Crop image missing.");
    const result = await extractPlay(crop.bytes, row.cropWidth ?? 0, row.cropHeight ?? 0, row.sourceText, opts.reader);
    if (!result.isPlay || !result.data) {
      await database.update(plays).set({ extraction: "not_a_play", aiRaw: result.raw, archived: true }).where(eq(plays.id, playId));
      return null;
    }
    const data = withConcept(result.data, await conceptsForTeam(teamId, database));
    const { status, qbReady } = statusFor(data, team!.level, false);
    const [saved] = await database
      .update(plays)
      .set({
        data,
        aiRaw: result.raw,
        name: data.name,
        playType: String(data.play_type),
        conceptKey: data.concept_key,
        extraction: "done",
        status,
        qbReady,
      })
      .where(eq(plays.id, playId))
      .returning();
    return saved!;
  } catch (err) {
    await database
      .update(plays)
      .set({ extraction: "failed", extractionError: err instanceof Error ? err.message.slice(0, 300) : String(err) })
      .where(eq(plays.id, playId));
    return null;
  }
}

/** Start a play by hand (no model, or the model failed). */
export async function startBlank(teamId: string, playId: string, database: Db = db) {
  const [row] = await database.select().from(plays).where(and(eq(plays.teamId, teamId), eq(plays.id, playId)));
  if (!row) throw new Error("Play not found.");
  const [team] = await database.select().from(teams).where(eq(teams.id, teamId));
  const data = PlayDataSchema.parse({ ...emptyPlay(row.name || UNKNOWN), players: defaultPlayers() });
  const { status } = statusFor(data, team!.level, false);
  await database
    .update(plays)
    .set({ data, extraction: "done", extractionError: null, status, archived: false })
    .where(eq(plays.id, playId));
}

/** A standard 11 to start from when entering a play by hand. */
export function defaultPlayers() {
  const base = { on_ball: true, split: null, route: null, block: null, path: null, notes: null } as const;
  const ol = ["LT", "LG", "C", "RG", "RT"].map((id, i) => ({
    ...base,
    id,
    position: id,
    x: (i - 2) * 1.3,
    y: 0,
    side: (i < 2 ? "left" : i > 2 ? "right" : "middle") as "left" | "right" | "middle",
    assignment_type: "block" as const,
    block: { type: "zone", target: null, path: null },
  }));
  const skill = [
    { id: "X", x: -18, y: 0, on_ball: true, side: "left" },
    { id: "Z", x: 17, y: -1, on_ball: false, side: "right" },
    { id: "Y", x: 4, y: 0, on_ball: true, side: "right" },
    { id: "H", x: -9, y: -1, on_ball: false, side: "left" },
    { id: "QB", x: 0, y: -5, on_ball: false, side: "middle" },
    { id: "RB", x: 0, y: -7, on_ball: false, side: "middle" },
  ] as const;
  return [
    ...ol,
    ...skill.map((p) => ({ ...base, ...p, position: p.id, assignment_type: UNKNOWN })),
  ];
}
