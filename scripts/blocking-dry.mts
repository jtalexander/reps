/** Print every scheme's blocks against every front for a pro I formation (TE right) and a 2x2 shotgun. */
import { BLOCK_FRONTS, newBlocking, resolveBlocking, SCHEME_LIBRARY } from "@/domain/blocking";
import { emptyPlay, type Player } from "@/domain/play";

const p = (id: string, x: number, y: number): Player => ({ id, position: id, x, y, on_ball: Math.abs(y) < 0.8, side: x < -1 ? "left" : x > 1 ? "right" : "middle", split: null, assignment_type: "unknown", route: null, block: null, path: null, notes: null });
const ol = [p("LT", -2.6, 0), p("LG", -1.3, 0), p("C", 0, 0), p("RG", 1.3, 0), p("RT", 2.6, 0)];
const proI = [...ol, p("Y", 4, 0), p("X", -14, 0), p("Z", 12, -1), p("QB", 0, -1), p("F", 0, -4), p("RB", 0, -6.5)];
const gun = [...ol, p("X", -14, 0), p("H", -8, -1), p("Y", 8, -1), p("Z", 14, 0), p("QB", 0, -5), p("R", 1.5, -5)];
const which = (process.argv[2] ?? "power,counter,inside_zone,trap").split(",");
for (const [fname, players] of [["Pro I, TE right", proI], ["2x2 gun", gun]] as const) {
  const data = { ...emptyPlay("x"), players };
  for (const key of which) {
    const s = SCHEME_LIBRARY.find((x) => x.key === key)!;
    console.log(`\n== ${s.name} right, ${fname}`);
    for (const f of BLOCK_FRONTS) {
      const r = resolveBlocking(data, newBlocking(s, "right"), f);
      const lab = (id: string | null) => (id ? `${id}(${r.defenders.find((d) => d.id === id)!.label.replace(" technique", "t")})` : "-");
      console.log(`${f.padEnd(10)} ${r.blocks.map((b) => `${b.role}:${lab(b.target)}`).join("  ")}`);
      const un = r.defenders.filter((d) => d.level !== "back" && !r.blocks.some((b) => b.target === d.id)).map((d) => d.id);
      console.log(`${"".padEnd(10)} unblocked: ${un.join(",")}`);
    }
  }
}
