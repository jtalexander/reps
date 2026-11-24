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
