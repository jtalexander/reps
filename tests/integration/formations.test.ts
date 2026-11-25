/**
 * Saved formations: save once, every play starts from it, and moving a player
 * in the formation moves him in the plays drawn from it. Plus the Playbook's
 * tags and saved views.
 */
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDb, type Db } from "@/db";
import { plays, users } from "@/db/schema";
import { emptyPlay, type PlayData, type Player } from "@/domain/play";

let db: Db;
let pool: Pool;
let ownerId: string;

beforeAll(async () => {
  process.env.DATABASE_URL = inject("dbUrl");
  ({ db, pool } = createDb(inject("dbUrl")));
  const [u] = await db.insert(users).values({ name: "OC", email: `oc${Date.now()}@x.test` }).returning();
  ownerId = u!.id;
});
afterAll(async () => {
  await pool?.end();
});

const p = (id: string, x: number, y: number, more: Partial<Player> = {}): Player => ({ id, position: id, x, y, on_ball: Math.abs(y) < 0.8, side: x < -1 ? "left" : x > 1 ? "right" : "middle", split: null, assignment_type: "unknown", route: null, block: null, path: null, notes: null, ...more });
const OL = [p("LT", -2.6, 0), p("LG", -1.3, 0), p("C", 0, 0), p("RG", 1.3, 0), p("RT", 2.6, 0)];
const trips = [...OL, p("X", -14, 0), p("H", 6, -1), p("Y", 9, -1), p("Z", 14, 0), p("QB", 0, -5), p("RB", -1.5, -5)];

describe("formations and the playbook", () => {
  it("saves a formation, lines plays up from it, and moves plays drawn from it", { timeout: 60_000 }, async () => {
    const { createTeam } = await import("@/server/teams");
    const team = await createTeam(db, ownerId, "Formations", "youth");
    const f = await import("@/server/formations");
    const { formation } = await f.saveFormation(team.id, { name: "Trips right", players: trips.map((x) => ({ ...x, assignment_type: "route" as const, route: { name: "go", depth_yards: "unknown" as const, break_direction: "unknown" as const, notes: null, path: null } })) }, {}, db);
    expect(formation.name).toBe("TRIPS RIGHT");
    expect(formation.players.every((x) => x.route === null && x.assignment_type === "unknown")).toBe(true); // a formation has no jobs
    await expect(f.saveFormation(team.id, { name: "TRIPS  RIGHT", players: trips }, {}, db)).rejects.toThrow(/already have/);

    // the builder's Formation pick lines up from the saved formation (left is the mirror)
    const { lineupFor } = await import("@/teach/lineup");
    const lu = await lineupFor(team.id, { formation: "TRIPS", dir: "LEFT", tag: "" }, null, db);
    expect(lu).toMatchObject({ kind: "lineup", from: "your TRIPS RIGHT formation", mirrored: true });

    // two plays drawn from it, one from something else
    const smash: PlayData = { ...emptyPlay("TRIPS RIGHT, SMASH"), play_type: "pass", formation: { ...emptyPlay().formation, name: "Trips Right" }, players: trips.map((x) => (x.id === "H" ? { ...x, assignment_type: "route" as const, route: { name: "corner", depth_yards: 10, break_direction: "out" as const, notes: null, path: null } } : x)) };
    const [a] = await db.insert(plays).values({ teamId: team.id, name: smash.name, data: smash, playType: "pass", status: "approved", extraction: "done" }).returning();
    const other: PlayData = { ...smash, name: "DOUBLES RIGHT, SMASH", formation: { ...smash.formation, name: "DOUBLES RIGHT" } };
    const [b] = await db.insert(plays).values({ teamId: team.id, name: other.name, data: other, playType: "pass", status: "approved", extraction: "done" }).returning();
    expect((await f.formationUse(team.id, db))["TRIPS RIGHT"]).toBe(1);

    // the coach tightens the H in the formation, and moves the plays drawn from it too
    const moved = trips.map((x) => (x.id === "H" ? { ...x, x: 5.5 } : x));
    const r = await f.saveFormation(team.id, { id: formation.id, name: "TRIPS RIGHT", players: moved }, { movePlays: true }, db);
    expect(r.moved).toBe(1);
    const [a2] = await db.select().from(plays).where(eq(plays.id, a!.id));
    const h = a2!.data!.players.find((x) => x.id === "H")!;
    expect(h.x).toBe(5.5);
    expect(h.route?.name).toBe("corner"); // his job stays
    const [b2] = await db.select().from(plays).where(eq(plays.id, b!.id));
    expect(b2!.data!.players.find((x) => x.id === "H")!.x).toBe(6); // a play from another formation doesn't move

    // the formation drawings in a playbook can be saved in one tap
    await db.insert(plays).values({ teamId: team.id, name: "PRO RIGHT (21 personnel)", data: { ...emptyPlay("PRO RIGHT"), players: [...OL, p("Y", 4, 0), p("X", -14, 0), p("Z", 12, -1), p("QB", 0, -1), p("F", 0, -4), p("RB", 0, -6.5)] }, playType: "unknown", status: "draft", extraction: "done" });
    const fromBook = await f.playbookFormations(team.id, db);
    expect(fromBook.map((x) => x.name)).toEqual(["PRO RIGHT"]);

    // the Playbook finds plays by their tags, and saves views
    const pb = await import("@/server/playbook");
    const rows = await pb.playbookPlays(team.id, db);
    const smashRow = rows.find((x) => x.name === "TRIPS RIGHT, SMASH")!;
    expect(smashRow.facets.personnel?.[0]?.value).toBe("10");
    expect(smashRow.facets.direction?.[0]?.value).toBe("right");
    expect(rows.find((x) => x.name.startsWith("PRO RIGHT"))!.facets.personnel?.[0]?.value).toBe("21");
    const views = await pb.saveView(team.id, "Trips passes", "formation=TRIPS&type=pass", db);
    expect(views.map((v) => v.name)).toEqual(["Trips passes"]);
    expect(await pb.saveView(team.id, "trips passes", "formation=TRIPS", db)).toHaveLength(1); // same name replaces
    await expect(pb.saveView(team.id, "Nothing", "", db)).rejects.toThrow();
    expect(await pb.deleteView(team.id, views[0]!.id, db)).toHaveLength(1);
  });
});
