import { describe, expect, it } from "vitest";
import { emptyPlay, flipPlay, PlayDataSchema, type Player } from "@/domain/play";

const z: Player = {
  id: "Z", position: "Z", x: 12, y: 0, on_ball: true, side: "right", split: null, assignment_type: "route",
  route: { name: "hitch", depth_yards: 5, break_direction: "unknown", notes: null, path: [[0, 0], [0, 5], [-0.5, 4.5]], options: [[[0, 3], [2, 6]]] },
  block: null, path: null, notes: null,
};

describe("option routes", () => {
  it("survive saving and flip with the play", () => {
    const play = PlayDataSchema.parse({ ...emptyPlay("SPREAD RIGHT, HITCH"), players: [z] });
    expect(play.players[0]!.route!.options).toEqual([[[0, 3], [2, 6]]]);
    expect(flipPlay(play).players[0]!.route!.options).toEqual([[[-0, 3], [-2, 6]]]);
  });
});

describe("naming the offensive line the team's way", () => {
  const line = ["LT", "LG", "C", "RG", "RT"].map((id, i) => ({ ...z, id, position: id, x: (i - 2) * 1.3, route: null, assignment_type: "unknown" as const }));
  it("maps left/right to play side/back side by the formation's side, and back", async () => {
    const { renameLinemen } = await import("@/domain/play");
    expect(renameLinemen(line, "ps", "right").map((p) => p.id)).toEqual(["BST", "BSG", "C", "PSG", "PST"]);
    expect(renameLinemen(line, "ps", "left").map((p) => p.id)).toEqual(["PST", "PSG", "C", "BSG", "BST"]);
    const ps = renameLinemen(line, "ps", "right");
    expect(renameLinemen(ps, "lt", "right").map((p) => p.id)).toEqual(["LT", "LG", "C", "RG", "RT"]);
    // a mixed line is left alone rather than doubling a letter
    expect(renameLinemen([...line, { ...line[0]!, id: "PST" }], "ps", "right").map((p) => p.id)).toContain("LT");
  });
});
