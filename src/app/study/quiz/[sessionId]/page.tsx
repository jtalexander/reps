import { notFound } from "next/navigation";
import type { Question } from "@/domain/quiz";
import { requirePlayer } from "@/server/player-session";
import { libraryDiagram } from "@/domain/library-quiz";
import type { PlayData } from "@/domain/play";
import { getSession, publicQuestion, quizLibrary, quizPlays } from "@/server/quiz";
import { QuizRunner } from "./quiz-runner";

export const metadata = { title: "Quiz" };

export default async function QuizPage({ params }: PageProps<"/study/quiz/[sessionId]">) {
  const { sessionId } = await params;
  const me = await requirePlayer();
  const session = await getSession(me.team.id, me.player.id, sessionId);
  if (!session) notFound();
  const questions = session.questions as Question[];
  const plays = await quizPlays(me.team.id, [...new Set(questions.map((q) => q.playId))]);
  const library = await quizLibrary(me.team.id);
  const byId = new Map<string, PlayData>(plays.map((p) => [p.id, p.data]));
  for (const e of library) {
    const d = libraryDiagram(e.item);
    if (d) byId.set(e.id, d);
  }
  return <QuizRunner sessionId={session.id} mode={session.mode} questions={questions.map((q, i) => publicQuestion(q, i, byId.get(q.playId)))} />;
}
