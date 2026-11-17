/**
 * End-to-end through the server layer on a real Postgres: upload a real
 * playbook PDF, crop, "read" with a canned model, review, approve, quiz,
 * and check that nothing crosses between teams.
 */
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDb, type Db } from "@/db";
import { plays, players, uploadPages, users } from "@/db/schema";
import type { Extracted } from "@/domain/extraction";

import type { Pool } from "pg";
import { SMASH, ZONE_READ } from "../fixtures/sample-plays";

const HAWKS = path.resolve(__dirname, "../../../chalk/reference/Hawks playbook.pdf");
const SPARTANS = path.resolve(__dirname, "../../../chalk/reference/Spartans Purple -Abram.pdf");

let db: Db;
let pool: Pool;
let teamA: { id: string };
let teamB: { id: string };
let coach: { id: string };

// The service modules read a module-level `db`; point it at the test database.
beforeAll(async () => {
  process.env.DATABASE_URL = inject("dbUrl");
  process.env.MEDIA_DIR = mkdtempSync(path.join(tmpdir(), "reps-media-"));
  ({ db, pool } = createDb(inject("dbUrl")));
  const [u] = await db.insert(users).values({ name: "Coach", email: `c${Date.now()}@x.test` }).returning();
  coach = u!;
  const { createTeam } = await import("@/server/teams");
  teamA = await createTeam(db, coach.id, "A", "middle_school");
  teamB = await createTeam(db, coach.id, "B", "youth");
});
afterAll(async () => {
  await pool?.end();
});

/** A canned model answer: a smash-like play in pixel space of any crop. */
const canned = (name: string) => async (_png: Uint8Array, w: number, h: number): Promise<Extracted> => {
  const bx = w / 2;
  const by = h * 0.65;
  const yd = w / 40;
  const at = (x: number, y: number) => ({ x: bx + x * yd, y: by - y * yd });
  return {
    is_play: true,
    name,
    play_type: "pass",
    concept_name: "unknown",
    ball: at(0, 0),
    formation: { name: "Trips", personnel: "11", strength: "right", backfield_alignment: "gun" },
    motion: null,
    players: [
      ...["LT", "LG", "C", "RG", "RT"].map((id, i) => ({ id, position: id, ...at((i - 2) * 1.3, 0), on_ball: true, assignment_type: "pass_pro" as const, route: null, block: { type: "pass_pro", target: null }, path: null, notes: null })),
      { id: "Z", position: "Z", ...at(17, 0), on_ball: true, assignment_type: "route", route: { name: "hitch", depth_yards: 5, break_direction: "in", notes: null }, block: null, path: null, notes: null },
      { id: "Y", position: "Y", ...at(7, -1), on_ball: false, assignment_type: "route", route: { name: "corner", depth_yards: 10, break_direction: "out", notes: null }, block: null, path: null, notes: null },
      { id: "X", position: "X", ...at(-17, 0), on_ball: true, assignment_type: "route", route: { name: "go", depth_yards: null, break_direction: "none", notes: null }, block: null, path: null, notes: null },
      { id: "QB", position: "QB", ...at(0, -5), on_ball: false, assignment_type: "unknown", route: null, block: null, path: null, notes: null },
    ],
    run_details: null,
    option_details: null,
    pass_details: { protection: "unknown", qb_drop: "unknown", presnap_read: "unknown", progression: [], hot_or_sight_adjustment: null, vs_coverage: [] },
    coaching_points: [],
    confidence: [{ path: "players.6.route.name", level: "low" }],
  };
};

describe("upload pipeline", () => {
  it("splits a 6-per-page PDF and a 2-per-page PDF into plays", { timeout: 180_000 }, async () => {
    const { createUpload, renderPages, cropPage } = await import("@/server/ingest");
    const spartans = await createUpload(teamA.id, coach.id, "spartans.pdf", new Uint8Array(readFileSync(SPARTANS)), db);
    await renderPages(teamA.id, spartans.id, 1, 2, db);
    const sp = await db.select().from(uploadPages).where(eq(uploadPages.uploadId, spartans.id));
    expect(sp.map((p) => p.boxes.length)).toEqual([6, 6]);

    const hawks = await createUpload(teamA.id, coach.id, "hawks.pdf", new Uint8Array(readFileSync(HAWKS)), db);
    expect(hawks.pageCount).toBe(101);
    await renderPages(teamA.id, hawks.id, 2, 3, db);
    const hp = await db.select().from(uploadPages).where(eq(uploadPages.uploadId, hawks.id));
    expect(hp.every((p) => p.boxes.length === 2)).toBe(true);
    const made = await cropPage(teamA.id, hp[0]!.id, db);
    expect(made).toHaveLength(2);
  });

  it("reads a crop, fills reads from the library, and refuses approval until complete", { timeout: 120_000 }, async () => {
    const { extractPlayRow } = await import("@/server/ingest");
    const { approvePlay, savePlayData, getPlay } = await import("@/server/plays");
    const [row] = await db.select().from(plays).where(and(eq(plays.teamId, teamA.id), eq(plays.extraction, "pending"))).limit(1);
    const saved = await extractPlayRow(teamA.id, row!.id, { database: db, reader: canned("TRIPS RT SMASH") });
    expect(saved?.conceptKey).toBe("smash");
    expect(saved?.data?.suggested).toContain("pass_details.presnap_read");
    expect(saved?.data?.field_confidence["players.6.route.name"]).toBe("low");
    // QB has an unknown job -> needs coach input; approval refused
    expect(saved?.status).toBe("needs_coach_input");
    await expect(approvePlay(teamA.id, row!.id, coach.id, "middle_school", db)).rejects.toThrow(/QB: job/);
    // coach fills the QB's job; now approvable
    const data = structuredClone(saved!.data!);
    data.players.find((p) => p.id === "QB")!.assignment_type = "pass_pro";
    await savePlayData(teamA.id, row!.id, data, { level: "middle_school", database: db });
    const approved = await approvePlay(teamA.id, row!.id, coach.id, "middle_school", db);
    expect(approved.status).toBe("approved");
    expect(approved.qbReady).toBe(true);
    expect((await getPlay(teamA.id, row!.id, db))!.data!.suggested).toEqual([]);
  });
});

describe("concept library edits", () => {
  it("a team's concept edit flows into its plays, not other teams', and not over coach-typed reads", async () => {
    const { saveTeamConcept, getPlay } = await import("@/server/plays");
    const typed = { ...SMASH, pass_details: { ...SMASH.pass_details!, hot_or_sight_adjustment: "Coach: hot to the H" }, from_concept: SMASH.from_concept.filter((p) => p !== "pass_details.hot_or_sight_adjustment") };
    const [a] = await db.insert(plays).values({ teamId: teamA.id, name: SMASH.name, playType: "pass", conceptKey: "smash", data: typed, status: "approved", qbReady: true, extraction: "done" }).returning();
    const [b] = await db.insert(plays).values({ teamId: teamB.id, name: SMASH.name, playType: "pass", conceptKey: "smash", data: SMASH, status: "approved", qbReady: true, extraction: "done" }).returning();
    const n = await saveTeamConcept(teamA.id, "smash", { presnap_read: "Our read: eyes on the flat corner.", hot: "New hot rule" }, db);
    expect(n).toBeGreaterThanOrEqual(1);
    const a2 = (await getPlay(teamA.id, a!.id, db))!;
    expect(a2.data!.pass_details!.presnap_read).toBe("Our read: eyes on the flat corner.");
    expect(a2.data!.pass_details!.hot_or_sight_adjustment).toBe("Coach: hot to the H");
    expect(a2.status).toBe("approved");
    const b2 = (await getPlay(teamB.id, b!.id, db))!;
    expect(b2.data!.pass_details!.presnap_read).toBe(SMASH.pass_details!.presnap_read);
  });
});

describe("team separation", () => {
  it("a team cannot read or change another team's plays", async () => {
    const { getPlay, savePlayData, approvedPlays } = await import("@/server/plays");
    const [a] = await db.select().from(plays).where(eq(plays.teamId, teamA.id)).limit(1);
    expect(await getPlay(teamB.id, a!.id, db)).toBeNull();
    await expect(savePlayData(teamB.id, a!.id, SMASH, { level: "youth", database: db })).rejects.toThrow(/not found/i);
    const bIds = (await approvedPlays(teamB.id, undefined, db)).map((p) => p.id);
    expect(bIds).not.toContain(a!.id);
    expect(await approvedPlays(teamB.id, [a!.id], db)).toEqual([]);
  });
});

describe("quiz flow", () => {
  it("serves only approved plays, grades on the server, and schedules misses", async () => {
    const { startSession, answerQuestion, publicQuestion } = await import("@/server/quiz");
    // add an approved option play and an unapproved one
    await db.insert(plays).values([
      { teamId: teamA.id, name: ZONE_READ.name, playType: "option", data: ZONE_READ, status: "approved", qbReady: true, extraction: "done" },
      { teamId: teamA.id, name: "Draft play", playType: "pass", data: SMASH, status: "draft", extraction: "done" },
    ]);
    const [qb] = await db.insert(players).values({ teamId: teamA.id, name: "Sam K", positions: ["QB"] }).returning();
    const { teams } = await import("@/db/schema");
    const [team] = await db.select().from(teams).where(eq(teams.id, teamA.id));
    const { questions, session } = await startSession({ team: team!, playerId: qb!.id, position: "QB", mode: "mixed", count: 10 }, db);
    expect(questions.length).toBeGreaterThan(0);
    const approvedIds = new Set((await db.select().from(plays).where(and(eq(plays.teamId, teamA.id), eq(plays.status, "approved")))).map((p) => p.id));
    expect(questions.every((q) => approvedIds.has(q.playId))).toBe(true);
    // the client copy carries no answers
    const pub = publicQuestion(questions[0]!, 0, SMASH);
    expect(pub).not.toHaveProperty("answer");
    expect(pub).not.toHaveProperty("explanation");
    // answer wrong on purpose
    const q = questions[0]!;
    const wrong = Array.isArray(q.answer) ? [...q.answer].reverse() : q.choices.find((c) => c.id !== q.answer)!.id;
    const r = await answerQuestion({ teamId: teamA.id, playerId: qb!.id, sessionId: session.id, index: 0, given: wrong, responseMs: 2300 }, db);
    expect(r.correct).toBe(false);
    expect(r.explanation.length).toBeGreaterThan(0);
    // another team's player cannot answer this session
    const [other] = await db.insert(players).values({ teamId: teamB.id, name: "Other" }).returning();
    await expect(answerQuestion({ teamId: teamB.id, playerId: other!.id, sessionId: session.id, index: 1, given: "c0", responseMs: 1 }, db)).rejects.toThrow(/not found/i);
  });

  it("player diagrams never include the hidden route or the play's reads", async () => {
    const { diagramData } = await import("@/server/quiz");
    const d = diagramData(SMASH, { diagram: { playId: "x", flip: false, hide: "player", highlight: "Z" } })!;
    expect(d.players.find((p) => p.id === "Z")!.route).toBeNull();
    expect(d.pass_details).toBeNull();
    expect(d.name).toBe("");
  });
});
