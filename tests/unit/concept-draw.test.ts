/** RepWon's built-in concepts drawn onto a lineup: who gets which job. */
import { describe, expect, it } from "vitest";
import { drawConcept, roles } from "@/domain/concept-draw";
import type { Player } from "@/domain/play";

const p = (id: string, x: number, y: number): Player => ({
  id,
  position: id,
  x,
  y,
  on_ball: y > -0.75,
  side: x < -1 ? "left" : x > 1 ? "right" : "middle",
  split: null,
  assignment_type: "unknown",
  route: null,
  block: null,
  path: null,
  notes: null,
});
// shotgun 2x2: X and H left, Y and Z right, F beside the QB
const spread = [p("X", -14, 0), p("H", -7, -1), p("LT", -2.6, 0), p("LG", -1.3, 0), p("C", 0, 0), p("RG", 1.3, 0), p("RT", 2.6, 0), p("Y", 7, -1), p("Z", 14, 0), p("QB", 0, -5), p("F", 1.5, -5)];
// I-formation: TE right, FB and TB stacked
const iForm = [p("X", -14, 0), p("LT", -2.6, 0), p("LG", -1.3, 0), p("C", 0, 0), p("RG", 1.3, 0), p("RT", 2.6, 0), p("Y", 4, 0), p("Z", 11, -1), p("QB", 0, -1.5), p("FB", 0, -4), p("TB", 0, -6.5)];
const jobOf = (jobs: ReturnType<typeof drawConcept>, id: string) => jobs!.find((j) => j.id === id);

describe("drawing RepWon's concepts onto a lineup", () => {
  it("counts receivers from the outside in on each side", () => {
    const r = roles(spread);
    expect(r.left.map((x) => x.id)).toEqual(["X", "H"]);
    expect(r.right.map((x) => x.id)).toEqual(["Z", "Y"]);
    expect(r.backs.map((x) => x.id)).toEqual(["F"]);
    expect(r.line.map((x) => x.id)).toEqual(["LT", "LG", "C", "RG", "RT"]);
  });

  it("smash: #1 hitch, #2 corner on both sides; the line and back protect", () => {
    const j = drawConcept("smash", spread, "right");
    expect(["X", "Z"].map((id) => jobOf(j, id)?.route?.name)).toEqual(["hitch", "hitch"]);
    expect(["H", "Y"].map((id) => jobOf(j, id)?.route?.name)).toEqual(["corner", "corner"]);
    expect(jobOf(j, "LT")?.block?.type).toBe("pass_pro");
    expect(jobOf(j, "F")?.block?.type).toBe("pass_pro");
    expect(jobOf(j, "QB")).toBeUndefined(); // his job is in the call
  });

  it("mesh: the inside receiver on each side runs the shallow cross", () => {
    const j = drawConcept("mesh", spread, "right");
    expect(["H", "Y"].map((id) => jobOf(j, id)?.route?.name)).toEqual(["drag", "drag"]);
    expect(["X", "Z"].map((id) => jobOf(j, id)?.route?.name)).toEqual(["go", "go"]);
  });

  it("power right from the I: the left guard pulls, the fullback kicks out, the tailback carries to the right", () => {
    const j = drawConcept("power", iForm, "right");
    expect(jobOf(j, "LG")?.block?.type).toBe("pull");
    expect(jobOf(j, "RG")?.block?.type).toBe("down");
    expect(jobOf(j, "FB")?.block?.type).toBe("kick_out");
    const carry = jobOf(j, "TB");
    expect(carry?.assignment_type).toBe("carry");
    expect(carry!.path!.at(-1)![0]).toBeGreaterThan(0); // ends up on the right
    // the other way: the right guard pulls and the run goes left
    const left = drawConcept("power", iForm, "left");
    expect(jobOf(left, "RG")?.block?.type).toBe("pull");
    expect(jobOf(left, "TB")!.path!.at(-1)![0]).toBeLessThan(0);
  });

  it("inside zone: the line steps play side together; receivers block", () => {
    const j = drawConcept("inside_zone", spread, "left");
    expect(["LT", "LG", "C", "RG", "RT"].every((id) => jobOf(j, id)?.block?.type === "zone")).toBe(true);
    expect(jobOf(j, "F")?.assignment_type).toBe("carry");
    expect(jobOf(j, "X")?.block?.type).toBe("base");
  });

  it("says no for concepts it can't draw", () => {
    expect(drawConcept("levels", spread, "right")).toBeNull();
  });
});
