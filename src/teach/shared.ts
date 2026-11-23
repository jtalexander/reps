/**
 * Shared learning: when Reps drafts its questions for a topic, it also looks
 * at how coaches on OTHER teams answered questions about the same concept, so
 * its suggested answers get better as more coaches use Reps. The coach still
 * approves every answer. Only teams that share (the default, a Settings
 * switch) contribute, and suggestions never say where they came from: the
 * model is told to use them as football knowledge in this team's own words.
 */
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db, type Db } from "@/db";
import { teams } from "@/db/schema";
import { gaps, topics } from "@/db/teach-schema";

/** Words too common to say two topics are the same concept. */
const COMMON = new Set(["THE", "AND", "VS", "OUR", "PLAY", "PLAYS", "PASS", "RUN", "GAME", "RIGHT", "LEFT", "PROTECTION", "FORMATIONS", "FORMATION", "BASE"]);

export const conceptWords = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !COMMON.has(w));

/** Up to `limit` answered questions from sharing teams' topics that look like the same concept. */
export async function sharedAnswers(teamId: string, topicName: string, limit = 20, database: Db = db): Promise<string> {
  const words = conceptWords(topicName);
  if (!words.length) return "";
  const sharing = await database.select({ id: teams.id }).from(teams).where(and(eq(teams.shareAnswers, true), ne(teams.id, teamId)));
  if (!sharing.length) return "";
  const theirTopics = (
    await database
      .select({ id: topics.id, name: topics.name })
      .from(topics)
      .where(and(inArray(topics.teamId, sharing.map((t) => t.id)), eq(topics.archived, false)))
  ).filter((t) => conceptWords(t.name).some((w) => words.includes(w)));
  if (!theirTopics.length) return "";
  const rows = await database
    .select({ question: gaps.question, answer: gaps.answer })
    .from(gaps)
    .where(and(inArray(gaps.topicId, theirTopics.map((t) => t.id)), inArray(gaps.status, ["answered", "approved"])))
    .orderBy(desc(gaps.answeredAt))
    .limit(limit);
  return rows
    .filter((r) => r.answer)
    .map((r) => `- Q: ${r.question}\n  A: ${r.answer!.slice(0, 400)}`)
    .join("\n");
}
