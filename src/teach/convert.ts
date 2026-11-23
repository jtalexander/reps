/**
 * Turning a drawing Teach found into a real Reps play: crop it from the page
 * image, have Claude locate each offensive player and the line drawn from
 * him, convert pixels to yards, and save it as a draft play the coach checks
 * next to the original.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { plays, uploadPages } from "@/db/schema";
import { teachPages } from "@/db/teach-schema";
import { toPlayData, type Extracted } from "@/domain/extraction";
import { UNKNOWN } from "@/domain/play";
import { media } from "@/media/store";
import { readDrawing, type Drawing } from "./ai";
import { pngSize } from "./png";
import { playbookPages } from "./drawings";
import { getNaming } from "./naming";
import { namingBrief } from "@/domain/naming";

const KIND_TO_TYPE: Record<Drawing["kind"], Extracted["play_type"]> = {
  formation: UNKNOWN,
  run: "run",
  pass: "pass",
  play_action: "play_action",
  screen: "screen",
  option: "option",
  protection: "pass",
  special: "special",
  unknown: UNKNOWN,
};

/** The small drawing answer, in the shape the play converter already takes. */
export function drawingToExtracted(d: Drawing, label: string): Extracted {
  const mover = d.motion ? d.players.find((p) => p.id.toUpperCase() === d.motion!.player.toUpperCase()) : undefined;
  const pt = (p: { x: number; y: number }) => ({ x: p.x, y: p.y });
  return {
    is_play: d.is_play,
    name: label,
    play_type: KIND_TO_TYPE[d.kind],
    concept_name: UNKNOWN,
    ball: { x: 0, y: 0 },
    formation: { name: d.formation_name || UNKNOWN, personnel: UNKNOWN, strength: UNKNOWN, backfield_alignment: UNKNOWN },
    motion: d.motion
      ? {
          player: d.motion.player,
          type: UNKNOWN,
          direction: mover ? (d.motion.end.x < mover.at.x ? "left" : "right") : UNKNOWN,
          timing: UNKNOWN,
          end: pt(d.motion.end),
        }
      : null,
    players: d.players.map((p) => ({
      id: p.id,
      position: p.id,
      x: p.at.x,
      y: p.at.y,
      on_ball: p.on_ball,
      assignment_type: p.does === "motion_only" || p.does === "nothing_drawn" ? UNKNOWN : p.does,
      route: p.does === "route" ? { name: p.route_name ?? UNKNOWN, depth_yards: null, break_direction: UNKNOWN, notes: null } : null,
      block: p.does === "block" ? { type: UNKNOWN, target: null } : null,
      path: p.path?.map(pt) ?? null,
      notes: null,
    })),
    run_details: null,
    option_details: null,
    pass_details: null,
    coaching_points: d.front ? [`Drawn vs ${d.front}`] : [],
    confidence: [],
  };
}

/** Cut one drawing out of its page image, scaled up so the model sees it clearly. */
async function cropDrawing(pageBytes: Uint8Array, pageWidthPt: number, box: { x: number; y: number; w: number; h: number }) {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const img = await loadImage(Buffer.from(pageBytes));
  const s = img.width / pageWidthPt;
  const pad = 6;
  const x = Math.max(0, Math.round((box.x - pad) * s));
  const y = Math.max(0, Math.round((box.y - pad) * s));
  const w = Math.min(img.width - x, Math.round((box.w + pad * 2) * s));
  const h = Math.min(img.height - y, Math.round((box.h + pad * 2) * s));
  const f = Math.min(3, Math.max(1, 1100 / w));
  const W = Math.round(w * f);
  const H = Math.round(h * f);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, x, y, w, h, 0, 0, W, H);
  return { png: new Uint8Array(canvas.toBuffer("image/png")), width: W, height: H };
}

/** The play already made from this drawing, if any. */
export async function playForDrawing(teamId: string, key: string, database: Db = db) {
  const [row] = await database
    .select({ id: plays.id })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false), sql`${plays.aiRaw}->>'drawingKey' = ${key}`));
  return row ?? null;
}

const cropKeyFor = (teamId: string, key: string) => `${teamId}/crops/teach/${key}.png`;

/** The page, the drawing and where its page image lives. */
async function locate(teamId: string, key: string, database: Db) {
  const pageNo = Number(key.split(".")[0]);
  const page = (await playbookPages(teamId, database)).find((p) => p.pageNo === pageNo);
  const drawing = page?.drawings.find((d) => d.key === key);
  if (!page || !drawing) throw new Error("That drawing isn't in the playbook.");
  const [tp] = await database
    .select()
    .from(teachPages)
    .where(and(eq(teachPages.teamId, teamId), eq(teachPages.pageNo, pageNo), eq(teachPages.status, "decoded")))
    .orderBy(desc(teachPages.createdAt))
    .limit(1);
  const [up] = tp ? await database.select().from(uploadPages).where(and(eq(uploadPages.teamId, teamId), eq(uploadPages.id, tp.pageId))) : [];
  if (!tp || !up) throw new Error("The page image is missing.");
  return { page, drawing, tp, up };
}

/**
 * Cut the drawing out of its page and store it. Needs the image library, so it
 * runs in a normal request (the background job only reads the stored crop).
 */
export async function prepareCrop(teamId: string, key: string, database: Db = db) {
  const { drawing, up } = await locate(teamId, key, database);
  const file = await media().get(up.imageKey);
  if (!file) throw new Error("The page image is missing.");
  const crop = await cropDrawing(file.bytes, up.width, drawing.box);
  await media().put(cropKeyFor(teamId, key), crop.png, "image/png");
  return crop;
}

/** Convert one drawing (`${pageNo}.${id}`) into a draft play. Returns the play id. */
export async function convertDrawing(teamId: string, key: string, database: Db = db) {
  const done = await playForDrawing(teamId, key, database);
  if (done) return { playId: done.id, existed: true };
  const { page, drawing, tp } = await locate(teamId, key, database);
  const cropKey = cropKeyFor(teamId, key);
  const stored = await media().get(cropKey);
  const png = stored ? stored.bytes : (await prepareCrop(teamId, key, database)).png;
  const { width, height } = pngSize(png);
  const notes = page.facts
    .map((f) => `- ${f.text}`)
    .join("\n")
    .slice(0, 1500);
  const { naming } = await getNaming(teamId, database);
  const d = await readDrawing(png, width, height, drawing.label, notes, namingBrief(naming));
  let data = null;
  if (d.is_play && d.players.length > 0) {
    // already in field yards (the model places players by football norms)
    data = toPlayData(drawingToExtracted(d, drawing.label), (x, y) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  }
  const [row] = await database
    .insert(plays)
    .values({
      teamId,
      uploadId: tp.uploadId,
      pageId: tp.pageId,
      sourcePage: page.pageNo,
      box: drawing.box,
      cropKey,
      cropWidth: width,
      cropHeight: height,
      name: drawing.label,
      playType: data?.play_type ?? UNKNOWN,
      data,
      aiRaw: { drawingKey: key, topicId: drawing.topicId, drawing: d },
      extraction: data ? "done" : "not_a_play",
      status: "draft",
      sort: page.pageNo * 100 + page.drawings.indexOf(drawing),
    })
    .returning({ id: plays.id });
  return { playId: row!.id, existed: false };
}
