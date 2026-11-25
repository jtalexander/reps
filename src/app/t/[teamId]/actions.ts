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
import { readAhead, type ReadAhead } from "@/teach/read-ahead";
import { customLook } from "@/domain/matchups";
import { keepSuggestedLooks, playLooks, setPlayLook, type PlayLooks } from "@/server/matchups";
import { copyBlocking, resetScheme, saveFronts, saveScheme } from "@/server/blocking";
import { assignSchemes } from "@/teach/assign-schemes";
import { deleteView, saveView, type PlaybookView } from "@/server/playbook";
import { deleteFormation, saveFormation } from "@/server/formations";
import type { TeamFormation } from "@/domain/formations";
import { teamsForUser } from "@/server/teams";
import type { TeamScheme } from "@/domain/blocking";
import { checkBatches, ensureBatchRead } from "@/teach/read-batch";
import { nameDrawnPlay, type NameGuess } from "@/teach/name-drawing";
import { PlayDataSchema, PlayerSchema } from "@/domain/play";
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
export async function startUploadAction(teamId: string, filename: string, size: number, side: "offense" | "defense" = "offense"): Promise<Result<{ uploadId: string }>> {
  try {
    const { user } = await requireCoach(teamId);
    const upload = await startUpload(teamId, user.id, filename, size, undefined, side === "defense" ? "defense" : "offense");
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

// ---------- what a play is good against ----------
const PLAY_ID = /^[0-9a-f-]{36}$/i;

/** Keep or drop one "good against" tag on a play. */
export async function setPlayLookAction(teamId: string, playId: string, key: string, on: boolean): Promise<Result<{ looks: PlayLooks | null }>> {
  try {
    await requireCoach(teamId);
    if (!PLAY_ID.test(playId)) throw new Error("Play not found.");
    await setPlayLook(teamId, playId, String(key), Boolean(on));
    revalidatePath(`/t/${teamId}/gameplan`);
    return { ok: true, looks: await playLooks(teamId, playId) };
  } catch (err) {
    return fail(err);
  }
}

/** Add a tag in the coach's own words ("Cover 6", "Trips"); Reps uses its shared tag when one fits. */
export async function addPlayLookAction(teamId: string, playId: string, text: string): Promise<Result<{ looks: PlayLooks | null }>> {
  try {
    await requireCoach(teamId);
    if (!PLAY_ID.test(playId)) throw new Error("Play not found.");
    const looks = await playLooks(teamId, playId);
    if (!looks) throw new Error("Play not found.");
    const key = customLook(String(text), looks.side);
    if (!key) throw new Error("Type what it's good against first.");
    await setPlayLook(teamId, playId, key, true);
    revalidatePath(`/t/${teamId}/gameplan`);
    return { ok: true, looks: await playLooks(teamId, playId) };
  } catch (err) {
    return fail(err);
  }
}

/** Keep every tag Reps suggests for a play. */
export async function keepSuggestedLooksAction(teamId: string, playId: string): Promise<Result<{ looks: PlayLooks | null }>> {
  try {
    await requireCoach(teamId);
    if (!PLAY_ID.test(playId)) throw new Error("Play not found.");
    await keepSuggestedLooks(teamId, playId);
    revalidatePath(`/t/${teamId}/gameplan`);
    return { ok: true, looks: await playLooks(teamId, playId) };
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

/** Read the playbook's formations (and the install's drawings) ahead of time, a few per call; the builder asks again until none are left. */
export async function readAheadAction(teamId: string): Promise<Result<{ ahead: ReadAhead }>> {
  try {
    await requireCoach(teamId);
    const origin = await requestOrigin();
    // the whole playbook in the background once the naming rules are confirmed; pick up its answers when they're back
    try {
      await ensureBatchRead(teamId, origin);
      await checkBatches(teamId);
    } catch (err) {
      console.error("read batch", teamId, err);
    }
    return { ok: true, ahead: await readAhead(teamId, origin) };
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

/** A name for the play the coach drew by hand, in the team's own words (no AI). */
export async function nameDrawingAction(teamId: string, data: unknown): Promise<Result<{ guess: NameGuess }>> {
  try {
    await requireCoach(teamId);
    const play = PlayDataSchema.parse(data);
    if (play.players.length > 20) throw new Error("Too many players.");
    return { ok: true, guess: await nameDrawnPlay(teamId, play) };
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

/** Save a blocking scheme's rules; every play blocked with it is redrawn. */
export async function saveSchemeAction(teamId: string, scheme: TeamScheme): Promise<Result<{ plays: number; matched: number }>> {
  try {
    await requireCoach(teamId);
    const r = await saveScheme(teamId, scheme);
    revalidatePath(`/t/${teamId}/plays`);
    return { ok: true, plays: r.plays, matched: r.matched };
  } catch (err) {
    return fail(err);
  }
}

/** Back to Reps' rules for one of its schemes, or remove one the coach added. */
export async function resetSchemeAction(teamId: string, key: string): Promise<Result<{ plays: number }>> {
  try {
    await requireCoach(teamId);
    const r = await resetScheme(teamId, String(key));
    revalidatePath(`/t/${teamId}/plays`);
    return { ok: true, plays: r.plays };
  } catch (err) {
    return fail(err);
  }
}

/** The defensive fronts this team sees (blocking is drawn and quizzed against these). */
export async function saveFrontsAction(teamId: string, fronts: string[]): Promise<Result<{ fronts: string[] }>> {
  try {
    await requireCoach(teamId);
    return { ok: true, fronts: await saveFronts(teamId, Array.isArray(fronts) ? fronts.map(String) : []) };
  } catch (err) {
    return fail(err);
  }
}

/** Give every run play its blocking scheme from its name (plays read before schemes existed). */
export async function assignSchemesAction(teamId: string): Promise<Result<{ matched: number }>> {
  try {
    await requireCoach(teamId);
    const matched = await assignSchemes(teamId);
    revalidatePath(`/t/${teamId}/plays`);
    return { ok: true, matched };
  } catch (err) {
    return fail(err);
  }
}

/** Copy this team's blocking schemes to another team the coach has. */
export async function copyBlockingAction(teamId: string, toTeamId: string): Promise<Result<{ redrawn: number; matched: number }>> {
  try {
    const { user } = await requireCoach(teamId);
    if (!(await teamsForUser(user.id)).some((t) => t.id === toTeamId)) throw new Error("You don't coach that team.");
    const r = await copyBlocking(teamId, toTeamId);
    revalidatePath(`/t/${toTeamId}/plays`);
    return { ok: true, ...r };
  } catch (err) {
    return fail(err);
  }
}

/** Save the Playbook's current filter as a named view. */
export async function saveViewAction(teamId: string, name: string, query: string): Promise<Result<{ views: PlaybookView[] }>> {
  try {
    await requireCoach(teamId);
    const views = await saveView(teamId, String(name), String(query));
    revalidatePath(`/t/${teamId}/plays`);
    return { ok: true, views };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteViewAction(teamId: string, id: string): Promise<Result<{ views: PlaybookView[] }>> {
  try {
    await requireCoach(teamId);
    const views = await deleteView(teamId, String(id));
    revalidatePath(`/t/${teamId}/plays`);
    return { ok: true, views };
  } catch (err) {
    return fail(err);
  }
}

/** Save a formation (new, or `id` to change one); with movePlays, plays drawn from it move too. */
export async function saveFormationAction(
  teamId: string,
  input: { id?: string; name: string; players: unknown[] },
  movePlays = false,
): Promise<Result<{ formation: TeamFormation; moved: number }>> {
  try {
    await requireCoach(teamId);
    const r = await saveFormation(teamId, input, { movePlays: Boolean(movePlays) });
    revalidatePath(`/t/${teamId}/plays/formations`);
    return { ok: true, ...r };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteFormationAction(teamId: string, id: string): Promise<Result<object>> {
  try {
    await requireCoach(teamId);
    await deleteFormation(teamId, String(id));
    revalidatePath(`/t/${teamId}/plays/formations`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Save formation drawings from the playbook as the team's formations, in one tap. */
export async function saveFormationsFromPlaysAction(teamId: string, playIds: string[]): Promise<Result<{ saved: number }>> {
  try {
    await requireCoach(teamId);
    const ids = (Array.isArray(playIds) ? playIds : []).filter((x) => PLAY_ID.test(String(x))).slice(0, 200);
    const { playbookFormations } = await import("@/server/formations");
    const list = (await playbookFormations(teamId)).filter((f) => ids.includes(f.id));
    let saved = 0;
    for (const f of list) {
      await saveFormation(teamId, { name: f.name, players: f.data.players });
      saved++;
    }
    revalidatePath(`/t/${teamId}/plays/formations`);
    return { ok: true, saved };
  } catch (err) {
    return fail(err);
  }
}

// ---------- wristband ----------

type WB = import("@/domain/wristband").Wristband;
type WBR = Promise<Result<{ value: WB }>>;

async function wb<T>(teamId: string, run: (w: typeof import("@/server/wristband")) => Promise<T>): Promise<Result<{ value: T }>> {
  try {
    await requireCoach(teamId);
    const value = await run(await import("@/server/wristband"));
    revalidatePath(`/t/${teamId}/plays/wristband`);
    return { ok: true, value };
  } catch (err) {
    return fail(err);
  }
}
const s40 = (v: unknown) => String(v ?? "").slice(0, 80);

export async function wristbandTeamAction(teamId: string, patch: Partial<Pick<WB, "numbering" | "numbersBy" | "teachBand">>): WBR {
  return wb(teamId, (w) => w.saveTeamCalling(teamId, patch));
}
export async function wristbandBandAction(teamId: string, bandId: string, patch: Record<string, unknown>): WBR {
  return wb(teamId, (w) => w.saveBand(teamId, s40(bandId), patch));
}
export async function wristbandNewBandAction(teamId: string, fromId: string | null, name: string): Promise<Result<{ value: { wristband: WB; band: import("@/domain/wristband").Band } }>> {
  return wb(teamId, (w) => w.createBand(teamId, fromId ? s40(fromId) : null, s40(name)));
}
export async function wristbandDeleteBandAction(teamId: string, bandId: string): WBR {
  return wb(teamId, (w) => w.deleteBand(teamId, s40(bandId)));
}
export async function wristbandNumberAction(teamId: string, key: string, value: string): Promise<Result<{ value: { wristband: WB; bumped: string | null } }>> {
  return wb(teamId, (w) => w.setCallNumber(teamId, s40(key), s40(value)));
}
export async function wristbandSwapAction(teamId: string, a: string, b: string): WBR {
  return wb(teamId, (w) => w.swapCalls(teamId, s40(a), s40(b)));
}
export async function wristbandRenumberAction(teamId: string, keys: string[], numbering?: "order" | "code"): WBR {
  return wb(teamId, (w) => w.renumberCalls(teamId, Array.isArray(keys) ? keys.map(s40).slice(0, 400) : [], numbering === "code" ? "code" : numbering === "order" ? "order" : undefined));
}
export async function wristbandLabelAction(teamId: string, key: string, label: string): WBR {
  return wb(teamId, (w) => w.setCallLabel(teamId, s40(key), s40(label)));
}
export async function wristbandOnBandAction(teamId: string, bandId: string, key: string, on: boolean): WBR {
  return wb(teamId, (w) => w.setOnBand(teamId, s40(bandId), s40(key), Boolean(on)));
}
