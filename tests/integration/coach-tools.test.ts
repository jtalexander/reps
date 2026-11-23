/**
 * Coach tools on a real Postgres: assistant coaches, deleting player data,
 * AI spending and budgets, install-only focus, game-ready and study set
 * progress, bringing work over from another team, and shared learning.
 */
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDb, type Db } from "@/db";
import { players, studySets, teams, users } from "@/db/schema";
import { gaps, lessons, questions, topics } from "@/db/teach-schema";

let db: Db;
let pool: Pool;
let ownerId: string;
let otherId: string;

beforeAll(async () => {
  process.env.DATABASE_URL = inject("dbUrl");
  ({ db, pool } = createDb(inject("dbUrl")));
  const stamp = Date.now();
  const [u] = await db.insert(users).values({ name: "Head", email: `head${stamp}@x.test` }).returning();
  const [o] = await db.insert(users).values({ name: "Assistant", email: `asst${stamp}@x.test` }).returning();
  ownerId = u!.id;
  otherId = o!.id;
});
afterAll(async () => {
  await pool?.end();
});

const choice = (teamId: string, topicId: string, i: number, extra: Partial<typeof questions.$inferInsert> = {}) => ({
  teamId,
  topicId,
  format: "choice" as const,
  prompt: `Q${i}?`,
  data: { kind: "choice" as const, choices: [{ id: "a", text: "yes" }, { id: "b", text: "no" }], answer: "a" },
  explanation: "x",
  status: "approved" as const,
  sort: i,
  ...extra,
});

describe("coach tools", () => {
  it("adds an assistant coach through an invite link; only coaches can be removed", async () => {
    const { createTeam } = await import("@/server/teams");
    const c = await import("@/server/coaches");
    const t = await createTeam(db, ownerId, "Coaches", "youth");
    expect(await c.joinAsCoach("not-a-real-code", otherId, db)).toBeNull();
    const code = await c.newCoachInvite(t.id, db);
    expect(await c.joinAsCoach(code, otherId, db)).toBe(t.id);
    expect(await c.joinAsCoach(code, otherId, db)).toBe(t.id); // twice is fine
    expect((await c.listCoaches(t.id, db)).map((x) => x.role)).toEqual(["owner", "coach"]);
    const fresh = await c.newCoachInvite(t.id, db);
    expect(await c.joinAsCoach(code, otherId, db)).toBeNull(); // the old link stops working
    expect(fresh).not.toBe(code);
    await c.removeCoach(t.id, ownerId, db); // never the owner
    await c.removeCoach(t.id, otherId, db);
    expect((await c.listCoaches(t.id, db)).map((x) => x.role)).toEqual(["owner"]);
  });

  it("deletes a player and everything about them, only on their own team", async () => {
    const { createTeam } = await import("@/server/teams");
    const pd = await import("@/server/player-data");
    const svc = await import("@/teach/service");
    const t = await createTeam(db, ownerId, "Data", "youth");
    const u = await createTeam(db, ownerId, "Data 2", "youth");
    const [topic] = await db.insert(topics).values({ teamId: t.id, name: "Snap", nameKey: "SNAP" }).returning();
    const [q] = await db.insert(questions).values(choice(t.id, topic!.id, 0)).returning();
    const [p] = await db.insert(players).values({ teamId: t.id, name: "Kid", positions: ["QB"] }).returning();
    await svc.gradeAttempt({ teamId: t.id, playerId: p!.id, questionId: q!.id, given: "a", responseMs: 1, mode: "practice" }, db);
    await pd.deletePlayer(u.id, p!.id, db); // wrong team: nothing
    expect((await db.select().from(players).where(eq(players.id, p!.id))).length).toBe(1);
    await pd.deletePlayer(t.id, p!.id, db);
    expect((await db.select().from(players).where(eq(players.id, p!.id))).length).toBe(0);
    expect((await svc.mastery(t.id, db)).length).toBe(0); // answers went with them
    await db.insert(players).values([{ teamId: t.id, name: "A" }, { teamId: t.id, name: "B", active: false }]);
    expect(await pd.playerDataCounts(t.id, db)).toEqual({ players: 2, removed: 1 });
    expect(await pd.deleteAllPlayers(t.id, db)).toBe(2);
  });

  it("counts AI spending per team and warns near the budget", async () => {
    const { createTeam } = await import("@/server/teams");
    const usage = await import("@/teach/usage");
    const t = await createTeam(db, ownerId, "Spend", "youth");
    // 1M input ($4) + 100k output ($2) on Opus 5.5 = $6
    await usage.withAi(t.id, "write_topic", () => usage.recordUsage("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 100_000 }, "write"));
    let s = await usage.monthSpend(t.id, db);
    expect(s.total).toBeCloseTo(6);
    expect(s.steps).toEqual([{ step: "write", calls: 1, cost: 6 }]);
    expect(s.level).toBe("ok");
    await db.update(teams).set({ aiBudgetUsd: 7 }).where(eq(teams.id, t.id));
    expect((await usage.monthSpend(t.id, db)).level).toBe("near");
    await db.update(teams).set({ aiBudgetUsd: 5 }).where(eq(teams.id, t.id));
    s = await usage.monthSpend(t.id, db);
    expect(s.level).toBe("over");
    expect((await usage.monthSpendByTeam([t.id], db)).get(t.id)).toBeCloseTo(6);
  });

  it("focuses Teach on the install, and tracks game-ready and study set progress", async () => {
    const { createTeam } = await import("@/server/teams");
    const svc = await import("@/teach/service");
    const progress = await import("@/teach/progress");
    const t = await createTeam(db, ownerId, "Ready", "youth");
    const [a, b] = await db
      .insert(topics)
      .values([
        { teamId: t.id, name: "Veer", nameKey: "VEER", inInstall: true, sort: 0 },
        { teamId: t.id, name: "Smash", nameKey: "SMASH", sort: 1 },
      ])
      .returning();
    expect(await svc.focusTopicIds(t.id, db)).toBeNull(); // off
    await svc.setInstallOnly(t.id, true, db);
    expect([...((await svc.focusTopicIds(t.id, db)) ?? [])]).toEqual([a!.id]);

    const qs = await db.insert(questions).values([0, 1, 2].map((i) => choice(t.id, a!.id, i))).returning();
    await db.insert(questions).values(choice(t.id, b!.id, 9));
    const [p1, p2] = await db
      .insert(players)
      .values([
        { teamId: t.id, name: "Ready Kid", positions: ["QB"] },
        { teamId: t.id, name: "New Kid", positions: ["X"] },
      ])
      .returning();
    for (const q of qs) await svc.gradeAttempt({ teamId: t.id, playerId: p1!.id, questionId: q.id, given: "a", responseMs: 1, mode: "practice" }, db);
    await svc.gradeAttempt({ teamId: t.id, playerId: p2!.id, questionId: qs[0]!.id, given: "a", responseMs: 1, mode: "practice" }, db); // one answer isn't enough

    const ready = (await progress.gameReady(t.id, db))!;
    expect(ready.ready).toBe(1);
    expect(ready.rows.map((r) => [r.name, r.ready])).toEqual([
      ["Ready Kid", true],
      ["New Kid", false],
    ]);

    await db.insert(studySets).values({ teamId: t.id, name: "Week 1", topicIds: [a!.id, b!.id], positions: ["QB"] });
    const [set] = await progress.setProgress(t.id, db);
    expect(set!.rows.map((r) => [r.name, r.known])).toEqual([["Ready Kid", 1]]); // only QBs; Veer known, Smash not yet
    expect(set!.done).toBe(0);
  });

  it("brings a coach's work over from another of their teams, as drafts to approve", async () => {
    const { createTeam } = await import("@/server/teams");
    const { copyFromTeam } = await import("@/teach/reuse");
    const last = await createTeam(db, ownerId, "Last season", "youth");
    const next = await createTeam(db, ownerId, "This season", "youth");
    await db.update(teams).set({ naming: { positions: [], direction: { words: [], rule: "R" }, call_order: [], formations: [], formation_tags: [], backfields: [], motions: [], plays: [], other: [] } }).where(eq(teams.id, last.id));
    const [lt] = await db.insert(topics).values({ teamId: last.id, name: "Veer", nameKey: "VEER" }).returning();
    const [nt] = await db.insert(topics).values({ teamId: next.id, name: "Veer", nameKey: "VEER" }).returning();
    await db.insert(gaps).values([
      { teamId: last.id, topicId: lt!.id, question: "Who is the pitch key?", status: "answered", answer: "The OLB." },
      { teamId: last.id, topicId: lt!.id, question: "How deep is F?", status: "approved", answer: "5 yards." },
    ]);
    await db.insert(gaps).values({ teamId: next.id, topicId: nt!.id, question: "Who is the pitch key?", status: "open" });
    await db.insert(lessons).values({ teamId: last.id, topicId: lt!.id, audience: "ALL", title: "Veer", body: "b", status: "approved", sourcePages: [52] });
    await db.insert(questions).values([
      choice(last.id, lt!.id, 0),
      choice(last.id, lt!.id, 1, { format: "tap", data: { kind: "tap", pageNo: 1, target: { x: 0, y: 0, w: 1, h: 1, label: "F" } } as never }),
    ]);
    const [own] = await db.insert(questions).values(choice(next.id, nt!.id, 5, { status: "draft", tier: "core" })).returning();

    const r = await copyFromTeam(last.id, next.id, ownerId, db);
    expect(r).toEqual({ naming: 1, topics: 1, answers: 2, lessons: 1, questions: 1 }); // the tap question stays behind
    const g = await db.select().from(gaps).where(eq(gaps.topicId, nt!.id));
    expect(g.map((x) => [x.question, x.status, x.answer]).sort()).toEqual([
      ["How deep is F?", "answered", "5 yards."],
      ["Who is the pitch key?", "answered", "The OLB."],
    ]);
    const ls = await db.select().from(lessons).where(eq(lessons.topicId, nt!.id));
    expect(ls.map((l) => [l.status, l.sourcePages])).toEqual([["draft", []]]);
    const qs = await db.select().from(questions).where(eq(questions.topicId, nt!.id));
    expect(qs.find((q) => q.id === own!.id)?.tier).toBe("reserve"); // its own draft steps aside
    expect(qs.filter((q) => q.id !== own!.id).map((q) => [q.status, q.tier])).toEqual([["draft", "core"]]);
    expect((await db.select().from(teams).where(eq(teams.id, next.id)))[0]!.naming).not.toBeNull();
  });

  it("saves a play drawn in the builder; it's approved without the old read checklist and quizzed", async () => {
    const { createTeam } = await import("@/server/teams");
    const plays = await import("@/server/plays");
    const { quizPlays } = await import("@/server/quiz");
    const { emptyPlay } = await import("@/domain/play");
    const t = await createTeam(db, ownerId, "Builder", "youth");
    const p = (id: string, x: number, y: number, extra = {}) => ({ id, position: id, x, y, on_ball: y === 0, side: x < 0 ? "left" : "right", split: null, assignment_type: "unknown", route: null, block: null, path: null, notes: null, ...extra });
    const data = {
      ...emptyPlay("SPREAD RIGHT, SMASH"),
      play_type: "pass",
      players: [p("C", 0, 0), p("QB", 0, -5), p("Z", 14, 0, { assignment_type: "route", route: { name: "hitch", depth_yards: "unknown", break_direction: "unknown", notes: null, path: null } })],
    };
    const id = await plays.createBuiltPlay(t.id, data, db);
    const row = (await plays.getPlay(t.id, id, db))!;
    expect(plays.isConverted(row) && plays.isBuilt(row)).toBe(true);
    await plays.approvePlay(t.id, id, ownerId, "youth", db);
    expect((await quizPlays(t.id, undefined, db)).map((q) => q.data.name)).toEqual(["SPREAD RIGHT, SMASH"]);
  });

  it("shares approved answers by concept with other coaches, only from teams that share", async () => {
    const { createTeam } = await import("@/server/teams");
    const { sharedAnswers } = await import("@/teach/shared");
    const s = await createTeam(db, ownerId, "Sharer", "youth");
    const t = await createTeam(db, otherId, "Learner", "youth");
    const [st] = await db.insert(topics).values({ teamId: s.id, name: "Zarkmills", nameKey: "ZARKMILLS" }).returning();
    await db.insert(gaps).values({ teamId: s.id, topicId: st!.id, question: "QB read on Zarkmills?", status: "approved", answer: "Read the safety: post or dig." });
    expect(await sharedAnswers(t.id, "Zarkmills concept", 20, db)).toContain("Read the safety: post or dig.");
    expect(await sharedAnswers(s.id, "Zarkmills", 20, db)).toBe(""); // never your own team
    expect(await sharedAnswers(t.id, "Quokkaflood", 20, db)).toBe(""); // a different concept
    await db.update(teams).set({ shareAnswers: false }).where(eq(teams.id, s.id));
    expect(await sharedAnswers(t.id, "Zarkmills concept", 20, db)).toBe("");
  });
});
