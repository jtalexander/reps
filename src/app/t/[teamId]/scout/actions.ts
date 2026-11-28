"use server";
/** Coach actions for opponents, the schedule and scout playbooks. Every action checks the coach first. */
import { revalidatePath } from "next/cache";
import { archiveScoutPlay, deleteGame, deleteOpponent, saveGame, saveOpponent, saveScoutPlay, setScoutInstall, setScoutInstallAll } from "@/breakdown/scout/service";
import { requireCoach } from "@/shared/teams";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (err: unknown): { ok: false; error: string } => {
  const issues = (err as { issues?: Array<{ message: string }> }).issues;
  return { ok: false, error: issues?.[0]?.message ?? (err instanceof Error ? err.message : String(err)) };
};
const fresh = (teamId: string) => {
  revalidatePath(`/t/${teamId}/scout`, "layout");
  revalidatePath(`/t/${teamId}/schedule`);
};

export async function saveOpponentAction(teamId: string, opponentId: string | null, input: unknown): Promise<Result<{ opponentId: string }>> {
  try {
    await requireCoach(teamId);
    const row = await saveOpponent(teamId, opponentId, input);
    fresh(teamId);
    return { ok: true, opponentId: row.id };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteOpponentAction(teamId: string, opponentId: string): Promise<Result> {
  try {
    await requireCoach(teamId);
    await deleteOpponent(teamId, opponentId);
    fresh(teamId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Add a game. `newOpponent` adds the opponent in the same step when they aren't on the list yet. */
export async function saveGameAction(teamId: string, gameId: string | null, input: Record<string, unknown>, newOpponent: { name: string; season: number } | null): Promise<Result> {
  try {
    await requireCoach(teamId);
    let opponentId = input.opponentId;
    if (newOpponent) opponentId = (await saveOpponent(teamId, null, newOpponent)).id;
    await saveGame(teamId, gameId, { ...input, opponentId });
    fresh(teamId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteGameAction(teamId: string, gameId: string): Promise<Result> {
  try {
    await requireCoach(teamId);
    await deleteGame(teamId, gameId);
    fresh(teamId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Save a play drawn in the builder into this opponent's scout playbook. Bound to the team, opponent and source by the page. */
export async function saveScoutPlayAction(teamId: string, opponentId: string, source: "drawn" | "film", playId: string | null, data: unknown): Promise<Result<{ playId: string }>> {
  try {
    const { user } = await requireCoach(teamId);
    const row = await saveScoutPlay(teamId, opponentId, playId, data, { userId: user.id, source });
    fresh(teamId);
    return { ok: true, playId: row.id };
  } catch (err) {
    return fail(err);
  }
}

export async function setScoutInstallAction(teamId: string, playId: string, on: boolean): Promise<Result> {
  try {
    await requireCoach(teamId);
    await setScoutInstall(teamId, playId, on);
    fresh(teamId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setScoutInstallAllAction(teamId: string, opponentId: string, on: boolean): Promise<Result> {
  try {
    await requireCoach(teamId);
    await setScoutInstallAll(teamId, opponentId, on);
    fresh(teamId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function removeScoutPlayAction(teamId: string, playId: string): Promise<Result> {
  try {
    await requireCoach(teamId);
    await archiveScoutPlay(teamId, playId);
    fresh(teamId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
