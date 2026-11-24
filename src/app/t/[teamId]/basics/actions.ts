"use server";
/** Football basics: add, remove and update library topics; pick the team's styles. Coaches only. */
import { revalidatePath } from "next/cache";
import { LIBRARY_BY_KEY } from "@/library";
import { addLibraryTopics, removeLibraryTopic, setLibraryStyle } from "@/library/sync";
import { requireCoach } from "@/server/teams";

const refresh = (teamId: string) => revalidatePath(`/t/${teamId}`, "layout");

export async function addBasicsAction(teamId: string, keys: string[]): Promise<void> {
  const { user } = await requireCoach(teamId);
  await addLibraryTopics(
    teamId,
    keys.filter((k) => LIBRARY_BY_KEY.has(k)),
    user.id,
  );
  refresh(teamId);
}

export async function removeBasicsAction(teamId: string, key: string): Promise<void> {
  await requireCoach(teamId);
  if (LIBRARY_BY_KEY.has(key)) await removeLibraryTopic(teamId, key);
  refresh(teamId);
}

export async function setBasicsStyleAction(teamId: string, styleKey: string, fd: FormData): Promise<void> {
  const { user } = await requireCoach(teamId);
  await setLibraryStyle(teamId, styleKey, String(fd.get("option") ?? ""), user.id);
  refresh(teamId);
}
