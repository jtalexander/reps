/**
 * Defense and matchups end to end (Claude mocked): a defensive playbook's
 * drawing becomes a defensive call, the coach approves it without the
 * offense's checklist, Reps suggests what each play is good against, the
 * game plan finds plays by what the opponent shows, and defenders are quizzed.
 */
import { and, eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { createDb, type Db } from "@/db";
import { players, plays, teams, uploadPages, uploads, users } from "@/db/schema";
import { teachPages, topics } from "@/db/teach-schema";
import { emptyPlay, type Player } from "@/domain/play";

vi.mock("@/teach/ai", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/teach/ai")>();
  return {
    ...real,
    readDrawing: vi.fn(async () => {
      throw new Error("an offensive read wasn't expected");
    }),
    readDefDrawing: vi.fn(async () => ({
      is_play: true,
      front: "4-3 Over",
      coverage: "Cover 3",
      stunt: null,
      pressure: "Mike A",
      defenders: [
        { id: "E", at: { x: -3.5, y: 1 }, does: "rush", gap: "C", zone: null, man: null, path: null },
        { id: "M", at: { x: 0, y: 4.5 }, does: "blitz", gap: "A", zone: null, man: null, path: null },
        { id: "W", at: { x: -3, y: 4.5 }, does: "zone_drop", gap: null, zone: "hook", man: null, path: null },
        { id: "LC", at: { x: -13, y: 6 }, does: "zone_drop", gap: null, zone: "deep_third", man: null, path: null },
      ],
      offense: [{ id: "X", at: { x: -14, y: 0 } }],
    })),
  };
});

let db: Db;
let pool: Pool;
let ownerId: string;

beforeAll(async () => {
  process.env.DATABASE_URL = inject("dbUrl");
  ({ db, pool } = createDb(inject("dbUrl")));
  const [u] = await db.insert(users).values({ name: "DC", email: `def${Date.now()}@x.test` }).returning();
  ownerId = u!.id;
});
afterAll(async () => {
  await pool?.end();
});

const skill = (id: string, x: number, y: number): Player => ({ id, position: id, x, y, on_ball: y > -0.75, side: x < 0 ? "left" : "right", split: null, assignment_type: "unknown", route: null, block: null, path: null, notes: null });

describe("defensive playbooks and what plays are good against", () => {
  it("reads a defensive call, approves it, tags it and puts it in the game plan and quizzes", { timeout: 60_000 }, async () => {
    const { createTeam } = await import("@/server/teams");
    const team = await createTeam(db, ownerId, "Defenders", "youth");
    await db.update(teams).set({ aiAccess: "on" }).where(eq(teams.id, team.id));

    // a defensive playbook: one page, one drawing, and the page says what it's good against
    const [up] = await db.insert(uploads).values({ teamId: team.id, filename: "d.pdf", mediaKey: "d", status: "ready", pageCount: 1, side: "defense" }).returning();
    const [pg] = await db.insert(uploadPages).values({ teamId: team.id, uploadId: up!.id, pageNo: 1, width: 612, height: 792, imageKey: `d${team.id}` }).returning();
    await db.insert(teachPages).values({
      teamId: team.id,
      uploadId: up!.id,
      pageId: pg!.id,
      pageNo: 1,
      status: "decoded",
      diagrams: [{ id: "a", label: "4-3 OVER, COVER 3, MIKE A", box: { x: 10, y: 10, w: 200, h: 150 } }],
      facts: [{ id: "f1", text: "Our best call vs Trips.", appliesTo: ["ALL"], kind: "call", source: "page", pageNo: 1 }],
    });
    await db.insert(topics).values({ teamId: team.id, name: "Base defense", nameKey: "BASE DEFENSE", sort: 0, pageNos: [1] });
    const { createCanvas } = await import("@napi-rs/canvas");
    const { media } = await import("@/media/store");
    await media().put(pg!.imageKey, new Uint8Array(createCanvas(612, 792).toBuffer("image/png")), "image/png");

    // read with the defensive reader, saved as a defensive call
    const { convertDrawing } = await import("@/teach/convert");
    const { playId } = await convertDrawing(team.id, "1.a", db);
    const [row] = await db.select().from(plays).where(eq(plays.id, playId));
    expect(row!.side).toBe("defense");
    expect(row!.data!.defense).toEqual({ front: "4-3 Over", coverage: "Cover 3", stunt: null, pressure: "Mike A" });
    expect(row!.data!.players.map((p) => [p.id, p.assignment_type])).toEqual([
      ["E", "rush"],
      ["M", "blitz"],
      ["W", "zone_drop"],
      ["LC", "zone_drop"],
    ]);

    // approved without the offense's read checklist
    const { approvePlay } = await import("@/server/plays");
    expect((await approvePlay(team.id, playId, ownerId, "youth", db)).status).toBe("approved");

    // Reps suggests from the page ("best call vs Trips") and the coverage (Cover 3 stops the run and the pass)
    const m = await import("@/server/matchups");
    const looks = await m.playLooks(team.id, playId, db);
    expect(looks!.side).toBe("defense");
    expect(looks!.suggested.map((s) => [s.key, s.from])).toEqual([
      ["trips", "playbook"],
      ["run", "concept"],
      ["pass", "concept"],
    ]);
    // a defensive call can be tagged with an offensive concept
    expect(looks!.options.some((o) => o.key === "c:smash")).toBe(true);
    await m.setPlayLook(team.id, playId, "trips", true, db);
    await m.setPlayLook(team.id, playId, "pass", false, db);
    const after = await m.playLooks(team.id, playId, db);
    expect(after!.yes.map((t) => t.label)).toEqual(["Trips (3x1)"]);
    expect(after!.suggested.map((s) => s.key)).toEqual(["run"]); // "pass" was dropped and isn't suggested again
    await expect(m.setPlayLook(team.id, playId, "drop table", true, db)).rejects.toThrow();

    // an offensive play: Smash, suggested from its concept
    const smash = { ...emptyPlay("SPREAD RIGHT, SMASH"), concept_key: "smash", play_type: "pass" as const, players: [skill("X", -14, 0), skill("QB", 0, -5)] };
    const [off] = await db.insert(plays).values({ teamId: team.id, name: smash.name, data: smash, status: "approved", extraction: "done", qbReady: true }).returning();
    await m.keepSuggestedLooks(team.id, off!.id, db);
    expect((await m.playLooks(team.id, off!.id, db))!.yes.map((t) => t.key)).toEqual(["cover_2", "zone"]);

    // the game plan: each side finds its own plays
    expect((await m.gamePlan(team.id, "offense", ["cover_2"], db)).map((r) => [r.name, r.hits])).toEqual([["SPREAD RIGHT, SMASH", ["Cover 2"]]]);
    expect((await m.gamePlan(team.id, "defense", ["trips", "run"], db)).map((r) => [r.name, r.hits])).toEqual([["4-3 OVER, COVER 3, MIKE A", ["Trips (3x1)"]]]);
    expect(await m.gamePlan(team.id, "offense", ["trips"], db)).toEqual([]);
    expect((await m.tagsInUse(team.id, "defense", db)).map((t) => t.key)).toEqual(["trips"]);

    // a linebacker is quizzed on his job in the call
    const { startSession } = await import("@/server/quiz");
    const [mike] = await db.insert(players).values({ teamId: team.id, name: "Mike", positions: ["M"] }).returning();
    const [fresh] = await db.select().from(teams).where(eq(teams.id, team.id));
    const { questions } = await startSession({ team: fresh!, playerId: mike!.id, position: "M", mode: "mixed", count: 8 }, db);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.every((q) => q.playId === playId)).toBe(true);
    const job = questions.find((q) => q.type === "assignment");
    expect(job?.prompt).toContain("what's your job");
    // his job isn't drawn on the diagram he answers from
    const { diagramData } = await import("@/server/quiz");
    const shown = diagramData(row!.data!, job!);
    expect(shown!.players.find((p) => p.id === "M")).toMatchObject({ assignment_type: "unknown", def: null, path: null });
    expect(shown!.players.find((p) => p.id === "LC")!.assignment_type).toBe("zone_drop"); // everyone else's job still shows
    expect(shown!.defense).toBeNull(); // the call's name isn't given away

    // the side is kept on the play row for the filters
    expect((await db.select({ side: plays.side }).from(plays).where(and(eq(plays.teamId, team.id), eq(plays.id, off!.id))))[0]!.side).toBe("offense");
  });
});
