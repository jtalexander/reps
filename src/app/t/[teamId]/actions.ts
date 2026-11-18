"use server";
/**
 * Coach actions. Every action re-checks that the signed-in user coaches the
 * team before touching anything; ids from the client are always paired with
 * the teamId in queries.
 */
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { players, plays, studySets, teams } from "@/db/schema";
import { ConceptSchema } from "@/domain/concepts";
import { LEVELS, readiness, type Level } from "@/domain/readiness";
import { TermsSchema } from "@/domain/terms";
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
  getPlay,
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
  const playIds = fd.getAll("playIds").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const due = String(fd.get("dueDate") ?? "");
  const positions = fd.getAll("positions").map(String);
  if (!name || playIds.length === 0) return;
  // keep only this team's approved plays
  const owned = await db.select({ id: plays.id }).from(plays).where(and(eq(plays.teamId, teamId), eq(plays.status, "approved")));
  const ok = new Set(owned.map((o) => o.id));
  await db.insert(studySets).values({
    teamId,
    name,
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
    playIds: playIds.filter((id) => ok.has(id)),
    positions,
  });
  revalidatePath(`/t/${teamId}/sets`);
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
  const nextLevel = LEVELS.includes(level) ? level : team.level;
  await db.update(teams).set({ name, level: nextLevel, allowFlip }).where(eq(teams.id, teamId));
  if (nextLevel !== team.level) await restatusAll(teamId, nextLevel);
  revalidatePath(`/t/${teamId}`, "layout");
}

export async function saveTermsAction(teamId: string, terms: unknown): Promise<Result> {
  try {
    await requireCoach(teamId);
    const parsed = TermsSchema.parse(terms);
    // drop blanks
    for (const group of Object.values(parsed)) for (const k of Object.keys(group)) if (!group[k]?.trim()) delete group[k];
    await db.update(teams).set({ terms: parsed }).where(eq(teams.id, teamId));
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
