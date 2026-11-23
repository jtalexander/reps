/**
 * Shared learning: when Reps drafts its questions for a topic, it also looks
 * at how coaches on OTHER teams answered questions about the same concept, so
 * its suggested answers get better as more coaches use Reps. The coach still
 * approves every answer. Only teams that share (the default, a Settings
 * switch) contribute, and suggestions never say where they came from: the
 * model is told to use them as football knowledge in this team's own words.
 */
import { and, arrayOverlaps, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db, type Db } from "@/db";
import { teams } from "@/db/schema";
import { gaps, topics } from "@/db/teach-schema";

/** Words too common to say two topics are the same concept. Keep in step with reps_concept_words() (drizzle/0015). */
const COMMON = new Set(["THE", "AND", "VS", "OUR", "PLAY", "PLAYS", "PASS", "RUN", "GAME", "RIGHT", "LEFT", "PROTECTION", "FORMATIONS", "FORMATION", "BASE"]);

export const conceptWords = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !COMMON.has(w));

/** Up to `limit` answered questions from sharing teams' topics that look like the same concept. */
export async function sharedAnswers(teamId: string, topicName: string, limit = 20, database: Db = db): Promise<string> {
  const words = [...new Set(conceptWords(topicName))];
  if (!words.length) return "";
  // One indexed query: topics.concept_words is kept by Postgres (GIN index), so
  // this stays fast however many teams share.
  const rows = await database
    .select({ question: gaps.question, answer: gaps.answer })
    .from(gaps)
    .innerJoin(topics, eq(topics.id, gaps.topicId))
    .innerJoin(teams, eq(teams.id, gaps.teamId))
    .where(
      and(
        ne(gaps.teamId, teamId),
        eq(teams.shareAnswers, true),
        eq(topics.archived, false),
        arrayOverlaps(topics.conceptWords, words),
        inArray(gaps.status, ["answered", "approved"]),
        isNotNull(gaps.answer),
      ),
    )
    .orderBy(desc(gaps.answeredAt))
    .limit(limit);
  return rows
    .filter((r) => r.answer)
    .map((r) => `- Q: ${r.question}\n  A: ${r.answer!.slice(0, 400)}`)
    .join("\n");
}
