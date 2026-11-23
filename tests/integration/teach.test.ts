/**
 * Teach, end to end on a real Postgres with Claude mocked: decode a page,
 * find gaps, coach answers, write drafts, coach approves, players answer in
 * every format, mastery, ask-the-playbook, and team separation.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { createDb, type Db } from "@/db";
import { players, plays, uploadPages, uploads, users } from "@/db/schema";
import { gaps, jobs, lessons, questionFlags, questionSrs, questions, teachPages, topics } from "@/db/teach-schema";

const askedWith: string[] = [];
vi.mock("@/teach/ai", () => ({
  MODEL: "mock",
  decodePage: vi.fn(async (page: { pageNo: number; width: number; height: number }) => ({
    is_playbook_content: true,
    section: "SMASH",
    topic: "Smash",
    summary: "Smash: #1 hitch, #2 corner.",
    facts: [
      { text: "#1 runs a Hitch at 6 yards.", applies_to: ["#1"], kind: "rule" },
      { text: "#2 runs a Corner, break at 10.", applies_to: ["#2"], kind: "rule" },
      { text: "QB reads the cornerback.", applies_to: ["QB"], kind: "read" },
    ],
    diagrams: [{ label: "SMASH RIGHT", x: page.width * 0.1, y: page.height * 0.1, w: page.width * 0.5, h: page.height * 0.3 }],
  })),
  findGaps: vi.fn(async () => ({
    gaps: [
      { question: "What's the QB drop?", why: "Timing.", applies_to: ["QB"], page_no: 1, suggestion: "3-step" },
      { question: "Where does #2 align?", why: "Spacing.", applies_to: ["#2"], page_no: 1, suggestion: null },
    ],
  })),
  writeTopic: vi.fn(async (_t: string, _f: string, answered: string) => ({
    lessons: [
      { audience: "ALL", title: "Smash basics", body: `- #1 Hitch\n- #2 Corner\n${answered ? "Coach says: " + answered : ""}`, source_pages: [1] },
      { audience: "QB", title: "QB on Smash", body: "Read the corner.", source_pages: [1] },
    ],
    questions: [
      { audience: ["WR"], format: "choice", prompt: "#2 runs?", choices: ["Corner", "Hitch", "Go"], order_items: [], tap: null, model_answer: null, key_points: [], explanation: "Corner.", source_pages: [1], show_page: null, show_diagram_label: null },
      { audience: ["QB"], format: "order", prompt: "Order the reads", choices: [], order_items: ["Corner", "Hitch"], tap: null, model_answer: null, key_points: [], explanation: "Corner then hitch.", source_pages: [1], show_page: null, show_diagram_label: null },
      { audience: ["WR"], format: "tap", prompt: "Tap #2", choices: [], order_items: [], tap: { page_no: 1, diagram_label: "SMASH RIGHT", target_label: "#2", x: 200, y: 200, w: 40, h: 40 }, model_answer: null, key_points: [], explanation: "#2 is the slot.", source_pages: [1], show_page: null, show_diagram_label: null },
      { audience: ["ALL"], format: "open", prompt: "What is Smash?", choices: [], order_items: [], tap: null, model_answer: "Hitch and corner", key_points: ["hitch", "corner"], explanation: "It's a high-low.", source_pages: [1], show_page: null, show_diagram_label: null },
      { audience: ["ALL"], format: "choice", prompt: "Draft that stays a draft", choices: ["a", "b"], order_items: [], tap: null, model_answer: null, key_points: [], explanation: "x", source_pages: [1], show_page: null, show_diagram_label: null },
    ],
  })),
  // key: the first open question of each topic; same: questions with identical wording
  triageGaps: vi.fn(async (list: string) => {
    const lines = list.split("\n").map((l) => {
      const m = l.match(/^(\d+)\. \[(.+?)\]( \(already answered\))? (.*?)(?: \(why: .*\))?$/)!;
      return { n: Number(m[1]), topic: m[2]!, open: !m[3], q: m[4]! };
    });
    const key = lines.filter((l, i) => l.open && lines.findIndex((x) => x.open && x.topic === l.topic) === i).map((l) => l.n);
    const firstOf = new Map<string, number>();
    const same: Array<{ keep: number; also: number[] }> = [];
    for (const l of lines) {
      const k = firstOf.get(l.q);
      if (k === undefined) firstOf.set(l.q, l.n);
      else (same.find((g) => g.keep === k) ?? same[same.push({ keep: k, also: [] }) - 1]!).also.push(l.n);
    }
    return { key, same };
  }),
  // core: the LAST `limit` questions (so the pick is visibly not just "the first five"), plus a bad number to ignore
  readDrawing: vi.fn(async (_png: Uint8Array, _w: number, _h: number, label: string, _notes: string, naming: string) => ({
    is_play: true,
    kind: "run",
    formation_name: "SPREAD RIGHT",
    players: [
      { id: "C", at: { x: 0, y: 0 }, on_ball: true, does: "block", route_name: null, path: [{ x: 0, y: 0 }, { x: 0, y: 1 }] },
      { id: naming.includes("X = Split end") ? "QB" : "B1", at: { x: 0, y: -5 }, on_ball: false, does: "carry", route_name: null, path: [{ x: 0, y: -5 }, { x: 2, y: 3 }] },
    ],
    motion: null,
    front: label.includes(" vs ") ? label.split(" vs ")[1]! : null,
  })),
  draftNaming: vi.fn(async (material: string) => ({
    positions: [{ letter: "X", name: "Split end", role: "WR", notes: material.includes("TRIPS RIGHT STACK") ? "away from the call" : "" }],
    direction: { words: [{ word: "RIGHT", side: "right" }], rule: "RIGHT puts Y and Z on the right" },
    call_order: ["Formation", "Play", "Direction"],
    formations: [{ word: "TRIPS", means: "three receivers to the call side", pages: [1] }],
    formation_tags: [{ word: "STACK", means: "receivers stack", pages: [1] }],
    backfields: [],
    motions: [],
    plays: [{ word: "VEER", means: "inside veer option", pages: [2] }],
    other: [],
  })),
  pickCore: vi.fn(async (_t: string, list: string, limit: number) => {
    const n = list.split(/\r?\n/).length;
    return { core: [99, ...Array.from({ length: limit }, (_, i) => n - i)] };
  }),
  gradeOpen: vi.fn(async (_p: string, _m: string, _k: string[], answer: string) => ({ score: /hitch/i.test(answer) && /corner/i.test(answer) ? 1 : 0.3, feedback: "ok" })),
  askPlaybook: vi.fn(async (_q: string, _pos: string, material: string) => {
    askedWith.push(material);
    return { answered: true, answer: "From the lesson.", source_pages: [1] };
  }),
}));

const SPARTANS = path.resolve(__dirname, "../../../chalk/reference/Spartans Purple -Abram.pdf");
let db: Db;
let pool: Pool;
let teamA: { id: string };
let teamB: { id: string };
let coachId: string;

beforeAll(async () => {
  process.env.DATABASE_URL = inject("dbUrl");
  process.env.MEDIA_DIR = mkdtempSync(path.join(tmpdir(), "reps-teach-media-"));
  ({ db, pool } = createDb(inject("dbUrl")));
  const [u] = await db.insert(users).values({ name: "Coach", email: `t${Date.now()}@x.test` }).returning();
  coachId = u!.id;
  const { createTeam } = await import("@/server/teams");
  teamA = await createTeam(db, coachId, "Teach A", "high_school");
  teamB = await createTeam(db, coachId, "Teach B", "high_school");
});
afterAll(async () => {
  await pool?.end();
});

describe("teach loop", () => {
  let topicId = "";
  it("decodes a page into a topic with facts and diagram regions in page points", { timeout: 120_000 }, async () => {
    const { createUpload, renderPages } = await import("@/server/ingest");
    const svc = await import("@/teach/service");
    const up = await createUpload(teamA.id, coachId, "s.pdf", new Uint8Array(readFileSync(SPARTANS)), db);
    await renderPages(teamA.id, up.id, 1, 1, db);
    const [id] = await svc.prepareDecode(teamA.id, up.id, [1], db);
    const job = await svc.newJob(teamA.id, "decode_page", id!, db);
    expect((await svc.runJob(job.id, db))?.status).toBe("done");
    const [page] = await db.select().from(teachPages).where(eq(teachPages.id, id!));
    expect(page!.status).toBe("decoded");
    expect(page!.facts).toHaveLength(3);
    // a box at 10% of the image width is 10% of the page width in points
    expect(page!.diagrams[0]!.box.x).toBeCloseTo(page!.diagrams[0]!.box.x, 1);
    expect(page!.diagrams[0]!.box.x).toBeGreaterThan(70);
    expect(page!.diagrams[0]!.box.x).toBeLessThan(90);
    const [t] = await db.select().from(topics).where(eq(topics.teamId, teamA.id));
    expect(t!.name).toBe("Smash");
    expect(t!.pageNos).toEqual([1]);
    topicId = t!.id;
  });

  it("finds gaps; the coach answers one, approves none, skips one", async () => {
    const svc = await import("@/teach/service");
    await svc.runJob((await svc.newJob(teamA.id, "find_gaps", topicId, db)).id, db);
    const gs = await db.select().from(gaps).where(eq(gaps.topicId, topicId));
    expect(gs).toHaveLength(2);
    const drop = gs.find((g) => g.suggestion)!;
    const align = gs.find((g) => !g.suggestion)!;
    await expect(svc.answerGap(teamA.id, align.id, { kind: "approve" }, coachId, db)).rejects.toThrow(/no suggestion/);
    await svc.answerGap(teamA.id, drop.id, { kind: "answer", text: "5-step from gun" }, coachId, db);
    await svc.answerGap(teamA.id, align.id, { kind: "skip" }, coachId, db);
    // another team can't answer this team's questions
    await svc.answerGap(teamB.id, drop.id, { kind: "skip" }, coachId, db).catch(() => undefined);
    const [after] = await db.select().from(gaps).where(eq(gaps.id, drop.id));
    expect(after!.status).toBe("answered");
  });

  it("writes drafts that include the coach's answers; nothing is live until approved", async () => {
    const svc = await import("@/teach/service");
    await svc.runJob((await svc.newJob(teamA.id, "write_topic", topicId, db)).id, db);
    const ls = await db.select().from(lessons).where(eq(lessons.topicId, topicId));
    expect(ls.every((l) => l.status === "draft")).toBe(true);
    expect(ls[0]!.body).toContain("5-step from gun");
    const qs = await db.select().from(questions).where(eq(questions.topicId, topicId));
    expect(qs.map((q) => q.format).sort()).toEqual(["choice", "choice", "open", "order", "tap"]);
    const tap = qs.find((q) => q.format === "tap")!;
    expect(tap.image?.box).not.toBeNull();
    const before = await svc.approvedFor(teamA.id, "WR", db);
    expect(before.questions).toHaveLength(0);
    expect(before.lessons).toHaveLength(0);
  });

  it("approved items reach the right positions; players are graded in every format", async () => {
    const svc = await import("@/teach/service");
    const qs = await db.select().from(questions).where(eq(questions.topicId, topicId));
    const ls = await db.select().from(lessons).where(eq(lessons.topicId, topicId));
    for (const q of qs.filter((x) => x.prompt !== "Draft that stays a draft")) await svc.reviewQuestion(teamA.id, q.id, { status: "approved" }, coachId, db);
    for (const l of ls) await svc.reviewLesson(teamA.id, l.id, { status: "approved" }, coachId, db);

    const wr = await svc.approvedFor(teamA.id, "WR", db);
    expect(wr.questions.map((q) => q.format).sort()).toEqual(["choice", "open", "tap"]);
    expect(wr.lessons.map((l) => l.audience)).toEqual(["ALL"]);
    const qb = await svc.approvedFor(teamA.id, "QB", db);
    expect(qb.questions.map((q) => q.format).sort()).toEqual(["open", "order"]);

    const [p] = await db.insert(players).values({ teamId: teamA.id, name: "W", positions: ["X"] }).returning();
    const choice = qs.find((q) => q.prompt === "#2 runs?")!;
    const answerId = choice.data.kind === "choice" ? choice.data.answer : "";
    const pub = svc.publicQuestion(choice);
    expect(pub).not.toHaveProperty("data");
    const r1 = await svc.gradeAttempt({ teamId: teamA.id, playerId: p!.id, questionId: choice.id, given: answerId, responseMs: 900, mode: "learn" }, db);
    expect(r1.correct).toBe(true);
    const tap = qs.find((q) => q.format === "tap")!;
    const t = tap.data.kind === "tap" ? tap.data.target : { x: 0, y: 0, w: 0, h: 0 };
    expect((await svc.gradeAttempt({ teamId: teamA.id, playerId: p!.id, questionId: tap.id, given: { x: t.x + t.w / 2, y: t.y + t.h / 2 }, responseMs: 1, mode: "practice" }, db)).correct).toBe(true);
    expect((await svc.gradeAttempt({ teamId: teamA.id, playerId: p!.id, questionId: tap.id, given: { x: 0, y: 0 }, responseMs: 1, mode: "practice" }, db)).correct).toBe(false);
    const open = qs.find((q) => q.format === "open")!;
    const o = await svc.gradeAttempt({ teamId: teamA.id, playerId: p!.id, questionId: open.id, given: "hitch and corner", responseMs: 1, mode: "practice" }, db);
    expect(o.correct).toBe(true);
    const order = qs.find((q) => q.format === "order")!;
    expect((await svc.gradeAttempt({ teamId: teamA.id, playerId: p!.id, questionId: order.id, given: ["Corner", "Hitch"], responseMs: 1, mode: "practice" }, db)).correct).toBe(true);

    // a draft can't be answered, and another team can't use these questions
    const draft = qs.find((q) => q.prompt === "Draft that stays a draft")!;
    await expect(svc.gradeAttempt({ teamId: teamA.id, playerId: p!.id, questionId: draft.id, given: "c0", responseMs: 1, mode: "practice" }, db)).rejects.toThrow(/not found/i);
    const [pb] = await db.insert(players).values({ teamId: teamB.id, name: "Other" }).returning();
    await expect(svc.gradeAttempt({ teamId: teamB.id, playerId: pb!.id, questionId: choice.id, given: answerId, responseMs: 1, mode: "practice" }, db)).rejects.toThrow(/not found/i);

    const m = (await svc.mastery(teamA.id, db)).find((x) => x.playerId === p!.id && x.topicId === topicId)!;
    // latest scores: choice 1, tap 0 (second try missed), open 1, order 1
    expect(m.score).toBeCloseTo(0.75, 2);
  });

  it("ask the playbook only sees approved material", async () => {
    const svc = await import("@/teach/service");
    const [p] = await db.select().from(players).where(and(eq(players.teamId, teamA.id), eq(players.name, "W")));
    await svc.ask(teamA.id, p!.id, "WR", "X", "What is Smash?", db);
    const material = askedWith.at(-1)!;
    expect(material).toContain("Smash basics");
    expect(material).toContain("5-step from gun");
    expect(material).not.toContain("Draft that stays a draft");
    expect(material).not.toContain("QB on Smash");
  });

  it("ranks the coach's questions and links repeats across topics; one answer covers both", async () => {
    const svc = await import("@/teach/service");
    const [other] = await db.insert(topics).values({ teamId: teamA.id, name: "Smash-In", nameKey: "SMASH-IN", sort: 9 }).returning();
    await db.insert(gaps).values([
      { teamId: teamA.id, topicId: other!.id, question: "Who calls the side?", suggestion: "QB", sort: 0 },
      { teamId: teamA.id, topicId: other!.id, question: "What's the nod on the corner?", suggestion: "Head fake inside", sort: 1 },
      { teamId: teamA.id, topicId: other!.id, question: "How deep is #1?", sort: 2 },
    ]);
    const [smash] = await db.insert(gaps).values({ teamId: teamA.id, topicId, question: "What's the nod on the corner?", suggestion: "Head fake inside", sort: 5 }).returning();
    const r = await svc.triageTeamGaps(teamA.id, db);
    expect(r.repeats).toBe(1);
    const after = await db.select().from(gaps).where(eq(gaps.teamId, teamA.id));
    const dup = after.find((g) => g.topicId === other!.id && g.question.includes("nod"))!;
    expect(dup.dupOf).toBe(smash!.id);
    expect(after.find((g) => g.id === smash!.id)!.priority).toBe("key");
    expect(after.find((g) => g.question === "How deep is #1?")!.priority).toBe("optional");
    // answering the original answers the repeat; reopening reopens it
    await svc.answerGap(teamA.id, smash!.id, { kind: "answer", text: "Two steps at the post" }, coachId, db);
    let [d] = await db.select().from(gaps).where(eq(gaps.id, dup.id));
    expect(d!.status).toBe("answered");
    expect(d!.answer).toBe("Two steps at the post");
    await svc.answerGap(teamA.id, smash!.id, { kind: "reopen" }, coachId, db);
    [d] = await db.select().from(gaps).where(eq(gaps.id, dup.id));
    expect(d!.status).toBe("open");
    // accept all: only the topic's open main questions with a suggestion
    expect(await svc.acceptSuggestions(teamB.id, other!.id, coachId, db)).toBe(0);
    expect(await svc.acceptSuggestions(teamA.id, other!.id, coachId, db)).toBe(1);
    const who = (await db.select().from(gaps).where(eq(gaps.topicId, other!.id))).find((g) => g.question === "Who calls the side?")!;
    expect(who.status).toBe("approved");
    expect(who.answer).toBe("QB");
  });

  it("approves a whole topic at once, except items still being edited, and only for its own team", async () => {
    const svc = await import("@/teach/service");
    const drafts = await db.select().from(questions).where(and(eq(questions.topicId, topicId), eq(questions.status, "draft")));
    expect(drafts).toHaveLength(1);
    expect(await svc.approveTopic(teamA.id, topicId, coachId, [drafts[0]!.id], db)).toEqual({ lessons: 0, questions: 0 });
    expect(await svc.approveTopic(teamB.id, topicId, coachId, [], db)).toEqual({ lessons: 0, questions: 0 });
    expect(await svc.approveTopic(teamA.id, topicId, coachId, [], db)).toEqual({ lessons: 0, questions: 1 });
    const [q] = await db.select().from(questions).where(eq(questions.id, drafts[0]!.id));
    expect(q!.status).toBe("approved");
    expect(q!.approvedBy).toBe(coachId);
  });

  it("players flag a question; the coach sees it and resolves it", async () => {
    const svc = await import("@/teach/service");
    const [p] = await db.select().from(players).where(and(eq(players.teamId, teamA.id), eq(players.name, "W")));
    const [pb] = await db.select().from(players).where(eq(players.teamId, teamB.id));
    const [q] = await db.select().from(questions).where(and(eq(questions.topicId, topicId), eq(questions.format, "choice")));
    await svc.flagQuestion(teamA.id, p!.id, q!.id, "The hitch is at 5, not 6", db);
    await expect(svc.flagQuestion(teamB.id, pb!.id, q!.id, "x", db)).rejects.toThrow(/not found/i);
    expect(await svc.openFlags(teamB.id, db)).toHaveLength(0);
    const open = await svc.openFlags(teamA.id, db);
    expect(open).toHaveLength(1);
    expect(open[0]!.flag.note).toBe("The hitch is at 5, not 6");
    await svc.resolveFlags(teamA.id, q!.id, coachId, db);
    expect(await svc.openFlags(teamA.id, db)).toHaveLength(0);
    const [f] = await db.select().from(questionFlags).where(eq(questionFlags.questionId, q!.id));
    expect(f!.status).toBe("resolved");
  });
  it("runs each AI job once, reports status only to its own team, and fails stuck jobs", async () => {
    const svc = await import("@/teach/service");
    process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-00";
    const { signJob, verifyJob } = await import("@/teach/dispatch");
    const job = await svc.newJob(teamA.id, "triage", teamA.id, db);
    expect((await svc.jobStatus(teamA.id, job.id, db)).status).toBe("queued");
    await expect(svc.jobStatus(teamB.id, job.id, db)).rejects.toThrow();
    const done = await svc.runJob(job.id, db);
    expect(done?.status).toBe("done");
    expect(done?.result).toMatchObject({ key: expect.any(Number), optional: expect.any(Number), repeats: expect.any(Number) });
    // a repeated or replayed call doesn't run it again
    const { triageGaps } = await import("@/teach/ai");
    const calls = vi.mocked(triageGaps).mock.calls.length;
    await svc.runJob(job.id, db);
    expect(vi.mocked(triageGaps).mock.calls.length).toBe(calls);
    // a job that never started, and one that ran past the 15-minute limit, end as failed
    const lost = await svc.newJob(teamA.id, "find_gaps", topicId, db);
    const hung = await svc.newJob(teamA.id, "write_topic", topicId, db);
    await db.update(jobs).set({ status: "running" }).where(eq(jobs.id, hung.id));
    await db.execute(sql`update jobs set updated_at = now() - interval '20 minutes' where id in (${lost.id}, ${hung.id})`);
    expect((await svc.jobStatus(teamA.id, lost.id, db)).status).toBe("failed");
    expect((await svc.jobStatus(teamA.id, hung.id, db)).status).toBe("failed");
    // only signed job ids reach the background runner
    expect(verifyJob(job.id, signJob(job.id))).toBe(true);
    expect(verifyJob(lost.id, signJob(job.id))).toBe(false);
    expect(verifyJob(job.id, "nope")).toBe(false);
  });
  it("reads a whole playbook on the server: every step once, in order, even with two workers at once", { timeout: 180_000 }, async () => {
    const { createUpload, renderPages } = await import("@/server/ingest");
    const run = await import("@/teach/playbook-run");
    const ai = await import("@/teach/ai");
    const { createTeam } = await import("@/server/teams");
    const teamC = await createTeam(db, coachId, "Teach C", "high_school");
    const up = await createUpload(teamC.id, coachId, "c.pdf", new Uint8Array(readFileSync(SPARTANS)), db);
    await renderPages(teamC.id, up.id, 1, 2, db);
    const calls = () => [ai.decodePage, ai.findGaps, ai.triageGaps, ai.writeTopic].map((f) => vi.mocked(f).mock.calls.length);
    const before = calls();
    const r = await run.startPlaybookRun(teamC.id, up.id, db);
    expect((await run.startPlaybookRun(teamC.id, up.id, db)).id).toBe(r.id); // one run at a time
    expect((await run.runProgress(teamC.id, db))?.stage).toBe("reading");
    await Promise.all([run.workTeam(teamC.id, null, 120_000, db), run.workTeam(teamC.id, null, 120_000, db)]);
    // 2 pages read, 1 topic asked, 1 sort, 1 topic written: nothing twice
    expect(calls().map((n, i) => n - before[i]!)).toEqual([2, 1, 1, 1]);
    expect(await run.runProgress(teamC.id, db)).toBeNull();
    const [done] = await db.select().from(jobs).where(eq(jobs.id, r.id));
    expect(done!.status).toBe("done");
    const [t] = await db.select().from(topics).where(eq(topics.teamId, teamC.id));
    expect(t!.gapsFoundAt).not.toBeNull();
    expect(t!.generatedAt).not.toBeNull();
    // running it again only does what's missing (here: nothing)
    const again = await run.startPlaybookRun(teamC.id, up.id, db);
    await run.workTeam(teamC.id, null, 60_000, db);
    expect(calls().map((n, i) => n - before[i]!)).toEqual([2, 1, 2, 1]); // just the cheap re-sort
    expect((await db.select().from(jobs).where(eq(jobs.id, again.id)))[0]!.status).toBe("done");
    // stop drops queued work; other teams' runs are untouched
    await renderPages(teamC.id, up.id, 3, 3, db);
    await run.startPlaybookRun(teamC.id, up.id, db);
    await run.stopPlaybookRun(teamA.id, db);
    expect(await run.runProgress(teamC.id, db)).not.toBeNull();
    await run.stopPlaybookRun(teamC.id, db);
    expect(await run.runProgress(teamC.id, db)).toBeNull();
    await run.workTeam(teamC.id, null, 60_000, db);
    expect(calls()[0]! - before[0]!).toBe(2);
    expect((await run.lastRun(teamC.id, db))?.error).toBeNull(); // a coach's Stop needs no explaining
  });
  it("stops a whole-playbook run when the Anthropic account runs out of credits, and picks up where it stopped", { timeout: 180_000 }, async () => {
    const { createUpload, renderPages } = await import("@/server/ingest");
    const run = await import("@/teach/playbook-run");
    const svc = await import("@/teach/service");
    const ai = await import("@/teach/ai");
    const { createTeam } = await import("@/server/teams");
    const teamD = await createTeam(db, coachId, "Teach D", "high_school");
    const up = await createUpload(teamD.id, coachId, "d.pdf", new Uint8Array(readFileSync(SPARTANS)), db);
    await renderPages(teamD.id, up.id, 1, 2, db);
    const broke = new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}');
    vi.mocked(ai.decodePage).mockRejectedValueOnce(broke);
    const decodes = vi.mocked(ai.decodePage).mock.calls.length;
    await run.startPlaybookRun(teamD.id, up.id, db);
    await run.workTeam(teamD.id, null, 60_000, db);
    // one call hit the wall; the other page was not tried
    expect(vi.mocked(ai.decodePage).mock.calls.length - decodes).toBe(1);
    expect(await run.runProgress(teamD.id, db)).toBeNull();
    expect(await run.lastRun(teamD.id, db)).toEqual({ status: "failed", error: svc.OUT_OF_CREDITS, failedSteps: 2 });
    expect(svc.accountProblem("Overloaded")).toBeNull();
    // credits back: the next tap does both pages and finishes
    await run.startPlaybookRun(teamD.id, up.id, db);
    await run.workTeam(teamD.id, null, 120_000, db);
    expect(vi.mocked(ai.decodePage).mock.calls.length - decodes).toBe(3);
    expect(await run.lastRun(teamD.id, db)).toEqual({ status: "done", error: null, failedSteps: 0 });
  });
  it("keeps the review to a core set per topic, with the rest in reserve, and puts the install first", { timeout: 120_000 }, async () => {
    const svc = await import("@/teach/service");
    const run = await import("@/teach/playbook-run");
    const ai = await import("@/teach/ai");
    const { createTeam } = await import("@/server/teams");
    const teamE = await createTeam(db, coachId, "Teach E", "high_school");
    const [t1, t2] = await db
      .insert(topics)
      .values([
        { teamId: teamE.id, name: "Smash", nameKey: "SMASH", sort: 0, gapsFoundAt: new Date(), generatedAt: new Date() },
        { teamId: teamE.id, name: "Veer", nameKey: "VEER", sort: 1, gapsFoundAt: new Date(), generatedAt: new Date() },
      ])
      .returning();
    const q = (topicId: string, i: number) => ({
      teamId: teamE.id,
      topicId,
      format: "choice" as const,
      prompt: `Q${i}?`,
      data: { kind: "choice" as const, choices: [{ id: "c0", text: "yes" }, { id: "c1", text: "no" }], answer: "c0" },
      explanation: "x",
      sort: i,
    });
    await db.insert(lessons).values({ teamId: teamE.id, topicId: t1!.id, audience: "ALL", title: "Smash", body: "b" });
    // 8 drafts on Smash written before the core set existed (tier null), 3 on Veer
    await db.insert(questions).values([...Array.from({ length: 8 }, (_, i) => q(t1!.id, i)), ...Array.from({ length: 3 }, (_, i) => q(t2!.id, i))]);

    // unsorted drafts still count as waiting, so nothing is hidden
    let ov = await svc.topicOverview(teamE.id, db);
    expect(ov.find((t) => t.id === t1!.id)).toMatchObject({ questionsDraft: 8, questionsReserve: 0, questionsUnsorted: 8 });

    // a whole-playbook run with nothing else to do just sorts them
    const calls = vi.mocked(ai.pickCore).mock.calls.length;
    const up = await db.insert(uploads).values({ teamId: teamE.id, filename: "e.pdf", mediaKey: "e", status: "ready", pageCount: 1 }).returning();
    await db.insert(uploadPages).values({ teamId: teamE.id, uploadId: up[0]!.id, pageNo: 1, width: 612, height: 792, imageKey: "e1" });
    await db.insert(teachPages).values({ teamId: teamE.id, uploadId: up[0]!.id, pageId: (await db.select().from(uploadPages).where(eq(uploadPages.uploadId, up[0]!.id)))[0]!.id, pageNo: 1, status: "decoded" });
    await run.startPlaybookRun(teamE.id, up[0]!.id, db);
    await run.workTeam(teamE.id, null, 60_000, db);
    // two topics to sort = a second worker in this process; wait for the last one to close the run
    let ended = await run.lastRun(teamE.id, db);
    for (let i = 0; !ended && i < 100; i++) {
      await new Promise((r) => setTimeout(r, 100));
      ended = await run.lastRun(teamE.id, db);
    }
    expect(ended).toEqual({ status: "done", error: null, failedSteps: 0 });
    expect(vi.mocked(ai.pickCore).mock.calls.length - calls).toBe(1); // Veer has only 3: all core, no AI call
    ov = await svc.topicOverview(teamE.id, db);
    expect(ov.find((t) => t.id === t1!.id)).toMatchObject({ questionsDraft: 5, questionsReserve: 3, questionsUnsorted: 0 });
    expect(ov.find((t) => t.id === t2!.id)).toMatchObject({ questionsDraft: 3, questionsReserve: 0 });
    const tiers = await db.select().from(questions).where(eq(questions.topicId, t1!.id)).orderBy(questions.sort);
    expect(tiers.map((x) => x.tier)).toEqual(["reserve", "reserve", "reserve", "core", "core", "core", "core", "core"]);

    // the coach moves one, then approves the core set: lessons + core only
    await svc.reviewQuestion(teamE.id, tiers[0]!.id, { tier: "core" }, coachId, db);
    await svc.reviewQuestion(teamE.id, tiers[7]!.id, { tier: "reserve" }, coachId, db);
    expect(await svc.approveTopic(teamE.id, t1!.id, coachId, [], db)).toEqual({ lessons: 1, questions: 5 });
    const after = await db.select().from(questions).where(eq(questions.topicId, t1!.id)).orderBy(questions.sort);
    expect(after.filter((x) => x.status === "approved").map((x) => x.prompt)).toEqual(["Q0?", "Q3?", "Q4?", "Q5?", "Q6?"]);
    // reserve stays a draft until approved from the reserve pile, which never touches lessons
    expect(await svc.approveTopic(teamE.id, t1!.id, coachId, [tiers[1]!.id], db, "reserve")).toEqual({ lessons: 0, questions: 2 });

    // a rewrite with the core already live adds to reserve without asking the AI
    await db.insert(questions).values([q(t1!.id, 20), q(t1!.id, 21)]);
    const before = vi.mocked(ai.pickCore).mock.calls.length;
    expect(await svc.pickCoreQuestions(teamE.id, t1!.id, db)).toEqual({ core: 0, reserve: 3 });
    expect(vi.mocked(ai.pickCore).mock.calls.length).toBe(before);

    // install: in, first in line, out
    await svc.setInstall(teamE.id, t2!.id, true, db);
    await svc.setInstall(teamA.id, t2!.id, true, db); // another team's coach can't touch it
    ov = await svc.topicOverview(teamE.id, db);
    expect(ov.filter((t) => t.inInstall).map((t) => t.name)).toEqual(["Veer"]);
    await svc.clearInstall(teamA.id, db);
    expect((await svc.topicOverview(teamE.id, db)).some((t) => t.inInstall)).toBe(true);
    await svc.clearInstall(teamE.id, db);
    expect((await svc.topicOverview(teamE.id, db)).some((t) => t.inInstall)).toBe(false);

    // a study set: practice draws only from the set's topics
    await svc.approveTopic(teamE.id, t2!.id, coachId, [], db);
    const [pe] = await db.insert(players).values({ teamId: teamE.id, name: "E", positions: ["X"] }).returning();
    const all = await svc.practiceSet(teamE.id, pe!.id, "WR", 50, undefined, db);
    expect(new Set(all.map((x) => x.topicId))).toEqual(new Set([t1!.id, t2!.id]));
    const veerOnly = await svc.practiceSet(teamE.id, pe!.id, "WR", 50, [t2!.id], db);
    expect(veerOnly.length).toBe(3);
    expect(veerOnly.every((x) => x.topicId === t2!.id)).toBe(true);

    // missed questions come back, but never more than half a session while there's new material
    const { questions: pool } = await svc.approvedFor(teamE.id, "WR", db);
    const missed = pool.slice(0, 6);
    await db.insert(questionSrs).values(
      missed.map((x) => ({ teamId: teamE.id, playerId: pe!.id, questionId: x.id, box: 0, dueAt: new Date(Date.now() - 60_000), seen: 1, correct: 0 })),
    );
    const ids = new Set(missed.map((x) => x.id));
    const next = await svc.practiceSet(teamE.id, pe!.id, "WR", 4, undefined, db);
    expect(next.length).toBe(4);
    expect(next.filter((x) => ids.has(x.id)).length).toBe(2);
  });
  it("lists the playbook's drawings by topic for the Playbook tab, team-scoped", { timeout: 60_000 }, async () => {
    const { playbookDrawings, playbookPages, matches } = await import("@/teach/drawings");
    const { createTeam } = await import("@/server/teams");
    const teamF = await createTeam(db, coachId, "Teach F", "high_school");
    const [up] = await db.insert(uploads).values({ teamId: teamF.id, filename: "f.pdf", mediaKey: "f", status: "ready", pageCount: 2 }).returning();
    const pgs = await db
      .insert(uploadPages)
      .values([1, 2].map((n) => ({ teamId: teamF.id, uploadId: up!.id, pageNo: n, width: 612, height: 792, imageKey: `f${n}` })))
      .returning();
    const box = { x: 10, y: 10, w: 200, h: 150 };
    await db.insert(teachPages).values([
      { teamId: teamF.id, uploadId: up!.id, pageId: pgs[0]!.id, pageNo: 1, status: "decoded", diagrams: [{ id: "d1", label: "TRIPS RIGHT STACK", box }, { id: "d2", label: "junk", box: { ...box, w: 0 } }] },
      { teamId: teamF.id, uploadId: up!.id, pageId: pgs[1]!.id, pageNo: 2, status: "decoded", diagrams: [{ id: "d1", label: "VEER RIGHT vs 4-3", box }] },
    ]);
    await db.insert(topics).values([
      { teamId: teamF.id, name: "Formation tags", nameKey: "FORMATION TAGS", sort: 0, pageNos: [1] },
      { teamId: teamF.id, name: "Veer", nameKey: "VEER", sort: 1, pageNos: [2], inInstall: true },
    ]);
    const ds = await playbookDrawings(teamF.id, db);
    expect(ds.map((d) => [d.label, d.topicName, d.inInstall])).toEqual([
      ["TRIPS RIGHT STACK", "Formation tags", false],
      ["VEER RIGHT vs 4-3", "Veer", true],
    ]);
    expect(ds.filter((d) => matches(d, "veer 4-3")).map((d) => d.key)).toEqual(["2.d1"]);
    expect(ds.filter((d) => matches(d, "trips stack")).length).toBe(1);
    expect((await playbookPages(teamF.id, db)).map((p) => p.pageNo)).toEqual([1, 2]);
    expect((await playbookDrawings(teamA.id, db)).some((d) => d.label === "TRIPS RIGHT STACK")).toBe(false);

    // naming rules: drafted as a background job from what Reps read, saved as a draft, then confirmed
    const svc = await import("@/teach/service");
    const naming = await import("@/teach/naming");
    const job = await svc.newJob(teamF.id, "naming", teamF.id, db);
    const done = await svc.executeJob(job, db);
    expect(done?.status).toBe("done");
    expect(done?.result).toEqual({ positions: 1, formations: 1, plays: 1 });
    let got = await naming.getNaming(teamF.id, db);
    expect(got.naming?.positions[0]).toMatchObject({ letter: "X", notes: "away from the call" }); // drew on the drawing labels
    expect(got.approvedAt).toBeNull();
    await naming.saveNaming(teamF.id, { ...got.naming!, formations: [...got.naming!.formations, { word: "TRIO", means: "3x1, Y on the line", pages: [1] }] }, true, db);
    got = await naming.getNaming(teamF.id, db);
    expect(got.naming?.formations.map((f) => f.word)).toEqual(["TRIPS", "TRIO"]);
    expect(got.approvedAt).not.toBeNull();
    expect((await naming.getNaming(teamA.id, db)).naming).toBeNull();
    const { namingBrief } = await import("@/domain/naming");
    expect(namingBrief(got.naming)).toContain("X = Split end (WR)");

    // real plays: convert the install's drawings as background jobs, check, approve the topic
    const { createCanvas } = await import("@napi-rs/canvas");
    const { media } = await import("@/media/store");
    const page = createCanvas(612, 792);
    page.getContext("2d").fillRect(20, 20, 100, 100);
    for (const p of pgs) await media().put(p.imageKey, new Uint8Array(page.toBuffer("image/png")), "image/png");
    const run = await import("@/teach/convert-run");
    const q = await run.queueConversions(teamF.id, "install", null, db);
    expect(q).toEqual({ queued: 1, failed: 0, left: 0 }); // only Veer is in the install
    expect((await run.queueConversions(teamF.id, "install", null, db)).queued).toBe(0); // already queued
    // the inline workers pick it up; wait until it's done
    for (let i = 0; i < 100 && (await run.conversionProgress(teamF.id, db)).waiting > 0; i++) await new Promise((r) => setTimeout(r, 100));
    const made = await db.select().from(plays).where(and(eq(plays.teamId, teamF.id), eq(plays.archived, false)));
    expect(made.map((p) => [p.name, p.status, p.extraction])).toEqual([["VEER RIGHT vs 4-3", "draft", "done"]]);
    expect(made[0]!.data?.players.map((p) => p.id)).toEqual(["C", "QB"]); // named with the team's rules
    expect(made[0]!.data?.players[1]!.path).toEqual([[0, 0], [2, 8]]); // field yards, relative to the player
    const veer = ds.find((d) => d.label.startsWith("VEER"))!;
    expect(await run.approveConvertedTopic(teamA.id, veer.topicId!, coachId, db)).toBe(0); // another team's coach can't
    expect(await run.approveConvertedTopic(teamF.id, veer.topicId!, coachId, db)).toBe(1);
    // one play at a time: unapprove, approve again without the old read checklist, an edit sends it back to check
    const { approvedPlays, approvePlay, savePlayData, unapprovePlay } = await import("@/server/plays");
    const statusOf = async () => (await db.select().from(plays).where(eq(plays.id, made[0]!.id)))[0]!.status;
    await unapprovePlay(teamF.id, made[0]!.id, "high_school", db);
    expect(await statusOf()).toBe("draft");
    await approvePlay(teamF.id, made[0]!.id, coachId, "high_school", db);
    expect(await statusOf()).toBe("approved");
    await savePlayData(teamF.id, made[0]!.id, made[0]!.data, { level: "high_school", database: db });
    expect(await statusOf()).toBe("draft");
    await approvePlay(teamF.id, made[0]!.id, coachId, "high_school", db);
    // converted plays stay out of the old play quizzes for now
    expect(await approvedPlays(teamF.id, undefined, db)).toEqual([]);
    const { groupByFront } = await import("@/domain/fronts");
    const named = [{ name: "VEER RIGHT vs 4-3" }, { name: "VEER RIGHT vs 5-2" }, { name: "SMASH" }];
    expect(groupByFront(named, true).map((g) => [g.base, g.items.map((x) => x.front)])).toEqual([
      ["VEER RIGHT", ["4-3", "5-2"]],
      ["SMASH", [null]],
    ]);
    expect(groupByFront(named, false).length).toBe(3);
    // the same play drawn on two pages (two versions) stays two plays
    expect(groupByFront([{ name: "VEER RIGHT vs 4-3", page: 53 }, { name: "VEER RIGHT vs 5-2", page: 53 }, { name: "VEER RIGHT vs 4-3", page: 54 }], true).map((g) => g.items.length)).toEqual([2, 1]);
  });
});
