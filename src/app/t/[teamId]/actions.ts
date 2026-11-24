"use server";
/**
 * Coach actions. Every action re-checks that the signed-in user coaches the
 * team before touching anything; ids from the client are always paired with
 * the teamId in queries.
 */
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { players, plays, studySets, teams } from "@/db/schema";
import { topics } from "@/db/teach-schema";
import { newCoachInvite, removeCoach, stopCoachInvite } from "@/server/coaches";
import { deleteAllPlayers, deletePlayer } from "@/server/player-data";
import { ConceptSchema } from "@/domain/concepts";
import { LEVELS, readiness, type Level } from "@/domain/readiness";
import { TermsSchema } from "@/domain/terms";
import { lineupFor, type LineupResult } from "@/teach/lineup";
import { drawPlay, type DrawResult } from "@/teach/play-draw";
import { PlayerSchema } from "@/domain/play";
import { z } from "zod";
import { requestOrigin } from "@/lib/origin";
import { TREE_NUMBERS } from "@/domain/route-tree";
import { refreshLibraryTopics, saveRouteTree, TEAM_BUILT } from "@/library/sync";
import type { Box } from "@/ingest/boxes";
import {
  appendChunk,
  cropPage,
  extractPlayRow,
  finishUpload,
  renderPages,
  setPageBoxes,
  startBlank,
  startUpload,
} from "@/server/ingest";
import {
  approvePlay,
  createBuiltPlay,
  getPlay,
  isConverted,
  restatusAll,
  savePlayData,
  saveTeamConcept,
  setPlayConcept,
  unapprovePlay,
} from "@/server/plays";
import { newJoinCode, requireCoach } from "@/server/teams";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (err: unknown): { ok: false; error: string } => ({
  ok: false,
  error: err instanceof Error ? err.message : String(err),
});

// ---------- upload pipeline ----------
// The browser sends the PDF in pieces: one request can't exceed ~6 MB on Netlify.
export async function startUploadAction(teamId: string, filename: string, size: number): Promise<Result<{ uploadId: string }>> {
  try {
    const { user } = await requireCoach(teamId);
    const upload = await startUpload(teamId, user.id, filename, size);
    return { ok: true, uploadId: upload.id };
  } catch (err) {
    return fail(err);
  }
}

export async function uploadChunkAction(teamId: string, uploadId: string, index: number, fd: FormData): Promise<Result> {
  try {
    await requireCoach(teamId);
    const chunk = fd.get("chunk");
    if (!(chunk instanceof Blob)) return { ok: false, error: "Missing file piece." };
    await appendChunk(teamId, uploadId, index, new Uint8Array(await chunk.arrayBuffer()));
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function finishUploadAction(teamId: string, uploadId: string, chunks: number): Promise<Result<{ pages: number }>> {
  try {
    await requireCoach(teamId);
    const upload = await finishUpload(teamId, uploadId, chunks);
    return { ok: true, pages: upload.pageCount };
  } catch (err) {
    return fail(err);
  }
}

export async function renderPagesAction(teamId: string, uploadId: string, from: number, to: number): Promise<Result<{ done: boolean }>> {
  try {
    await requireCoach(teamId);
    const r = await renderPages(teamId, uploadId, from, to);
    return { ok: true, done: r.done };
  } catch (err) {
    return fail(err);
  }
}

export async function setBoxesAction(teamId: string, pageId: string, boxes: Box[]): Promise<Result<{ playIds: string[] }>> {
  try {
    await requireCoach(teamId);
    await setPageBoxes(teamId, pageId, boxes);
    const playIds = await cropPage(teamId, pageId);
    return { ok: true, playIds };
  } catch (err) {
    return fail(err);
  }
}

export async function cropPageAction(teamId: string, pageId: string): Promise<Result<{ playIds: string[] }>> {
  try {
    await requireCoach(teamId);
    return { ok: true, playIds: await cropPage(teamId, pageId) };
  } catch (err) {
    return fail(err);
  }
}

export async function extractAction(teamId: string, playId: string): Promise<Result<{ extraction: string; error: string | null }>> {
  try {
    await requireCoach(teamId);
    await extractPlayRow(teamId, playId);
    const row = await getPlay(teamId, playId);
    return { ok: true, extraction: row?.extraction ?? "failed", error: row?.extractionError ?? null };
  } catch (err) {
    return fail(err);
  }
}

export async function startBlankAction(teamId: string, playId: string): Promise<void> {
  await requireCoach(teamId);
  await startBlank(teamId, playId);
  revalidatePath(`/t/${teamId}/plays/${playId}`);
}

// ---------- play review ----------
export async function savePlayAction(teamId: string, playId: string, data: unknown) {
  try {
    const { team } = await requireCoach(teamId);
    const row = await savePlayData(teamId, playId, data, { level: team.level });
    return { ok: true as const, status: row.status, readiness: readiness(row.data!, team.level) };
  } catch (err) {
    return fail(err);
  }
}

export async function approveAction(teamId: string, playId: string): Promise<Result<{ status: string }>> {
  try {
    const { team, user } = await requireCoach(teamId);
    const row = await approvePlay(teamId, playId, user.id, team.level);
    revalidatePath(`/t/${teamId}`);
    return { ok: true, status: row.status };
  } catch (err) {
    return fail(err);
  }
}

export async function unapproveAction(teamId: string, playId: string): Promise<Result> {
  try {
    const { team } = await requireCoach(teamId);
    await unapprovePlay(teamId, playId, team.level);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setConceptAction(teamId: string, playId: string, conceptKey: string | null) {
  try {
    const { team } = await requireCoach(teamId);
    const row = await setPlayConcept(teamId, playId, conceptKey, team.level);
    return { ok: true as const, data: row.data!, status: row.status };
  } catch (err) {
    return fail(err);
  }
}

export async function archivePlayAction(teamId: string, playId: string): Promise<void> {
  await requireCoach(teamId);
  await db.update(plays).set({ archived: true }).where(and(eq(plays.teamId, teamId), eq(plays.id, playId)));
  revalidatePath(`/t/${teamId}/plays`);
}

// ---------- concepts ----------
export async function saveConceptAction(teamId: string, key: string, patch: unknown): Promise<Result<{ updated: number }>> {
  try {
    await requireCoach(teamId);
    const parsed = ConceptSchema.partial().parse(patch);
    const updated = await saveTeamConcept(teamId, key, parsed);
    revalidatePath(`/t/${teamId}/concepts`);
    return { ok: true, updated };
  } catch (err) {
    return fail(err);
  }
}

// ---------- roster ----------
export async function addPlayersAction(teamId: string, fd: FormData): Promise<void> {
  await requireCoach(teamId);
  // One player per line: "Sam K, QB" or "Sam K 12, X Z"
  const lines = String(fd.get("players") ?? "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 120);
  const rows = lines.map((line) => {
    const [namePart, posPart = ""] = line.split(",");
    const m = namePart!.trim().match(/^(.*?)(?:\s+#?(\d{1,2}))?$/);
    return {
      teamId,
      name: (m?.[1] ?? namePart!).trim().slice(0, 40),
      jersey: m?.[2] ?? null,
      positions: posPart
        .split(/[\s/]+/)
        .map((p) => p.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 4),
    };
  });
  if (rows.length) await db.insert(players).values(rows);
  revalidatePath(`/t/${teamId}/roster`);
}

export async function updatePlayerAction(teamId: string, playerId: string, fd: FormData): Promise<void> {
  await requireCoach(teamId);
  await db
    .update(players)
    .set({
      name: String(fd.get("name") ?? "").trim().slice(0, 40) || "Player",
      jersey: String(fd.get("jersey") ?? "").trim().slice(0, 3) || null,
      positions: String(fd.get("positions") ?? "")
        .split(/[\s,/]+/)
        .map((p) => p.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 4),
    })
    .where(and(eq(players.teamId, teamId), eq(players.id, playerId)));
  revalidatePath(`/t/${teamId}/roster`);
}

export async function removePlayerAction(teamId: string, playerId: string): Promise<void> {
  await requireCoach(teamId);
  await db.update(players).set({ active: false }).where(and(eq(players.teamId, teamId), eq(players.id, playerId)));
  revalidatePath(`/t/${teamId}/roster`);
}

// ---------- study sets ----------
export async function createSetAction(teamId: string, fd: FormData): Promise<void> {
  await requireCoach(teamId);
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  const ids = (k: string) => fd.getAll(k).map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const topicIds = ids("topicIds");
  const due = String(fd.get("dueDate") ?? "");
  const positions = fd.getAll("positions").map(String);
  if (!name || topicIds.length === 0) return;
  // keep only this team's topics
  const owned = await db
    .select({ id: topics.id })
    .from(topics)
    .where(and(eq(topics.teamId, teamId), inArray(topics.id, topicIds)));
  const ok = new Set(owned.map((o) => o.id));
  const values = {
    name,
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
    topicIds: topicIds.filter((id) => ok.has(id)),
    positions,
  };
  // editing an existing set (this team's only), or a new one
  const setId = String(fd.get("setId") ?? "");
  if (/^[0-9a-f-]{36}$/i.test(setId)) {
    await db.update(studySets).set(values).where(and(eq(studySets.teamId, teamId), eq(studySets.id, setId)));
    revalidatePath(`/t/${teamId}/sets`);
    redirect(`/t/${teamId}/sets?saved=${encodeURIComponent(name)}`);
  }
  await db.insert(studySets).values({ teamId, ...values });
  revalidatePath(`/t/${teamId}/sets`);
  redirect(`/t/${teamId}/sets?made=${encodeURIComponent(name)}`);
}

export async function deleteSetAction(teamId: string, setId: string): Promise<void> {
  await requireCoach(teamId);
  await db.delete(studySets).where(and(eq(studySets.teamId, teamId), eq(studySets.id, setId)));
  revalidatePath(`/t/${teamId}/sets`);
}

// ---------- settings ----------
export async function saveSettingsAction(teamId: string, fd: FormData): Promise<void> {
  const { team } = await requireCoach(teamId);
  const level = String(fd.get("level")) as Level;
  const name = String(fd.get("name") ?? "").trim().slice(0, 80) || team.name;
  const allowFlip = fd.get("allowFlip") === "on";
  const groupFronts = fd.get("groupFronts") === "on";
  const shareAnswers = fd.get("shareAnswers") === "on";
  const nextLevel = LEVELS.includes(level) ? level : team.level;
  await db.update(teams).set({ name, level: nextLevel, allowFlip, groupFronts, shareAnswers }).where(eq(teams.id, teamId));
  if (nextLevel !== team.level) await restatusAll(teamId, nextLevel);
  revalidatePath(`/t/${teamId}`, "layout");
}

/** The team's route tree from the Settings form: numbered or names only, and the route for each number. */
export async function saveRouteTreeAction(teamId: string, fd: FormData): Promise<void> {
  const { user } = await requireCoach(teamId);
  const numbered = fd.get("numbered") !== "no";
  const routes = TREE_NUMBERS.map((n) => ({ n, route: String(fd.get(`route_${n}`) ?? "") })).filter((r) => r.route);
  await saveRouteTree(teamId, { numbered, routes }, user.id);
  revalidatePath(`/t/${teamId}`, "layout");
  redirect(`/t/${teamId}/settings?routes=saved#routes`);
}

export async function saveTermsAction(teamId: string, terms: unknown): Promise<Result> {
  try {
    const { user } = await requireCoach(teamId);
    const parsed = TermsSchema.parse(terms);
    // drop blanks
    for (const group of Object.values(parsed)) for (const k of Object.keys(group)) if (!group[k]?.trim()) delete group[k];
    await db.update(teams).set({ terms: parsed }).where(eq(teams.id, teamId));
    // Basics topics built from the team's words pick up the new names
    await refreshLibraryTopics(teamId, TEAM_BUILT, user.id);
    revalidatePath(`/t/${teamId}/settings`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function resetJoinCodeAction(teamId: string): Promise<void> {
  const { team } = await requireCoach(teamId);
  await db.update(teams).set({ joinCode: newJoinCode(), joinCodeVersion: team.joinCodeVersion + 1 }).where(eq(teams.id, teamId));
  revalidatePath(`/t/${teamId}/settings`);
}

// ---------- coaches ----------
async function requireOwner(teamId: string) {
  const c = await requireCoach(teamId);
  if (c.role !== "owner") throw new Error("Only the team's owner can do that.");
  return c;
}

export async function newCoachInviteAction(teamId: string): Promise<void> {
  await requireOwner(teamId);
  await newCoachInvite(teamId);
  revalidatePath(`/t/${teamId}/settings`);
}

export async function stopCoachInviteAction(teamId: string): Promise<void> {
  await requireOwner(teamId);
  await stopCoachInvite(teamId);
  revalidatePath(`/t/${teamId}/settings`);
}

export async function removeCoachAction(teamId: string, userId: string): Promise<void> {
  await requireOwner(teamId);
  if (/^[0-9a-f-]{36}$/i.test(userId)) await removeCoach(teamId, userId);
  revalidatePath(`/t/${teamId}/settings`);
}

// ---------- player data ----------
/** Delete one player and everything Reps saved about them. */
export async function deletePlayerAction(teamId: string, playerId: string): Promise<void> {
  await requireCoach(teamId);
  if (/^[0-9a-f-]{36}$/i.test(playerId)) await deletePlayer(teamId, playerId);
  revalidatePath(`/t/${teamId}/roster`);
}

/** Owner only, typed confirmation: delete every player on the team and all their data. */
export async function deleteAllPlayersAction(teamId: string, fd: FormData): Promise<void> {
  await requireOwner(teamId);
  if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") redirect(`/t/${teamId}/settings?deleted=no#players`);
  const n = await deleteAllPlayers(teamId);
  revalidatePath(`/t/${teamId}`, "layout");
  redirect(`/t/${teamId}/settings?deleted=${n}#players`);
}

// ---------- play builder ----------
/** Where the players line up for a formation call, from the team's own drawings (may start reading one; ask again). */
export async function lineupForAction(teamId: string, call: { formation: string; dir: string; tag: string }): Promise<Result<{ lineup: LineupResult }>> {
  try {
    await requireCoach(teamId);
    const lineup = await lineupFor(
      teamId,
      { formation: String(call.formation ?? "").slice(0, 40), dir: call.dir === "LEFT" ? "LEFT" : "RIGHT", tag: String(call.tag ?? "").slice(0, 40) },
      await requestOrigin(),
    );
    return { ok: true, lineup };
  } catch (err) {
    return fail(err);
  }
}

/** Every player's job and the motion for the picked play, laid onto the coach's lineup (may start reading a drawing; ask again). */
export async function drawPlayAction(teamId: string, call: Record<string, unknown>, lineup: unknown): Promise<Result<{ result: DrawResult }>> {
  try {
    await requireCoach(teamId);
    const s = (v: unknown) => String(v ?? "").slice(0, 40);
    const side = (v: unknown) => (v === "LEFT" ? "LEFT" : v === "RIGHT" ? "RIGHT" : "");
    const players = z.array(PlayerSchema).max(20).parse(lineup);
    const result = await drawPlay(
      teamId,
      { formation: s(call.formation), dir: side(call.dir) || "RIGHT", tag: s(call.tag), play: s(call.play), playDir: side(call.playDir), motion: s(call.motion), motionPlayer: s(call.motionPlayer) },
      players,
      await requestOrigin(),
    );
    return { ok: true, result };
  } catch (err) {
    return fail(err);
  }
}

/** Save a play drawn in the builder: a new one, or changes to a drawn or converted play (back to "to check"). */
export async function saveBuiltPlayAction(teamId: string, playId: string | null, data: unknown): Promise<Result<{ playId: string }>> {
  try {
    const { team } = await requireCoach(teamId);
    if (playId) {
      if (!/^[0-9a-f-]{36}$/i.test(playId)) throw new Error("Play not found.");
      const current = await getPlay(teamId, playId);
      if (!current || !isConverted(current)) throw new Error("Only drawn or converted plays open in the builder.");
      await savePlayData(teamId, playId, data, { level: team.level });
      revalidatePath(`/t/${teamId}/plays`);
      return { ok: true, playId };
    }
    const id = await createBuiltPlay(teamId, data);
    revalidatePath(`/t/${teamId}/plays`);
    return { ok: true, playId: id };
  } catch (err) {
    return fail(err);
  }
}
