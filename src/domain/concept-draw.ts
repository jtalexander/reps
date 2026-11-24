/**
 * Reps' built-in concepts drawn onto any lineup: who runs what, counted the
 * way coaches count (#1 is the widest receiver on a side, #2 the next one in),
 * blocks for the line and the back's path for runs. Used when the team's own
 * playbook doesn't draw the play. A starting point the coach adjusts.
 */
import { isLineman, type AssignmentType, type Player, type Point, type Route } from "./play";

export type Job = Pick<Player, "id" | "assignment_type" | "route" | "block" | "path">;

/** Concepts Reps can draw. */
export const DRAWABLE = ["smash", "slant_flat", "curl_flat", "stick", "flood", "mesh", "four_verts", "inside_zone", "outside_zone", "power", "counter"] as const;

const route = (name: string): Pick<Player, "assignment_type" | "route" | "block" | "path"> => ({
  assignment_type: "route" as AssignmentType,
  route: { name, depth_yards: "unknown", break_direction: "unknown", notes: null, path: null } as Route,
  block: null,
  path: null,
});
const block = (type: string, path: Point[]) => ({ assignment_type: "block" as AssignmentType, block: { type, target: null, path }, route: null, path: null });
const carry = (path: Point[]) => ({ assignment_type: "carry" as AssignmentType, path, route: null, block: null });
const passPro = () => block("pass_pro", [
  [0, 0],
  [0, -1],
]);

/** The lineup sorted into roles: linemen left to right, QB, backs, receivers counted from the outside on each side. */
export function roles(players: Player[]) {
  const line = players.filter((p) => isLineman(p.id)).sort((a, b) => a.x - b.x);
  const rest = players.filter((p) => !isLineman(p.id));
  const qb = rest.find((p) => p.id === "QB" || p.position === "QB") ?? rest.filter((p) => Math.abs(p.x) < 1.5).sort((a, b) => b.y - a.y)[0];
  const backs = rest.filter((p) => p !== qb && p.y <= -2.5 && Math.abs(p.x) < 4);
  const wide = rest.filter((p) => p !== qb && !backs.includes(p));
  const left = wide.filter((p) => p.x < 0).sort((a, b) => a.x - b.x);
  const right = wide.filter((p) => p.x >= 0).sort((a, b) => b.x - a.x);
  return { line, qb, backs, left, right };
}

/**
 * Jobs for each player in a concept, toward `side` (the play side for runs,
 * the call side for one-sided pass concepts). Null when Reps can't draw it.
 */
export function drawConcept(key: string, players: Player[], side: "left" | "right"): Job[] | null {
  if (!(DRAWABLE as readonly string[]).includes(key)) return null;
  const { line, backs, left, right } = roles(players);
  const s = side === "right" ? 1 : -1;
  const play = side === "right" ? right : left;
  const away = side === "right" ? left : right;
  const jobs = new Map<string, Omit<Job, "id">>();
  const give = (p: Player | undefined, j: Omit<Job, "id">) => {
    if (p) jobs.set(p.id, j);
  };
  const back = backs.sort((a, b) => a.y - b.y)[0]; // deepest back carries
  const lead = backs.find((b) => b !== back);

  const pass = ["smash", "slant_flat", "curl_flat", "stick", "flood", "mesh", "four_verts"].includes(key);
  if (pass) {
    for (const p of line) give(p, passPro());
    const both = (one: string, two: string) => {
      for (const sideList of [left, right]) {
        give(sideList[0], route(one));
        give(sideList[1], route(two));
      }
    };
    if (key === "smash") both("hitch", "corner");
    if (key === "slant_flat") both("slant", "flat");
    if (key === "curl_flat") both("curl", "flat");
    if (key === "four_verts") both("go", "seam");
    if (key === "stick" || key === "flood") {
      give(play[0], route("go"));
      give(play[1], route(key === "stick" ? "stick" : "out"));
      if (play[2]) give(play[2], route("flat"));
      else give(back, route("flat"));
    }
    if (key === "mesh") {
      // the innermost receiver on each side runs the shallow cross; everyone else clears deep
      const inside = [left[left.length - 1], right[right.length - 1]];
      for (const p of [...left, ...right]) give(p, route(inside.includes(p) ? "drag" : "go"));
    }
    for (const b of backs) if (!jobs.has(b.id)) give(b, passPro());
  } else {
    // runs: the line and the back; receivers block whoever covers them
    const runPath = (p: Player, aim: number, step: Point | null = null): Point[] => {
      const pts: Point[] = [[0, 0]];
      if (step) pts.push(step);
      pts.push([aim - p.x, -p.y], [aim - p.x, -p.y + 6]);
      return pts;
    };
    const playSide = (p: Player) => Math.sign(p.x || s) === s;
    if (key === "inside_zone" || key === "outside_zone") {
      const wide = key === "outside_zone";
      for (const p of line)
        give(
          p,
          block(wide ? "reach" : "zone", [
            [0, 0],
            [s * (wide ? 1.5 : 1), 1.2],
          ]),
        );
      give(back, carry(runPath(back ?? players[0]!, s * (wide ? 4.5 : 1.5))));
      give(lead, block("lead", [
        [0, 0],
        [s * (wide ? 4 : 1.5) - (lead?.x ?? 0), -(lead?.y ?? 0) + 1.5],
      ]));
    } else {
      // power and counter: play side blocks down; pullers from the back side
      const guards = line.filter((p) => Math.abs(p.x) > 0.5 && Math.abs(p.x) < 2.2);
      const tackles = line.filter((p) => Math.abs(p.x) >= 2.2);
      const bsg = guards.find((p) => !playSide(p));
      const bst = tackles.find((p) => !playSide(p));
      for (const p of line)
        if (p !== bsg && !(key === "counter" && p === bst))
          give(
            p,
            playSide(p) || p.x === 0
              ? block("down", [
                  [0, 0],
                  [-s * 1, 1.2],
                ])
              : block("base", [
                  [0, 0],
                  [-s * 0.5, 0.8],
                ]),
          );
      const pull = (p: Player | undefined, to: number, up: number) =>
        p &&
        give(
          p,
          block("pull", [
            [0, 0],
            [0, -1],
            [to - p.x, -1],
            [to - p.x + s * 0.5, up],
          ]),
        );
      if (key === "power") {
        pull(bsg, s * 2.6, 2);
        if (lead)
          give(lead, block("kick_out", [
            [0, 0],
            [s * 4.5 - lead.x, -lead.y + 0.5],
          ]));
        give(back, carry(runPath(back ?? players[0]!, s * 2.2)));
      } else {
        pull(bsg, s * 4.8, 0.5); // kicks out the end
        pull(bst, s * 2.8, 2.5); // wraps up for the linebacker
        give(back, carry(runPath(back ?? players[0]!, s * 2.6, [-s * 0.8, 0.2])));
      }
    }
    for (const p of [...play, ...away])
      if (!jobs.has(p.id))
        give(p, block("base", [
          [0, 0],
          [0, 1.5],
        ]));
  }
  return players.filter((p) => jobs.has(p.id)).map((p) => ({ id: p.id, ...jobs.get(p.id)! }));
}
