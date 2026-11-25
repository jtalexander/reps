"use server";
/** RepWon admin actions. Each one checks the admin first. */
import { revalidatePath } from "next/cache";
import { requireAdmin, setAiAccess, setAiCap } from "@/server/admin";

const UUID = /^[0-9a-f-]{36}$/i;

export async function setAiAccessAction(teamId: string, access: "on" | "off"): Promise<void> {
  await requireAdmin();
  if (!UUID.test(teamId) || (access !== "on" && access !== "off")) return;
  await setAiAccess(teamId, access);
  revalidatePath("/admin");
}

export async function setAiCapAction(teamId: string, fd: FormData): Promise<void> {
  await requireAdmin();
  if (!UUID.test(teamId)) return;
  const raw = String(fd.get("cap") ?? "").replace(/[^0-9]/g, "");
  await setAiCap(teamId, raw ? Math.min(100000, Number(raw)) : null);
  revalidatePath("/admin");
}
