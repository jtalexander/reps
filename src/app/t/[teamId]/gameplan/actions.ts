"use server";
/** Game plan actions: every one re-checks that the signed-in user coaches the team. */
import { revalidatePath } from "next/cache";
import { customLook, type Side } from "@/domain/matchups";
import { addToPlan, createPlan, deletePlan, sendPlan, updatePlan } from "@/server/game-plans";
import { requireCoach } from "@/server/teams";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (err: unknown): { ok: false; error: string } => ({ ok: false, error: err instanceof Error ? err.message : String(err) });

export async function createPlanAction(teamId: string, opponent: string, gameDate: string | null): Promise<Result<{ id: string }>> {
  try {
    await requireCoach(teamId);
    const p = await createPlan(teamId, String(opponent), gameDate ? String(gameDate) : null);
    revalidatePath(`/t/${teamId}/gameplan`);
    return { ok: true, id: p.id };
  } catch (err) {
    return fail(err);
  }
}

export async function updatePlanAction(teamId: string, id: string, patch: Record<string, unknown>): Promise<Result> {
  try {
    await requireCoach(teamId);
    await updatePlan(teamId, String(id), patch);
    revalidatePath(`/t/${teamId}/gameplan`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** A look in the coach's own words ("Cover 6", "Wing T") as a tag key. */
export async function lookKeyAction(text: string, side: Side): Promise<Result<{ key: string | null }>> {
  return { ok: true, key: customLook(String(text), side === "defense" ? "defense" : "offense") };
}

export async function addToPlanAction(teamId: string, id: string, playId: string): Promise<Result> {
  try {
    await requireCoach(teamId);
    await addToPlan(teamId, String(id), String(playId));
    revalidatePath(`/t/${teamId}/gameplan`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deletePlanAction(teamId: string, id: string): Promise<Result> {
  try {
    await requireCoach(teamId);
    await deletePlan(teamId, String(id));
    revalidatePath(`/t/${teamId}/gameplan`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function sendPlanAction(teamId: string, id: string): Promise<Result<{ plays: number; name: string }>> {
  try {
    await requireCoach(teamId);
    const r = await sendPlan(teamId, String(id));
    revalidatePath(`/t/${teamId}/gameplan`);
    revalidatePath(`/t/${teamId}/install`);
    return { ok: true, ...r };
  } catch (err) {
    return fail(err);
  }
}
