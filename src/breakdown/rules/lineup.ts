/**
 * Turning a formation read off film into a lineup the play builder can open:
 * the anonymous players get the usual letters, so a coach can draw each
 * one's job and save it as a scout play.
 */
import type { Player } from "@/shared/football";
import type { FormationRead, RoledPlayer } from "./formation";

const half = (v: number) => Math.round(v * 2) / 2;

export function lineupFromRead(read: FormationRead): Player[] {
  const ids = new Map<RoledPlayer, string>();
  const byX = [...read.players].sort((a, b) => a.x - b.x);
  const cx = read.players.find((p) => p.role === "center")?.x ?? 0;

  // the line, left to right
  const line = byX.filter((p) => p.role === "line" || p.role === "center");
  const names = line.length === 5 ? ["LT", "LG", "C", "RG", "RT"] : line.map((p, i) => (p.role === "center" ? "C" : `OL${i + 1}`));
  line.forEach((p, i) => ids.set(p, names[i]!));

  const qb = read.players.find((p) => p.role === "qb");
  if (qb) ids.set(qb, "QB");

  // backs: deepest is the running back, then the fullback
  const backNames = ["RB", "FB", "TB"];
  read.players
    .filter((p) => p.role === "back")
    .sort((a, b) => a.y - b.y)
    .forEach((p, i) => ids.set(p, backNames[i] ?? `B${i + 1}`));

  // receivers: the widest on each side are X and Z, a tight end is Y, the rest take the usual spare letters
  const receivers = byX.filter((p) => !ids.has(p));
  const spare = ["H", "F", "A", "B", "U", "W"];
  const take = (p: RoledPlayer | undefined, id: string) => {
    if (p && !ids.has(p) && ![...ids.values()].includes(id)) ids.set(p, id);
  };
  take(receivers.find((p) => p.role === "tight_end"), "Y");
  take(receivers.filter((p) => p.x < cx && !ids.has(p))[0], "X");
  take(receivers.filter((p) => p.x > cx && !ids.has(p)).at(-1), "Z");
  for (const p of receivers) if (!ids.has(p)) ids.set(p, spare.find((s) => ![...ids.values()].includes(s)) ?? `R${ids.size}`);

  return read.players.map((p) => {
    const onBall = p.role === "center" || p.role === "line" || p.role === "tight_end" || p.role === "split";
    const id = ids.get(p)!;
    const x = half(p.x - cx);
    return {
      id,
      position: id,
      x,
      y: onBall ? 0 : Math.min(-1, half(p.y)),
      on_ball: onBall,
      side: x < -1 ? "left" : x > 1 ? "right" : "middle",
      split: null,
      assignment_type: "unknown",
      route: null,
      block: null,
      path: null,
      notes: null,
    };
  });
}
