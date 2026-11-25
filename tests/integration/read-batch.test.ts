/**
 * Reading the whole playbook behind the scenes: once the naming rules are
 * confirmed, every drawing is cropped and sent as one batch to a cheaper
 * model, and the answers become draft plays (linemen named the team's way).
 * The batch API is faked; everything else is real.
 */
import { and, eq } from "drizzle-orm";
import type Anthropic from "@anthropic-ai/sdk";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDb, type Db } from "@/db";
import { plays, teams, uploadPages, uploads, users } from "@/db/schema";
import { aiUsage, jobs, readBatches, teachPages, topics } from "@/db/teach-schema";
import type { Drawing } from "@/teach/ai";

let db: Db;
let pool: Pool;
let ownerId: string;

beforeAll(async () => {
  process.env.DATABASE_URL = inject("dbUrl");
  process.env.BETTER_AUTH_SECRET ??= "test-secret";
  process.env.AUTO_READ_LOCAL = "1";
  ({ db, pool } = createDb(inject("dbUrl")));
  const [u] = await db.insert(users).values({ name: "Head", email: `batch${Date.now()}@x.test` }).returning();
  ownerId = u!.id;
});
afterAll(async () => {
  const { useBatchApi } = await import("@/teach/read-batch");
  useBatchApi(null);
  await pool?.end();
});

const wait = async (ok: () => Promise<boolean>) => {
  for (let i = 0; i < 200 && !(await ok()); i++) await new Promise((r) => setTimeout(r, 50));
};

// what the model answers for a formation drawing: generic line letters
const answer: Drawing = {
  is_play: true,
  kind: "formation",
  formation_name: "TRIPS RIGHT",
  players: [
    ["LT", -2.6],
    ["LG", -1.3],
    ["C", 0],
    ["RG", 1.3],
    ["RT", 2.6],
  ].map(([id, x]) => ({ id: id as string, at: { x: x as number, y: 0 }, on_ball: true, does: "nothing_drawn" as const, route_name: null, path: null })),
  motion: null,
  front: null,
};

describe("reading the whole playbook in the background", () => {
  it("crops, sends one batch to the cheaper model, and turns the answers into plays", { timeout: 60_000 }, async () => {
    const { createTeam } = await import("@/server/teams");
    const rb = await import("@/teach/read-batch");
    const team = await createTeam(db, ownerId, "Batchers", "youth");
    await db.update(teams).set({ aiAccess: "on" }).where(eq(teams.id, team.id));

    // a two-page playbook with three drawings, page images stored
    const [up] = await db.insert(uploads).values({ teamId: team.id, filename: "b.pdf", mediaKey: "b", status: "ready", pageCount: 2 }).returning();
    const pgs = await db
      .insert(uploadPages)
      .values([1, 2].map((n) => ({ teamId: team.id, uploadId: up!.id, pageNo: n, width: 612, height: 792, imageKey: `b${team.id}${n}` })))
      .returning();
    const box = { x: 10, y: 10, w: 200, h: 150 };
    await db.insert(teachPages).values([
      { teamId: team.id, uploadId: up!.id, pageId: pgs[0]!.id, pageNo: 1, status: "decoded", diagrams: [{ id: "a", label: "TRIPS RIGHT", box }, { id: "b", label: "SLOT RIGHT", box: { ...box, y: 300 } }] },
      { teamId: team.id, uploadId: up!.id, pageId: pgs[1]!.id, pageNo: 2, status: "decoded", diagrams: [{ id: "c", label: "SPREAD RIGHT, SMASH", box }] },
    ]);
    await db.insert(topics).values({ teamId: team.id, name: "Formations", nameKey: "FORMATIONS", sort: 0, pageNos: [1, 2] });
    const { createCanvas } = await import("@napi-rs/canvas");
    const { media } = await import("@/media/store");
    const page = createCanvas(612, 792);
    page.getContext("2d").fillRect(20, 20, 100, 100);
    for (const p of pgs) await media().put(p.imageKey, new Uint8Array(page.toBuffer("image/png")), "image/png");
    // the team already names its line play side / back side
    const pst = [["BST", -2.6], ["BSG", -1.3], ["C", 0], ["PSG", 1.3], ["PST", 2.6]].map(([id, x]) => ({ ...answer.players[0]!, id: id as string, at: { x: x as number, y: 0 } }));
    const { toPlayData } = await import("@/domain/extraction");
    const { drawingToExtracted } = await import("@/teach/convert");
    await db.insert(plays).values({ teamId: team.id, name: "PRO RIGHT", data: toPlayData(drawingToExtracted({ ...answer, players: pst }, "PRO RIGHT"), (x, y) => [x, y]), status: "approved", extraction: "done" });

    // a fake batch API: remembers what was sent, answers the first drawing and fails the second
    const sent: Anthropic.Messages.BatchCreateParams.Request[] = [];
    let ended = false;
    rb.useBatchApi({
      create: async (requests) => {
        sent.push(...requests);
        return { id: "msgbatch_test" };
      },
      ended: async () => ended,
      results: () => ({
        async *[Symbol.asyncIterator]() {
          const usage = { input_tokens: 4800, output_tokens: 1500 } as Anthropic.Usage;
          const message = { content: [{ type: "text", text: JSON.stringify(answer) }], usage } as unknown as Anthropic.Message;
          yield { custom_id: "d0", result: { type: "succeeded", message } } as Anthropic.Messages.MessageBatchIndividualResponse;
          yield { custom_id: "d1", result: { type: "errored", error: { type: "error", error: { type: "api_error", message: "x" } } } } as unknown as Anthropic.Messages.MessageBatchIndividualResponse;
        },
      }),
    });

    // nothing happens until the naming rules are confirmed
    expect(await rb.ensureBatchRead(team.id, null, db)).toBeNull();
    await db.update(teams).set({ namingApprovedAt: new Date() }).where(eq(teams.id, team.id));
    const row = await rb.ensureBatchRead(team.id, null, db);
    expect(row?.keys).toEqual(["1.a", "1.b", "2.c"]);
    expect(row?.model).toBe("claude-sonnet-5-5");
    // asking again doesn't start a second one
    expect((await rb.ensureBatchRead(team.id, null, db))?.id).toBe(row!.id);

    // the worker crops everything and sends one request per drawing
    const batchRow = async () => (await db.select().from(readBatches).where(eq(readBatches.id, row!.id)))[0]!;
    await wait(async () => (await batchRow()).status === "submitted");
    expect((await batchRow()).cropped).toBe(3);
    expect(sent.map((r) => [r.custom_id, r.params.model])).toEqual([
      ["d0", "claude-sonnet-5-5"],
      ["d1", "claude-sonnet-5-5"],
      ["d2", "claude-sonnet-5-5"],
    ]);
    expect(JSON.stringify(sent[0]!.params.messages)).toContain("TRIPS RIGHT");

    // read-ahead leaves the batch's drawings alone
    const { readAhead } = await import("@/teach/read-ahead");
    const ahead = await readAhead(team.id, null, db);
    expect(ahead.queued).toBe(0);
    expect(ahead.batch).toEqual({ status: "submitted", drawings: 3 });

    // not back yet: nothing moves; back: the answers become plays
    expect(await rb.checkBatches(team.id, db)).toBe(0);
    ended = true;
    expect(await rb.checkBatches(team.id, db)).toBe(1);
    await wait(async () => (await batchRow()).status === "imported");
    expect(await batchRow()).toMatchObject({ status: "imported", made: 1, failed: 1 });
    const made = await db.select().from(plays).where(and(eq(plays.teamId, team.id), eq(plays.name, "TRIPS RIGHT")));
    expect(made).toHaveLength(1);
    // linemen named the team's way: play side is the formation's side (right)
    expect(made[0]!.data!.players.map((p) => p.id)).toEqual(["BST", "BSG", "C", "PSG", "PST"]);
    // spend recorded at the batch price
    const spend = await db.select().from(aiUsage).where(eq(aiUsage.teamId, team.id));
    expect(spend.map((s) => s.model)).toEqual(["claude-sonnet-5-5:batch"]);
    // done once: no second batch
    expect(await rb.ensureBatchRead(team.id, null, db)).toBeNull();
    expect((await db.select().from(jobs).where(and(eq(jobs.teamId, team.id), eq(jobs.kind, "read_batch")))).length).toBe(1);
  });

  it("only the background worker can ask the site to crop", async () => {
    const { POST } = await import("@/app/api/teach/crops/route");
    const res = await POST(new Request("http://x/api/teach/crops", { method: "POST", body: JSON.stringify({ batch: "00000000-0000-0000-0000-000000000000", sig: "nope" }) }));
    expect(res.status).toBe(403);
  });
});
