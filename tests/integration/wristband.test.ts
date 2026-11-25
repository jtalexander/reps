/**
 * The team's wristband: numbers that stay with a play from week to week, one
 * play per number, and only the team's own plays.
 */
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDb, type Db } from "@/db";
import { plays, users } from "@/db/schema";
import { emptyPlay } from "@/domain/play";

let db: Db;
let pool: Pool;
let ownerId: string;

beforeAll(async () => {
  process.env.DATABASE_URL = inject("dbUrl");
  ({ db, pool } = createDb(inject("dbUrl")));
  const [u] = await db.insert(users).values({ name: "HC", email: `wb${Date.now()}@x.test` }).returning();
  ownerId = u!.id;
});
afterAll(async () => {
  await pool?.end();
});

describe("wristband", () => {
  it("keeps numbers week to week and gives each number to one play", { timeout: 60_000 }, async () => {
    const { createTeam } = await import("@/server/teams");
    const team = await createTeam(db, ownerId, "Banded", "youth");
    const other = await createTeam(db, ownerId, "Not us", "youth");
    const row = (teamId: string, name: string) => ({ teamId, name, data: emptyPlay(name), side: "offense" as const, playType: "run", status: "approved" as const, extraction: "done" as const });
    const [a, b, c] = await db.insert(plays).values([row(team.id, "POWER"), row(team.id, "COUNTER"), row(team.id, "SMASH")]).returning();
    const [theirs] = await db.insert(plays).values(row(other.id, "THEIRS")).returning();

    const w = await import("@/server/wristband");
    let band = await w.ensureNumbers(team.id, [a!.id, b!.id, theirs!.id]);
    expect(band.numbers).toEqual({ [a!.id]: "1", [b!.id]: "2" });

    // next week SMASH joins and COUNTER leaves: POWER keeps 1, SMASH gets 3
    band = await w.ensureNumbers(team.id, [a!.id, c!.id]);
    expect(band.numbers[a!.id]).toBe("1");
    expect(band.numbers[c!.id]).toBe("3");

    // giving SMASH number 1 takes it from POWER, by name
    const r = await w.setCallNumber(team.id, c!.id, "1");
    expect(r.bumped).toBe("POWER");
    expect(r.wristband.numbers[a!.id]).toBeUndefined();
    await expect(w.setCallNumber(team.id, theirs!.id, "9")).rejects.toThrow();
    await expect(w.setCallNumber(team.id, c!.id, "1; drop")).rejects.toThrow();

    // band setups: each coach keeps his own; numbers are the same on all of them
    const main = band.bands[0]!.id;
    band = await w.saveBand(team.id, main, { windows: 2, width: 3.5, calling: { ...band.bands[0]!.calling, formation: "code", codeWords: { PRO: ["ALABAMA"] }, dummies: 2, dummyWords: ["BINGO", "BLUE"] } });
    expect(band.bands[0]).toMatchObject({ windows: 2, width: 3.5, calling: { formation: "code", dummies: 2 } });
    await expect(w.saveBand(team.id, main, { windows: 7 })).rejects.toThrow();
    const made = await w.createBand(team.id, main, "JV band");
    expect(made.band).toMatchObject({ name: "JV band", windows: 2 });
    band = await w.saveBand(team.id, made.band.id, { style: "grid" });
    expect(band.bands.map((x) => x.style)).toEqual(["list", "grid"]);
    band = await w.saveTeamCalling(team.id, { teachBand: made.band.id, numbering: "code" });
    expect(band).toMatchObject({ teachBand: made.band.id, numbering: "code" });
    band = await w.deleteBand(team.id, made.band.id);
    expect(band.bands).toHaveLength(1);
    expect(band.teachBand).toBeNull();
    await expect(w.deleteBand(team.id, main)).rejects.toThrow();

    band = await w.renumberCalls(team.id, [b!.id, c!.id], "order");
    expect([band.numbers[b!.id], band.numbers[c!.id]]).toEqual(["1", "2"]);
    band = await w.setCallLabel(team.id, b!.id, "CTR");
    expect(band.labels[b!.id]).toBe("CTR");
    band = await w.setOnBand(team.id, main, a!.id, false);
    expect(band.bands[0]!.off).toEqual([a!.id]);
    band = await w.setOnBand(team.id, main, a!.id, true);
    expect(band.bands[0]!.off).toEqual([]);
    band = await w.saveBand(team.id, main, { qbDrawings: true, pictures: 4 });
    expect(band.bands[0]).toMatchObject({ qbDrawings: true, pictures: 4 });
    await expect(w.saveBand(team.id, main, { pictures: 5 })).rejects.toThrow();
    // a concept number: the same number from any formation
    band = await w.ensureNumbers(team.id, ["c:SMASH", "c:POWER"]);
    // concept numbers are their own set: they start fresh, not after the play numbers
    expect(Object.values(band.numbers).filter(Boolean)).toContain(band.numbers["c:SMASH"]);
    band = await w.renumberCalls(team.id, ["c:POWER", "c:SMASH"], "order");
    expect([band.numbers["c:POWER"], band.numbers["c:SMASH"]]).toEqual(["1", "2"]);
    expect(band.numbers[b!.id]).toBe("1"); // the play numbers are untouched
    expect((await w.ensureNumbers(team.id, ["c:<script>"])).numbers["c:<script>"]).toBeUndefined();
    expect((await w.getWristband(other.id)).numbers).toEqual({});
  });
});
