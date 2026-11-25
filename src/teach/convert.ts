/**
 * Turning a drawing Teach found into a real Reps play: crop it from the page
 * image, have Claude locate each offensive player and the line drawn from
 * him, convert pixels to yards, and save it as a draft play the coach checks
 * next to the original.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { assignSchemes } from "./assign-schemes";
import { plays, uploadPages, uploads } from "@/db/schema";
import { teachPages } from "@/db/teach-schema";
import { toPlayData, type Extracted } from "@/domain/extraction";
import { isDefense, PlayDataSchema, renameLinemen, UNKNOWN, type PlayData, type Player } from "@/domain/play";
import { media } from "@/media/store";
import { readDefDrawing, readDrawing, type DefDrawing, type Drawing } from "./ai";
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

/**
 * Everything the model is shown for one drawing. Uses the stored crop; makes
 * it only when `crop` is allowed (the image library runs in normal requests).
 */
export async function drawingInput(teamId: string, key: string, database: Db = db, crop = true) {
  const { page, drawing, tp } = await locate(teamId, key, database);
  const cropKey = cropKeyFor(teamId, key);
  const stored = await media().get(cropKey);
  if (!stored && !crop) return null;
  const png = stored ? stored.bytes : (await prepareCrop(teamId, key, database)).png;
  const { width, height } = pngSize(png);
  const notes = page.facts
    .map((f) => `- ${f.text}`)
    .join("\n")
    .slice(0, 1500);
  const { naming } = await getNaming(teamId, database);
  // an offensive or a defensive playbook: decides which reader reads it
  const [up] = await database.select({ side: uploads.side }).from(uploads).where(and(eq(uploads.teamId, teamId), eq(uploads.id, tp.uploadId)));
  const side: "offense" | "defense" = up?.side === "defense" ? "defense" : "offense";
  return { page, drawing, tp, cropKey, png, width, height, notes, label: drawing.label, naming: namingBrief(naming), side };
}
export type DrawingInput = NonNullable<Awaited<ReturnType<typeof drawingInput>>>;

/** A defensive drawing as a defensive call: the defenders and their jobs, against the offense when drawn. */
export function defDrawingToPlay(d: DefDrawing, label: string): PlayData | null {
  if (!d.is_play || !d.defenders.length) return null;
  const r = (v: number) => Math.round(v * 10) / 10;
  const player = (id: string, at: { x: number; y: number }): Player => ({
    id,
    position: id,
    x: r(at.x),
    y: r(at.y),
    on_ball: Math.abs(at.y) < 1.5,
    side: at.x < -1 ? "left" : at.x > 1 ? "right" : "middle",
    split: null,
    assignment_type: "unknown",
    route: null,
    block: null,
    path: null,
    notes: null,
  });
  const parts = { front: d.front && d.front !== "unknown" ? d.front : null, coverage: d.coverage, stunt: d.stunt, pressure: d.pressure };
  return PlayDataSchema.parse({
    name: label,
    play_type: "unknown",
    formation: { name: parts.front ?? "unknown", personnel: "unknown", strength: "unknown", backfield_alignment: "unknown" },
    players: d.defenders.map((x) => ({
      ...player(x.id, x.at),
      assignment_type: x.does === "nothing_drawn" ? "unknown" : x.does,
      def: { gap: x.gap, zone: x.zone, man: x.man, technique: null },
      // drawn lines kept relative to the defender
      path: x.path && x.path.length >= 2 ? x.path.map((q) => [r(q.x - x.at.x), r(q.y - x.at.y)]) : null,
    })),
    side: "defense",
    defense: parts,
    vs: d.offense.map((o) => player(o.id, o.at)),
    coaching_points: [],
  });
}

/** Save what the model read as a draft play (once per drawing; a second answer is ignored). */
export async function saveDrawing(teamId: string, key: string, input: DrawingInput, d: Drawing | DefDrawing, database: Db = db) {
  const done = await playForDrawing(teamId, key, database);
  if (done) return { playId: done.id, existed: true };
  const { page, drawing, tp } = input;
  let data: PlayData | null = null;
  if ("defenders" in d) data = defDrawingToPlay(d, drawing.label);
  else if (d.is_play && d.players.length > 0) {
    // already in field yards (the model places players by football norms)
    data = toPlayData(drawingToExtracted(d, drawing.label), (x, y) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    data = { ...data, players: await sameLinemen(teamId, drawing.label, data.players, database) };
  }
  const [row] = await database
    .insert(plays)
    .values({
      teamId,
      uploadId: tp.uploadId,
      pageId: tp.pageId,
      sourcePage: page.pageNo,
      box: drawing.box,
      cropKey: input.cropKey,
      cropWidth: input.width,
      cropHeight: input.height,
      name: drawing.label,
      playType: data?.play_type ?? UNKNOWN,
      side: data && isDefense(data) ? "defense" : "offense",
      data,
      aiRaw: { drawingKey: key, topicId: drawing.topicId, drawing: d },
      extraction: data ? "done" : "not_a_play",
      status: "draft",
      sort: page.pageNo * 100 + page.drawings.indexOf(drawing),
    })
    .returning({ id: plays.id });
  // a run read from the playbook gets its blocking scheme from its name (24 POWER -> Power)
  if (data && !isDefense(data)) await assignSchemes(teamId, database, [row!.id]);
  return { playId: row!.id, existed: false };
}

/**
 * Linemen named the way this team's plays already name them: LT/LG/RG/RT or
 * play side / back side (PST, PSG, BSG, BST; play side = the formation's side).
 */
async function sameLinemen(teamId: string, label: string, players: Player[], database: Db) {
  const rows = await database
    .select({ data: plays.data })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false)));
  let lt = 0;
  let ps = 0;
  for (const r of rows)
    for (const p of r.data?.players ?? []) {
      if (/^(LT|LG|RG|RT)$/.test(p.id)) lt++;
      if (/^(PST|PSG|BSG|BST)$/.test(p.id)) ps++;
    }
  if (lt === ps) return players;
  return renameLinemen(players, ps > lt ? "ps" : "lt", /\b(LEFT|LT)\b/i.test(label) ? "left" : "right");
}

/** Convert one drawing (`${pageNo}.${id}`) into a draft play. Returns the play id. */
export async function convertDrawing(teamId: string, key: string, database: Db = db) {
  const done = await playForDrawing(teamId, key, database);
  if (done) return { playId: done.id, existed: true };
  const input = (await drawingInput(teamId, key, database))!;
  const read = input.side === "defense" ? readDefDrawing : readDrawing;
  const d = await read(input.png, input.width, input.height, input.label, input.notes, input.naming);
  return saveDrawing(teamId, key, input, d, database);
}
