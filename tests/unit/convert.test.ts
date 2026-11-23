/** A drawing read in field yards becomes a play with paths relative to each player. */
import { describe, expect, it, vi } from "vitest";
import { toPlayData } from "@/domain/extraction";
import type { Drawing } from "@/teach/ai";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/media/store", () => ({ media: () => ({}) }));

describe("drawing -> play", () => {
  it("keeps yards, makes paths relative, and maps kinds", async () => {
    const { drawingToExtracted } = await import("@/teach/convert");
    const d: Drawing = {
      is_play: true,
      kind: "pass",
      formation_name: "SPREAD RIGHT",
      players: [
        { id: "C", at: { x: 0, y: 0 }, on_ball: true, does: "pass_pro", route_name: null, path: null },
        { id: "Z", at: { x: 14, y: 0 }, on_ball: true, does: "route", route_name: "hitch", path: [{ x: 14, y: 0 }, { x: 14, y: 6 }, { x: 13, y: 5 }] },
        { id: "Q", at: { x: 0, y: -5 }, on_ball: false, does: "nothing_drawn", route_name: null, path: null },
      ],
      motion: null,
      front: "4-3",
    };
    const play = toPlayData(drawingToExtracted(d, "SMASH"), (x, y) => [x, y]);
    expect(play.play_type).toBe("pass");
    expect(play.formation.name).toBe("SPREAD RIGHT");
    const z = play.players.find((p) => p.id === "Z")!;
    expect([z.x, z.y]).toEqual([14, 0]);
    expect(z.route?.name).toBe("hitch");
    expect(z.route?.path).toEqual([[0, 0], [0, 6], [-1, 5]]);
    expect(play.players.find((p) => p.id === "QB")?.y).toBe(-5);
    expect(play.coaching_points).toEqual(["Drawn vs 4-3"]);
    expect(toPlayData(drawingToExtracted({ ...d, kind: "formation" }, "X"), (x, y) => [x, y]).play_type).toBe("unknown");
  });
});
