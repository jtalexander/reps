/**
 * Football basics in a team, on a real Postgres: adding a library topic makes
 * approved lessons and questions for the team's level and style picks;
 * removing hides them; style changes rewrite them; players' answers survive.
 */
import { and, eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDb, type Db } from "@/db";
import { players, teams, users } from "@/db/schema";
import { attempts, lessons, questions, topics } from "@/db/teach-schema";
import { LIBRARY, LIBRARY_BY_KEY } from "@/library";

let db: Db;
let pool: Pool;
let userId: string;

beforeAll(async () => {
  process.env.DATABASE_URL = inject("dbUrl");
  ({ db, pool } = createDb(inject("dbUrl")));
  const [u] = await db.insert(users).values({ name: "Basics", email: `basics${Date.now()}@x.test` }).returning();
  userId = u!.id;
});
afterAll(async () => {
  await pool?.end();
});

const approved = async (teamId: string, topicId: string) => ({
  lessons: await db.select().from(lessons).where(and(eq(lessons.teamId, teamId), eq(lessons.topicId, topicId), eq(lessons.status, "approved"))),
  questions: await db.select().from(questions).where(and(eq(questions.teamId, teamId), eq(questions.topicId, topicId), eq(questions.status, "approved"))),
});

describe("football basics", () => {
  it("adds a topic as approved content players get, by level; remove and add back", async () => {
    const { createTeam } = await import("@/server/teams");
    const sync = await import("@/library/sync");
    const svc = await import("@/teach/service");
    const t = await createTeam(db, userId, "Basics youth", "youth");
    const lib = LIBRARY_BY_KEY.get("gaps_techniques")!;
    expect(await sync.addLibraryTopics(t.id, ["gaps_techniques", "not_a_topic"], userId, db)).toBe(1);
    const [topic] = await db.select().from(topics).where(and(eq(topics.teamId, t.id), eq(topics.libraryKey, "gaps_techniques")));
    expect(topic!.gapsFoundAt).not.toBeNull(); // nothing for playbook reading to do
    let c = await approved(t.id, topic!.id);
    const want = sync.contentFor(lib, "youth", {});
    expect(c.lessons.length).toBe(want.lessons.length);
    expect(c.questions.length).toBe(want.questions.length);
    // youth doesn't get the middle-school question
    expect(want.questions.length).toBeLessThan(lib.questions.length);
    expect(c.lessons.some((l) => l.diagram)).toBe(true);

    // players get it, diagram included
    const { questions: forPlayers } = await svc.approvedFor(t.id, "QB", db);
    const q = forPlayers.find((x) => x.topicId === topic!.id && x.diagram);
    expect(q).toBeTruthy();
    expect(svc.publicQuestion(q!).diagram).toEqual(q!.diagram);

    // a player answers, then the coach removes it: hidden, history kept
    const [p] = await db.insert(players).values({ teamId: t.id, name: "Kid", positions: ["QB"] }).returning();
    const choiceQ = c.questions.find((x) => x.data.kind === "choice")!;
    await svc.gradeAttempt({ teamId: t.id, playerId: p!.id, questionId: choiceQ.id, given: (choiceQ.data as { answer: string }).answer, responseMs: 1, mode: "practice" }, db);
    await sync.removeLibraryTopic(t.id, "gaps_techniques", db);
    expect((await approved(t.id, topic!.id)).questions.length).toBe(0);
    expect((await db.select().from(attempts).where(eq(attempts.questionId, choiceQ.id))).length).toBe(1);
    // add it back
    await sync.addLibraryTopics(t.id, ["gaps_techniques"], userId, db);
    c = await approved(t.id, topic!.id);
    expect(c.questions.length).toBe(want.questions.length);
  });

  it("an older team copy updates to the library's version; high school gets everything", async () => {
    const { createTeam } = await import("@/server/teams");
    const sync = await import("@/library/sync");
    const t = await createTeam(db, userId, "Basics HS", "high_school");
    await sync.addLibraryTopics(t.id, ["gaps_techniques"], userId, db);
    const [topic] = await db.select().from(topics).where(and(eq(topics.teamId, t.id), eq(topics.libraryKey, "gaps_techniques")));
    expect((await approved(t.id, topic!.id)).questions.length).toBe(LIBRARY_BY_KEY.get("gaps_techniques")!.questions.length);
    await db.update(topics).set({ libraryVersion: 0 }).where(eq(topics.id, topic!.id));
    await sync.addLibraryTopics(t.id, ["gaps_techniques"], userId, db);
    const [after] = await db.select().from(topics).where(eq(topics.id, topic!.id));
    expect(after!.libraryVersion).toBe(LIBRARY_BY_KEY.get("gaps_techniques")!.version);
  });

  it("a playbook topic with the same name keeps its name; the library one says (basics)", async () => {
    const { createTeam } = await import("@/server/teams");
    const sync = await import("@/library/sync");
    const svc = await import("@/teach/service");
    const t = await createTeam(db, userId, "Basics names", "youth");
    await db.insert(topics).values({ teamId: t.id, name: "Gaps and techniques", nameKey: svc.topicKey("Gaps and techniques") });
    await sync.addLibraryTopics(t.id, ["gaps_techniques"], userId, db);
    const [lib] = await db.select().from(topics).where(and(eq(topics.teamId, t.id), eq(topics.libraryKey, "gaps_techniques")));
    expect(lib!.name).toBe("Gaps and techniques (basics)");
  });

  it("teaches the team's pick where coaches differ, and rewrites when the coach changes it", async () => {
    const styled = LIBRARY.find((x) => x.level === "youth" && x.styles?.length);
    if (!styled) return; // no styled topics in the library yet
    const { createTeam } = await import("@/server/teams");
    const sync = await import("@/library/sync");
    const t = await createTeam(db, userId, "Basics style", "high_school");
    const style = styled.styles![0]!;
    const [first, second] = style.options;
    await sync.addLibraryTopics(t.id, [styled.key], userId, db);
    const [topic] = await db.select().from(topics).where(and(eq(topics.teamId, t.id), eq(topics.libraryKey, styled.key)));
    const prompts = async () => new Set((await approved(t.id, topic!.id)).questions.map((q) => q.prompt));
    const tagged = (opt: string) => styled.questions.filter((q) => q.style === `${style.key}:${opt}`).map((q) => q.prompt);
    let now = await prompts();
    for (const p of tagged(first!.key)) expect(now.has(p)).toBe(true);
    for (const p of tagged(second!.key)) expect(now.has(p)).toBe(false);
    await sync.setLibraryStyle(t.id, style.key, second!.key, userId, db);
    now = await prompts();
    for (const p of tagged(second!.key)) expect(now.has(p)).toBe(true);
    for (const p of tagged(first!.key)) expect(now.has(p)).toBe(false);
    const [row] = await db.select({ picks: teams.libraryStyles }).from(teams).where(eq(teams.id, t.id));
    expect(row!.picks[style.key]).toBe(second!.key);
    await expect(sync.setLibraryStyle(t.id, style.key, "nope", userId, db)).rejects.toThrow();
  });
});
