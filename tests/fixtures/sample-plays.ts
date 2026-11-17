/**
 * Hand-built plays for tests and the local seed. Reads come from the
 * concept library (applyConcept), then are confirmed, as a coach would.
 */
import { applyConcept, LIBRARY_BY_KEY } from "../../src/domain/concepts";
import { PlayDataSchema, type PlayData } from "../../src/domain/play";

const ol = (block = "zone") =>
  ["LT", "LG", "C", "RG", "RT"].map((id, i) => ({
    id,
    position: id,
    x: (i - 2) * 1.3,
    y: 0,
    on_ball: true,
    side: i < 2 ? "left" : i > 2 ? "right" : "middle",
    assignment_type: "block",
    block: { type: block, target: null, path: null },
  }));

const rec = (id: string, x: number, y: number, route: string, depth: number | "unknown" = "unknown") => ({
  id,
  position: id,
  x,
  y,
  on_ball: y >= 0,
  side: x < 0 ? "left" : "right",
  assignment_type: "route",
  route: { name: route, depth_yards: depth, break_direction: "unknown", notes: null, path: null },
});

function finish(raw: unknown, concept?: string): PlayData {
  let d = PlayDataSchema.parse(raw);
  if (concept) d = applyConcept(d, LIBRARY_BY_KEY.get(concept)!);
  return { ...d, suggested: [] };
}

export const SMASH = finish(
  {
    name: "Trips Rt Smash",
    play_type: "pass",
    formation: { name: "Trips", personnel: "11", strength: "right", backfield_alignment: "Gun, RB left" },
    players: [
      ...ol("pass_pro"),
      rec("X", -18, 0, "go"),
      rec("Y", 7, -1, "corner", 10),
      rec("H", 11, -1, "drag", 2),
      rec("Z", 17, 0, "hitch", 5),
      { id: "QB", position: "QB", x: 0, y: -5, on_ball: false, side: "middle", assignment_type: "pass_pro" },
      { id: "RB", position: "RB", x: -2, y: -5, on_ball: false, side: "left", assignment_type: "pass_pro", block: { type: "pass_pro", target: "first blitzer", path: null } },
    ],
    pass_details: {
      concept_name: "Smash",
      protection: "Half slide left",
      qb_drop: "3_step",
      presnap_read: "unknown",
      progression: [],
      vs_coverage: {},
    },
    coaching_points: ["Z: sell vertical for three steps before the hitch."],
  },
  "smash",
);

export const ZONE = finish(
  {
    name: "Ace 24 Zone",
    play_type: "run",
    formation: { name: "Ace", personnel: "12", strength: "right", backfield_alignment: "Under center, RB at 7" },
    players: [
      ...ol("zone"),
      rec("X", -17, 0, "go"),
      { id: "Y", position: "Y", x: 4, y: 0, on_ball: true, side: "right", assignment_type: "block", block: { type: "zone", target: "DE", path: null } },
      { id: "F", position: "F", x: -4, y: -1, on_ball: false, side: "left", assignment_type: "block", block: { type: "seal", target: "backside end", path: null } },
      rec("Z", 17, -1, "go"),
      { id: "QB", position: "QB", x: 0, y: -1, on_ball: false, side: "middle", assignment_type: "fake", path: [[0, 0], [-2, -3]] },
      { id: "RB", position: "RB", x: 0, y: -7, on_ball: false, side: "middle", assignment_type: "carry", path: [[0, 0], [1.5, 3], [2, 8]] },
    ],
    run_details: { point_of_attack: "4 hole (right B gap)", scheme: "inside zone", ball_carrier: "RB" },
  },
  "inside_zone",
);

export const ZONE_READ = finish(
  {
    name: "Gun Zone Read",
    play_type: "option",
    formation: { name: "Gun Doubles", personnel: "11", strength: "balanced", backfield_alignment: "Gun, RB right" },
    players: [
      ...ol("zone"),
      rec("X", -18, 0, "go"),
      rec("H", -10, -1, "bubble"),
      rec("Y", 10, -1, "go"),
      rec("Z", 18, 0, "go"),
      { id: "QB", position: "QB", x: 0, y: -5, on_ball: false, side: "middle", assignment_type: "mesh", path: [[0, 0], [4, 0], [7, 5]] },
      { id: "RB", position: "RB", x: 2, y: -5, on_ball: false, side: "right", assignment_type: "carry", path: [[0, 0], [-3, 2], [-3, 7]] },
    ],
    run_details: { point_of_attack: "3 hole (left B gap)", scheme: "inside zone", ball_carrier: "RB" },
  },
  "zone_read",
);

export const JET = finish(
  {
    name: "Trips Rt Z Jet 39",
    play_type: "run",
    formation: { name: "Trips", personnel: "11", strength: "right", backfield_alignment: "Gun, RB left" },
    motion: { player: "Z", type: "jet", direction: "left", timing: "at_snap", end: [1, -1] },
    players: [
      ...ol("reach"),
      rec("X", -18, 0, "go"),
      { id: "Y", position: "Y", x: 7, y: -1, on_ball: false, side: "right", assignment_type: "block", block: { type: "arc", target: "corner", path: null } },
      { id: "H", position: "H", x: 11, y: -1, on_ball: false, side: "right", assignment_type: "block", block: { type: "base", target: "safety", path: null } },
      { id: "Z", position: "Z", x: 17, y: 0, on_ball: true, side: "right", assignment_type: "carry", path: [[0, 0], [-6, 0], [-14, 2], [-18, 8]] },
      { id: "QB", position: "QB", x: 0, y: -5, on_ball: false, side: "middle", assignment_type: "fake" },
      { id: "RB", position: "RB", x: -2, y: -5, on_ball: false, side: "left", assignment_type: "fake", path: [[0, 0], [3, 3]] },
    ],
    run_details: { point_of_attack: "9 hole (left edge)", scheme: "sweep", ball_carrier: "Z" },
  },
  "jet_sweep",
);

export const SAMPLE_PLAYS = [SMASH, ZONE, ZONE_READ, JET];
