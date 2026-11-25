/**
 * Reusing a coach's own work across their teams: next season's playbook, or
 * the same offense at another level. Topics match by name. For each matching
 * topic, the other team's answers to RepWon's questions and its approved lessons
 * and quiz questions come over as drafts the coach approves with one tap; the
 * team's own undecided drafts move to the reserve pile. Naming rules come
 * over when the team has none. Nothing goes live without approval.
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { teams } from "@/db/schema";
import { gaps, lessons, questions, topics } from "@/db/teach-schema";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function copyFromTeam(fromTeamId: string, toTeamId: string, userId: string, database: Db = db) {
  if (fromTeamId === toTeamId) throw new Error("Pick a different team.");
  const [from] = await database.select().from(teams).where(eq(teams.id, fromTeamId));
  const [to] = await database.select().from(teams).where(eq(teams.id, toTeamId));
  if (!from || !to) throw new Error("That team wasn't found.");
  let naming = 0;
  if (!to.naming && from.naming) {
    await database.update(teams).set({ naming: from.naming, namingApprovedAt: null }).where(eq(teams.id, toTeamId));
    naming = 1;
  }

  // Football basics topics come from the library, not the coach: each team adds its own
  const fromTopics = await database.select().from(topics).where(and(eq(topics.teamId, fromTeamId), eq(topics.archived, false), isNull(topics.libraryKey))).orderBy(asc(topics.sort));
  const toTopics = await database.select().from(topics).where(and(eq(topics.teamId, toTeamId), eq(topics.archived, false)));
  const byKey = new Map(toTopics.map((t) => [t.nameKey, t]));
  const out = { naming, topics: 0, answers: 0, lessons: 0, questions: 0 };

  for (const ft of fromTopics) {
    const tt = byKey.get(ft.nameKey);
    if (!tt) continue;
    let touched = false;

    // the coach's answers: added as answered; the same open question here is answered with them
    const answered = await database
      .select()
      .from(gaps)
      .where(and(eq(gaps.topicId, ft.id), inArray(gaps.status, ["answered", "approved"]), sql`${gaps.dupOf} is null`));
    if (answered.length) {
      const mine = await database.select().from(gaps).where(eq(gaps.topicId, tt.id));
      const known = new Set(mine.filter((g) => g.status !== "open").map((g) => norm(g.question)));
      for (const g of answered) {
        const same = mine.find((m) => m.status === "open" && norm(m.question) === norm(g.question));
        if (same) {
          await database.update(gaps).set({ status: "answered", answer: g.answer, answeredBy: userId, answeredAt: new Date() }).where(eq(gaps.id, same.id));
        } else if (!known.has(norm(g.question))) {
          await database.insert(gaps).values({
            teamId: toTeamId,
            topicId: tt.id,
            question: g.question,
            why: g.why,
            appliesTo: g.appliesTo,
            status: "answered",
            answer: g.answer,
            answeredBy: userId,
            answeredAt: new Date(),
            priority: g.priority,
          });
        }
        out.answers++;
        touched = true;
      }
    }

    // approved lessons and quiz questions: drafts here, first in line (core); page-image formats stay behind
    const ls = await database.select().from(lessons).where(and(eq(lessons.topicId, ft.id), eq(lessons.status, "approved")));
    const qs = (await database.select().from(questions).where(and(eq(questions.topicId, ft.id), eq(questions.status, "approved")))).filter(
      (q) => q.format !== "tap" && !q.image,
    );
    if (ls.length || qs.length) {
      // this team's own undecided drafts step aside for the coach's approved work
      await database
        .update(questions)
        .set({ tier: "reserve" })
        .where(and(eq(questions.topicId, tt.id), eq(questions.status, "draft")));
      if (ls.length)
        await database.insert(lessons).values(
          ls.map((l) => ({ teamId: toTeamId, topicId: tt.id, audience: l.audience, title: l.title, body: l.body, sourcePages: [], sort: l.sort })),
        );
      if (qs.length)
        await database.insert(questions).values(
          qs.map((q) => ({
            teamId: toTeamId,
            topicId: tt.id,
            audience: q.audience,
            format: q.format,
            prompt: q.prompt,
            data: q.data,
            explanation: q.explanation,
            sourcePages: [],
            tier: "core" as const,
            sort: q.sort,
          })),
        );
      out.lessons += ls.length;
      out.questions += qs.length;
      touched = true;
    }
    if (touched) out.topics++;
  }
  return out;
}
