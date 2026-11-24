"use server";
import { redirect } from "next/navigation";
import type { QuizMode } from "@/domain/srs";
import { QUIZ_TYPES } from "@/domain/quiz";
import { clearPlayerCookie, requirePlayer, setPlayerCookie } from "@/server/player-session";
import { answerQuestion, startSession } from "@/server/quiz";

const MODES = new Set<string>(["mixed", "speed", ...QUIZ_TYPES]);

export async function startQuizAction(fd: FormData) {
  const me = await requirePlayer();
  const mode = String(fd.get("mode") ?? "mixed");
  const setId = String(fd.get("setId") ?? "") || null;
  const { session, questions } = await startSession({
    team: me.team,
    playerId: me.player.id,
    position: me.position,
    mode: (MODES.has(mode) ? mode : "mixed") as QuizMode,
    studySetId: setId,
    install: fd.get("install") === "1",
  });
  if (questions.length === 0) redirect("/study?empty=1");
  redirect(`/study/quiz/${session.id}`);
}

export async function answerAction(sessionId: string, index: number, given: string | string[], responseMs: number) {
  const me = await requirePlayer();
  return answerQuestion({ teamId: me.team.id, playerId: me.player.id, sessionId, index, given, responseMs });
}

export async function switchPositionAction(fd: FormData) {
  const me = await requirePlayer();
  const position = String(fd.get("position") ?? "").toUpperCase().slice(0, 4);
  if (position) await setPlayerCookie({ playerId: me.player.id, teamId: me.team.id, v: me.team.joinCodeVersion, position });
  redirect("/study");
}

export async function leaveAction() {
  await clearPlayerCookie();
  redirect("/");
}
