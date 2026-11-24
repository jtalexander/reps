/**
 * Football basics: offense. Concepts (positions and formations, run schemes,
 * run plays, pass concepts, reading the defense, protection, option and RPO)
 * and technique (line, ball carrier, quarterback, receivers).
 */
import { choice, lesson, open, order, trueFalse } from "./build";
import { arrow, d, darrow, diagram, front, note, o, oline, proSet, qb, shell, spread, tech, zone } from "./draw";
import type { Dot, LibTopic, Line } from "./types";

// ---------- small drawing helpers (offense only) ----------

type Pt = [number, number];
const blk = (...pts: Pt[]): Line => arrow("block", ...pts);
const run = (...pts: Pt[]): Line => arrow("run", ...pts);
const rt = (...pts: Pt[]): Line => arrow("route", ...pts);
const read = (...pts: Pt[]): Line => arrow("read", ...pts);
const hiWhere = (dots: Dot[], test: (p: Dot) => boolean): Dot[] => dots.map((p) => (test(p) ? { ...p, hi: true } : p));

/** One back under center, tight end right, X split left on the line, Z flanker right off it. */
function oneBack(hi: string[] = []): Dot[] {
  return [...oline("right", hi), qb("under", hi.includes("QB")), o("RB", 0, -6, hi.includes("RB")), o("X", -14, -0.8, hi.includes("X")), o("Z", 11, -1.8, hi.includes("Z"))];
}

/** Trips right from the gun: Z and H off the line to the right, Y attached, X alone on the left. */
function trips(hi: string[] = []): Dot[] {
  return [...oline("right", hi), qb("gun"), o("RB", -1.5, -5), o("X", -15, -0.8, hi.includes("X")), o("H", 9, -1.8, hi.includes("H")), o("Z", 15, -1.8, hi.includes("Z"))];
}

// ---------- positions and formations ----------

const ELIGIBLE = diagram({ dots: proSet(["X", "Y", "Z", "FB", "TB"]), notes: [note("highlighted = eligible", 0, -8.3)] });
const COVERED_TE = diagram({ dots: [...oline("right", ["Y"]), qb("under"), o("RB", 0, -6), o("X", -14, -0.8), o("Z", 9, -0.8)] });
const COUNT_2X2 = (hi: string[] = []) =>
  diagram({ dots: spread(hi), notes: [note("#1", -15, -2.6), note("#2", -8, -3.6), note("#2", 4.5, -2.6), note("#1", 14, -3.6)] });
const TRIPS = (hi: string[] = []) => diagram({ dots: trips(hi), notes: [note("strong side", 10, -4.2)] });

// ---------- run schemes and plays (all against a 4-3 Over) ----------

const OVER = front("4-3 Over");

const INSIDE_ZONE = (hi: string[] = []) =>
  diagram({
    dots: [...oneBack(hi), ...OVER],
    lines: [
      blk([4.5, -0.8], [5, 0.3]),
      blk([3, -0.8], [4.2, 1.6], [5.1, 3.4]),
      blk([1.5, -0.8], [1.9, 0.3]),
      blk([0, -0.8], [-0.4, 0.3], [0.3, 3.8]),
      blk([-1.5, -0.8], [-1, 0.3]),
      blk([-3, -0.8], [-2.6, 1.5], [-3, 3.8]),
      run([0, -6], [1.2, -3], [1.9, -0.5], [2.4, 2.5]),
    ],
  });

const OUTSIDE_ZONE = diagram({
  dots: [...oneBack(), ...OVER],
  lines: [
    blk([4.5, -0.8], [5.6, -0.4], [5.7, 0.3]),
    blk([3, -0.8], [4.3, 1], [5.3, 3.4]),
    blk([1.5, -0.8], [2.5, -0.4], [2.6, 0.3]),
    blk([0, -0.8], [0.8, 1.2], [0.7, 3.9]),
    blk([-1.5, -0.8], [-0.6, 0.3]),
    blk([-3, -0.8], [-2.2, 1.5], [-2.9, 3.8]),
    run([0, -6], [4, -4], [6.3, -2]),
    run([6.3, -2], [7.3, 3]),
    read([6.3, -2], [3.8, 2.5]),
  ],
  notes: [note("bounce", 9, 2), note("cut up", 2.6, 0.8)],
});

const POWER = (hi: string[] = []) =>
  diagram({
    dots: [...proSet(hi), ...OVER],
    lines: [
      blk([4.5, -0.8], [5.3, 3.5]),
      blk([3, -0.8], [2.5, 0.3]),
      blk([1.5, -0.8], [1.9, 0.3]),
      blk([0, -0.8], [-0.5, 0.3]),
      blk([-3, -0.8], [-3.4, 0.3]),
      blk([-1.5, -0.8], [-1.2, -2], [3, -2], [3.8, 0.4], [0.9, 3.9]),
      blk([0, -4.2], [3, -2.6], [4.8, 0.4]),
      run([0, -6.5], [1.8, -4], [3.9, -1.2], [4, 3]),
    ],
  });

const ISO = diagram({
  dots: [...proSet(), ...OVER],
  lines: [
    blk([-3, -0.8], [-3.4, 0.3]),
    blk([0, -0.8], [-0.5, 0.3]),
    blk([-1.5, -0.8], [0.2, 3.9]),
    blk([1.5, -0.8], [1.9, 0.3]),
    blk([3, -0.8], [4.8, 3.4]),
    blk([4.5, -0.8], [5, 0.3]),
    blk([0, -4.2], [-1.6, -2], [-2.4, 0.5], [-3, 3.8]),
    run([0, -6.5], [-1.3, -3.5], [-2.2, -0.5], [-2.1, 3]),
  ],
});

const TRAP = diagram({
  dots: [...oneBack(["LG"]), ...OVER],
  lines: [
    blk([1.5, -0.8], [0.9, 3.9]),
    blk([3, -0.8], [4.8, 3.4]),
    blk([4.5, -0.8], [5, 0.3]),
    blk([0, -0.8], [-0.5, 0.3]),
    blk([-1.5, -0.8], [-1.2, -1.8], [1, -1.8], [1.8, 0.4]),
    blk([-3, -0.8], [-3.4, 0.3]),
    run([0, -6], [0.4, -3], [1, 0], [1, 3]),
  ],
});

const JET = diagram({
  dots: [...oline("right"), qb("under"), o("RB", 0, -6), o("X", -14, -0.8), o("H", -8, -1.8, true), o("Z", 11, -1.8), ...OVER],
  lines: [arrow("motion", [-8, -1.8], [-1.5, -2.6]), run([-1.5, -2.6], [6, -2.6], [10, 0], [11, 4]), blk([4.5, -0.8], [5.6, -0.3], [5.7, 0.3])],
  notes: [note("ball snapped here", -1.5, -3.6)],
});

// ---------- pass concepts ----------

const ROUTE_TREE = diagram({
  dots: [...oline("none"), qb("under"), o("X", -12, -0.8, true)],
  lines: [
    rt([-12, -0.8], [-12, 2], [-16, 2]),
    rt([-12, -0.8], [-12, 1.5], [-7, 6]),
    rt([-12, -0.8], [-12, 15], [-14, 12]),
    rt([-12, -0.8], [-12, 12], [-10.8, 10.5]),
    rt([-12, -0.8], [-12, 6], [-17, 6]),
    rt([-12, -0.8], [-12, 8], [-5, 8]),
    rt([-12, -0.8], [-12, 11], [-17, 17]),
    rt([-12, -0.8], [-12, 11], [-7, 17]),
    rt([-12, -0.8], [-12, 20]),
  ],
  notes: [note("1", -16.8, 2), note("2", -6.4, 6.6), note("3", -14.8, 11.4), note("4", -10.1, 10.2), note("5", -17.8, 6), note("6", -4.2, 8), note("7", -17.6, 17.6), note("8", -6.4, 17.6), note("9", -12, 21)],
});

const SLANT = diagram({
  dots: [...oline("right"), qb("gun"), o("RB", 1.5, -5), o("X", -15, -0.8, true), o("Z", 14, -1.8), d("C", -15, 6)],
  lines: [rt([-15, -0.8], [-15, 1.5], [-10, 5.5])],
});

const POST = diagram({
  dots: [...oline("right"), qb("gun"), o("RB", 1.5, -5), o("X", -15, -0.8), o("Z", 14, -1.8, true), d("C", 14, 6), d("FS", 0, 12)],
  lines: [rt([14, -1.8], [14, 10], [8, 17])],
});

const SMASH = (hiCorner: boolean) =>
  diagram({
    dots: [...spread(), d("C", -14.5, 4.5, hiCorner), d("FS", -7, 12)],
    lines: [rt([-15, -0.8], [-15, 5], [-14.6, 4]), rt([-8, -1.8], [-8, 10], [-14, 15])],
    notes: [note("hitch", -17, 4.5), note("corner", -15.5, 15.5)],
  });

const FLOOD = diagram({
  dots: spread(),
  lines: [rt([14, -1.8], [14, 20]), rt([4.5, -0.8], [4.5, 9], [12, 12]), rt([1.5, -5], [5, -3.5], [12, 1])],
  notes: [note("deep", 15.8, 19), note("middle", 13.6, 13), note("short", 13.6, 1.6)],
});

const MESH = diagram({
  dots: spread(),
  lines: [rt([-8, -1.8], [-4, 4], [10, 5]), rt([4.5, -0.8], [3, 5], [-10, 6]), rt([-15, -0.8], [-15, 18]), rt([14, -1.8], [14, 18])],
});

const FOUR_VERTS = (zones: boolean) =>
  diagram({
    dots: [...spread(), ...shell("one", { left: -15, right: 14 })],
    lines: [rt([-15, -0.8], [-15, 20]), rt([-8, -1.8], [-7, 20]), rt([4.5, -0.8], [5.5, 20]), rt([14, -1.8], [14, 20])],
    zones: zones ? [zone("deep third", -14, 16, 5.5, 2.5), zone("deep third", 0, 17, 5.5, 2.5), zone("deep third", 14, 16, 5.5, 2.5)] : undefined,
  });

const CURL_FLAT = diagram({
  dots: [...spread(), d("NB", -10, 5, true), d("C", -15, 7)],
  lines: [rt([-15, -0.8], [-15, 12], [-14, 10.5]), rt([-8, -1.8], [-9, 1], [-15, 2.5])],
  notes: [note("curl", -12.8, 11), note("flat", -16.8, 2.5)],
});

// ---------- reading the defense ----------

const NICKEL = d("NB", -8, 5);
const DB_TWO = shell("two", { left: -15, right: 14 });
const DB_ONE = shell("one", { left: -15, right: 14 });
const FRONT_425 = front("4-2-5");

const BOX = diagram({
  dots: [...spread(), ...FRONT_425, NICKEL, ...DB_TWO],
  zones: [zone("the box", 0, 2.7, 6.5, 3.4)],
});
const ONE_HIGH = diagram({ dots: [...spread(), ...FRONT_425, NICKEL, ...shell("one", { left: -15, right: 14 }, ["FS"])] });
const TWO_HIGH = diagram({ dots: [...spread(), ...FRONT_425, NICKEL, ...shell("two", { left: -15, right: 14 }, ["FS", "SS"])] });
const COVER_3 = diagram({
  dots: [...spread(), ...DB_ONE],
  zones: [
    zone("deep third", -14, 15, 5.5, 2.3),
    zone("deep third", 0, 16, 5.5, 2.3),
    zone("deep third", 14, 15, 5.5, 2.3),
    zone("curl-flat", -14, 4, 3.6, 1.6),
    zone("hook", -4.5, 6, 3.6, 1.6),
    zone("hook", 4.5, 6, 3.6, 1.6),
    zone("curl-flat", 14, 4, 3.6, 1.6),
  ],
});
const BLITZ_TELL = diagram({
  dots: [...spread(), ...FRONT_425.map((p) => (p.label === "W" ? d("W", -2.2, 1.7, true) : p)), NICKEL, ...DB_ONE],
  lines: [darrow("motion", [-1.5, 4.5], [-2.1, 2.3])],
});
const HOT = diagram({
  dots: [...spread(["H"]), ...FRONT_425, d("NB", -8, 5), ...DB_ONE],
  lines: [
    darrow("run", [-8, 5], [-4.5, 1], [-1.5, -3.8]),
    darrow("run", [1.5, 4.5], [1.3, 1.5]),
    blk([1.5, -5], [1.4, -2.2]),
    rt([-8, -1.8], [-8, 0.5], [-4.8, 3.5]),
  ],
  notes: [note("unblocked", -9.8, 2.2)],
});

// ---------- pass protection ----------

const SLIDE = (hi: string[] = []) =>
  diagram({
    dots: [...oline("none", hi), qb("gun"), o("RB", 1.5, -5, hi.includes("RB")), o("X", -15, -0.8), o("H", -8, -1.8), o("Y", 8, -1.8), o("Z", 14, -0.8), ...FRONT_425],
    lines: [
      blk([-3, -0.8], [-4.3, -1.8]),
      blk([-1.5, -0.8], [-2.6, -1.6]),
      blk([0, -0.8], [-1, -1.6]),
      blk([1.5, -0.8], [0.6, -1.6]),
      blk([3, -0.8], [2.1, -1.6]),
      blk([1.5, -5], [3.8, -2.4]),
    ],
    notes: [note("slide left", -1, -3)],
  });

// ---------- option and RPO ----------

const READ_OPTION = diagram({
  dots: [...oline("right"), o("QB", 0, -5), o("RB", -1.5, -5), o("X", -15, -0.8), o("H", -8, -1.8), o("Z", 14, -1.8), ...hiWhere(OVER, (p) => p.label === "E" && p.x < 0)],
  lines: [
    blk([4.5, -0.8], [5, 0.3]),
    blk([3, -0.8], [4.8, 3.4]),
    blk([1.5, -0.8], [1.9, 0.3]),
    blk([0, -0.8], [-0.4, 0.3]),
    blk([-1.5, -0.8], [-1, 0.3], [0.2, 3.8]),
    blk([-3, -0.8], [-2.3, 1.2], [-2.9, 3.8]),
    run([-1.5, -5], [0.8, -3.2], [1.8, 0.5]),
    read([0, -5], [-3.3, 0.4]),
    run([0, -5], [-4.5, -3.6], [-6.5, 1.5]),
  ],
  notes: [note("give", 2.6, -2.2), note("keep", -7.5, -2)],
});

const TRIPLE = diagram({
  dots: [
    ...oline("none"),
    qb("under"),
    o("FB", 0, -4.5),
    o("A", -4.5, -1.8),
    o("A", 4.5, -1.8),
    o("X", -14, -0.8),
    o("Z", 14, -0.8),
    d("N", 0, 0.9),
    d("T", -2.1, 0.9),
    d("E", -3.6, 0.9),
    d("E", 3.6, 0.9, true),
    d("S", 6.5, 2.5, true),
    d("M", 1.2, 4.5),
    d("W", -1.5, 4.5),
    d("FS", 3, 11),
  ],
  lines: [
    blk([0, -0.8], [0.2, 0.3]),
    blk([1.5, -0.8], [1.3, 3.8]),
    blk([4.5, -1.8], [6.5, 1], [4, 10.4]),
    run([0, -4.5], [2.6, -1], [2.8, 2]),
    read([0, -1.8], [3.3, 0.4]),
    run([0, -1.8], [2, -2.6], [5.2, -1.5]),
    read([5.2, -1.5], [6.2, 2]),
    arrow("motion", [-4.5, -1.8], [-2, -3.4]),
    run([-2, -3.4], [7.5, -3.6], [10, 0]),
  ],
  notes: [note("dive key", 3.6, 2.2), note("pitch key", 7.8, 3.6)],
});

const RPO = diagram({
  dots: [...spread(), ...FRONT_425, d("NB", -6, 4, true), d("C", -15, 6), d("C", 14, 6), d("FS", -7, 12), d("SS", 7, 12)],
  lines: [
    blk([-3, -0.8], [-3.4, 0.3]),
    blk([-1.5, -0.8], [-1.1, 3.9]),
    blk([0, -0.8], [-0.5, 0.3]),
    blk([1.5, -0.8], [1.8, 0.3]),
    blk([3, -0.8], [3.4, 0.3]),
    run([1.5, -5], [-0.6, -3], [-1.5, 1.5]),
    read([0, -5], [-5.6, 3.6]),
    rt([-15, -0.8], [-15, 1.2], [-8.5, 5.5]),
  ],
});

// ---------- line technique ----------

const REACH = diagram({
  dots: [...oline("right", ["RG"]), qb("under"), tech("3", "right", "T")],
  lines: [blk([1.5, -0.8], [2.4, -0.6], [2.6, 0.3])],
  notes: [note("play side", 5, -2.6)],
});
const DOWN_BLOCK = diagram({
  dots: [...oline("right", ["RT"]), qb("under"), tech("3", "right", "T"), tech("9", "right", "E")],
  lines: [blk([3, -0.8], [2.5, 0.3])],
});
const KICK_OUT = diagram({
  dots: [...oline("right", ["LG"]), qb("under"), o("TB", 0, -6.5), tech("3", "right", "T"), tech("9", "right", "E"), d("M", 0.5, 4.5)],
  lines: [blk([-1.5, -0.8], [-1.2, -2], [3.5, -2], [4.8, 0.3]), blk([1.5, -0.8], [1.9, 0.3]), blk([3, -0.8], [2.5, 0.3]), run([0, -6.5], [2, -4], [4, -1.2], [4.1, 3])],
});
const DOUBLE = (hi: string[]) =>
  diagram({
    dots: [...oline("right", hi), qb("under"), tech("1", "right", "N"), d("M", 0.5, 4.5)],
    lines: [blk([0, -0.8], [0.4, 0.3]), blk([1.5, -0.8], [1, 0.3]), read([0.7, 1.4], [0.6, 3.8])],
    notes: [note("eyes on the linebacker", 5, 4.5)],
  });

// ---------- ball carrier, QB, receivers ----------

const CUT_DOUBLE = diagram({
  dots: [...oline("right"), qb("under"), o("RB", 0, -6, true), tech("1", "right", "N"), d("M", 0.5, 4.5)],
  lines: [blk([0, -0.8], [0.4, 0.3]), blk([1.5, -0.8], [1, 0.3]), darrow("run", [0.5, 4.5], [-0.9, 2.5]), run([0, -6], [0.7, -2.8], [2.2, -0.2], [2.6, 3])],
});
const DROPS = diagram({
  dots: [...oline("right"), qb("under", true)],
  lines: [arrow("path", [0, -1.8], [0, -9])],
  notes: [note("3-step: about 5 yds", 4.5, -5), note("5-step: about 7 yds", 4.5, -7), note("7-step: about 9 yds", 4.5, -9)],
});
const POCKET = diagram({
  dots: [...oline("right"), o("QB", 0, -7, true), d("E", -4.5, 0.9), d("E", 6, 0.9)],
  lines: [darrow("run", [-4.5, 0.9], [-5, -4.5], [-2.5, -7.8]), darrow("run", [6, 0.9], [6.3, -4.5], [2.5, -7.8]), run([0, -7], [0, -4.8])],
  notes: [note("step up", 1.9, -5.4)],
});
const PRESS = diagram({
  dots: [...oline("none"), qb("gun"), o("X", -15, -0.8, true), d("C", -15, 1.2)],
  lines: [rt([-15, -0.8], [-16.3, 0], [-16.5, 3], [-16.5, 10])],
  notes: [note("press", -13.3, 1.6)],
});
const STEM_BREAK = diagram({
  dots: [...oline("none"), qb("gun"), o("X", -15, -0.8, true), d("C", -15, 7)],
  lines: [rt([-15, -0.8], [-15, 8], [-20, 8])],
  notes: [note("stem", -13.6, 3.5), note("break", -13.4, 8.4)],
});
const CRACK = diagram({
  dots: [...oline("right"), qb("under"), o("TB", 0, -6), o("Z", 11, -1.8, true), tech("9", "right", "E"), d("S", 5.5, 4), d("C", 11, 6)],
  lines: [blk([11, -1.8], [8, 2], [6.2, 3.7]), blk([4.5, -0.8], [5, 0.3]), run([0, -6], [6, -4.6], [9, -3], [10.5, 3])],
});

// ====================================================================

export const OFFENSE: LibTopic[] = [
  // 1 ------------------------------------------------------------------
  {
    key: "off_positions_formations",
    version: 1,
    side: "offense",
    category: "concepts",
    name: "Offensive positions and formations",
    summary: "Who lines up where on offense, who can catch a pass, how to count receivers (#1, #2, #3), formation strength and personnel groupings.",
    level: "youth",
    for: ["ALL"],
    lessons: [
      lesson(
        "ALL",
        "The eleven players on offense",
        `Every offense has 11 players. Here are the usual jobs:
- Offensive line (5 players): left tackle, left guard, center, right guard, right tackle. The center snaps the ball. These five block.
- Quarterback (QB): takes the snap, then hands off, runs or throws.
- Running backs: the tailback (often just called the running back) carries the ball. A fullback lines up in front of him and usually blocks.
- Tight end (TE): lines up next to a tackle. He blocks and catches passes.
- Wide receivers: line up out wide to catch passes and block downfield.

Many teams use letters too: X for the split end (on the line), Z for the flanker (off the line), Y for the tight end, and H or another letter for a slot receiver or second back. Your team's letters may be different, so learn your playbook's names.`,
        { diagram: diagram({ dots: proSet() }) },
      ),
      lesson(
        "ALL",
        "Who can catch a pass: eligible receivers",
        `In 11-player football the offense must have at least 7 players on the line of scrimmage at the snap. That leaves at most 4 in the backfield.

Not everyone may catch a forward pass. The eligible receivers are:
- the two players on the ends of the line, and
- the players lined up in the backfield (off the line).

The five interior linemen are ineligible. In most rule books they wear numbers 50 to 79, and they can't be more than a short distance downfield when a pass is thrown past the line.

A receiver on the line with a teammate on the line outside him is "covered up" and is ineligible. That's why a flanker lines up a yard off the line: so the tight end inside him stays on the end of the line and stays eligible. Rule books have a few special cases, so check yours.`,
        { diagram: ELIGIBLE },
      ),
      lesson(
        "ALL",
        "Counting receivers: #1, #2, #3",
        `Coaches count receivers on each side of the ball from the outside in. The widest receiver is #1, the next one in is #2, and the next is #3.
- A 2x2 formation (often called doubles) has a #1 and a #2 on each side.
- A 3x1 formation (often called trips) has #1, #2 and #3 on one side and only a #1 on the other.

The number is about where a player lines up on this play, not his position. The same tight end can be #2 on one play and #3 on the next. Defenses count the same way, so this language helps everyone. Many teams also count a running back as a receiver on his side; your coach will tell you how your team counts backs.`,
        { diagram: COUNT_2X2() },
      ),
      lesson(
        "ALL",
        "Formation strength",
        `The strong side of a formation is usually the side with the tight end, or the side with more receivers. The other side is the weak side. Teams define strength in different ways (tight end side, most receivers, or the wide side of the field), so learn your team's rule.

Why it matters: defenses line up to the strength, and offenses use it to call plays. A run to the strong side goes where you have more blockers. A play to the weak side attacks where there are fewer defenders.

Formation words you'll hear:
- Pro set or I-formation: two backs behind the QB
- Twins: two receivers to one side
- Trips: three receivers to one side
- Empty: no backs in the backfield`,
        { diagram: TRIPS() },
      ),
      lesson(
        "ALL",
        "Personnel groupings",
        `Personnel tells you who is on the field, using two numbers. The first number is how many running backs. The second is how many tight ends. The rest of the five skill players (everyone but the QB and the line) are wide receivers.
- 11 personnel: 1 back, 1 tight end, 3 receivers
- 12 personnel: 1 back, 2 tight ends, 2 receivers
- 21 personnel: 2 backs, 1 tight end, 2 receivers
- 22 personnel: 2 backs, 2 tight ends, 1 receiver
- 10 personnel: 1 back, no tight end, 4 receivers

Quick math: receivers = 5 minus backs minus tight ends. Defenses match personnel: more receivers on the field usually brings more defensive backs, and more backs and tight ends usually brings bigger defenders.`,
        { minLevel: "middle_school" },
      ),
    ],
    questions: [
      choice("ALL", "In 11-player football, how many players must the offense have on the line of scrimmage at the snap?", "At least 7", ["Exactly 5", "At least 4", "No more than 6"], "Seven or more must be on the line, so no more than four can be in the backfield.", { core: true }),
      choice("ALL", "Which players can catch a forward pass?", "The two players on the ends of the line and the players in the backfield", ["Anyone wearing a number under 50", "Only the wide receivers and tight ends", "Any player on the line of scrimmage"], "The ends of the line and the backs are eligible; the interior linemen are not.", { core: true }),
      trueFalse("ALL", "A guard can run out and catch a pass just like a receiver.", false, "Guards, tackles and the center are ineligible receivers. Their job is to block.", { core: true }),
      choice("ALL", "Z is lined up on the line outside the tight end. Can the tight end (highlighted) catch a pass?", "No: he's covered up, so he isn't on the end of the line", ["Yes: tight ends are always eligible", "Yes, as long as he wears a number in the 80s", "Only if he goes in motion first"], "Only the ends of the line are eligible. With Z on the line outside him, the tight end is an inside player.", {
        minLevel: "middle_school",
        diagram: COVERED_TE,
      }),
      choice("ALL", "Counting from the outside in, what number is the highlighted slot receiver?", "#2", ["#1", "#3", "#4"], "X is widest on that side, so he's #1. The slot is next in, so he's #2.", { core: true, diagram: COUNT_2X2(["H"]) }),
      choice("ALL", "In this trips (3x1) formation, what number is the highlighted tight end?", "#3", ["#1", "#2", "#4"], "Count from the outside in on the trips side: Z is #1, H is #2 and the tight end is #3.", { diagram: TRIPS(["Y"]) }),
      trueFalse("ALL", "The #1 receiver is always the one closest to the ball.", false, "#1 is the widest receiver. Numbers count from the sideline in."),
      choice("ALL", "On most teams, which side is the strong side of a formation?", "The side with the tight end or with more receivers", ["Always the right side", "The side away from the tight end", "The side with fewer receivers"], "Strength usually goes to the tight end or to the side with more receivers. Learn your team's rule.", { core: true }),
      trueFalse("ALL", "The offense can have up to four players in the backfield.", true, "Seven on the line leaves at most four off it."),
      choice("ALL", "Many teams use letters for receivers. Which letter usually means the split end, the receiver on the line away from the tight end?", "X", ["Z", "Y", "H"], "A common system is X for the split end, Z for the flanker and Y for the tight end. Letters vary, so learn your playbook."),
      choice("ALL", "Why does the flanker (Z) usually line up a yard off the line?", "So he doesn't cover up the tight end, who stays eligible", ["So the cornerback can't press him", "Because receivers have to line up in the backfield", "So he can block the defensive end"], "If Z lined up on the line outside the tight end, the tight end would be covered up and ineligible.", { minLevel: "middle_school" }),
      choice("ALL", "What does 11 personnel mean?", "1 running back, 1 tight end and 3 wide receivers", ["1 quarterback and 1 running back", "11 players on the field", "1 wide receiver, 1 tight end and 3 running backs"], "First number: running backs. Second number: tight ends. The rest of the five skill spots are receivers.", { minLevel: "middle_school" }),
      choice("ALL", "In 21 personnel, how many wide receivers are on the field?", "2", ["1", "3", "0"], "Two backs plus one tight end fill 3 of the 5 skill spots, leaving 2 receivers.", { minLevel: "middle_school" }),
      order("ALL", "Put these personnel groups in order from most wide receivers to fewest.", ["10 personnel", "11 personnel", "12 personnel", "22 personnel"], "10 has four receivers, 11 has three, 12 has two and 22 has one.", { minLevel: "middle_school" }),
      open("ALL", "In your own words: what makes a player eligible to catch a forward pass?", "He has to be on the end of the line or in the backfield at the snap. Interior linemen, and a receiver covered up by a teammate on the line outside him, are not eligible.", ["on the end of the line", "or in the backfield", "interior linemen can't"], "End of the line or off the line: those are the eligible spots."),
    ],
  },

  // 2 ------------------------------------------------------------------
  {
    key: "off_run_schemes",
    version: 1,
    side: "offense",
    category: "concepts",
    name: "Run blocking schemes",
    summary: "How the line blocks a run: zone, gap (power) and man schemes, covered and uncovered linemen, double teams, down blocks and pullers.",
    level: "youth",
    for: ["OL", "TE", "RB", "QB"],
    lessons: [
      lesson(
        "ALL",
        "Three ways to block a run",
        `Every run play has a blocking scheme: the plan for who blocks whom.
- Man blocking: each blocker has a certain defender, given by a rule (for example, the man on you, or the man inside you). Block him wherever he goes.
- Zone blocking: every lineman steps the same direction and blocks whoever comes into his area. The running back reads the blocks and picks the hole.
- Gap blocking (often called power blocking): linemen block down at angles toward the ball, and one or more players pull or lead to block the defenders at the hole. The back hits a set hole.

Most teams use some of each. When you learn a new run play, the first question is: is this zone, gap or man?`,
      ),
      lesson(
        "OL",
        "Zone blocking: step together",
        `On a zone play the linemen and the tight end all take their first step toward the play side, the side the run is going. Each blocker is responsible for his play-side gap: the gap on the play side of him.
- Inside zone: a short, quick step. The run aims inside, around the guard.
- Outside zone (often called stretch): a wider step, working to get your head and hands to the play side of the defender. The run aims outside the tackle or tight end.

Zone blocking handles slants and stunts well, because you block whoever shows up in your area instead of chasing one man. Keep your feet moving and your hands inside. Keep your face up and your head to the play side; your hands do the hitting.`,
        { diagram: INSIDE_ZONE() },
      ),
      lesson(
        "OL",
        "Covered or uncovered, and double teams",
        `Before the snap, every zone blocker asks one question: am I covered?
- Covered: a defensive lineman is head-up on you or in your play-side gap. He's your man.
- Uncovered: nobody is on you or in your play-side gap. You help the covered lineman next to you with a double team, then work up to a linebacker.

A double team (often called a combo) puts two blockers hip to hip on one down lineman. Move him back off the ball while both of you keep your eyes on the linebacker. When the linebacker commits to a gap, one of you comes off to block him and the other takes over the down lineman. Who comes off depends on where the linebacker goes; your coach will give you the rule. Leave too early and the down lineman goes free.`,
        { minLevel: "middle_school" },
      ),
      lesson(
        "OL",
        "Gap schemes: down, pull, kick out, lead",
        `Gap schemes win with angles and with extra blockers at the hole.
- Down block: block the defender inside you, toward the ball. The play-side linemen down block to build a wall.
- Pull: a lineman steps back and runs along behind the line to the play side.
- Kick-out: a puller or a back blocks the end man on the line from the inside out, pushing him toward the sideline.
- Lead or wrap: a puller or back turns up through the hole to block a linebacker.

On classic power, the fullback (or a tight end) kicks out the end and the backside guard pulls up through the hole for a linebacker. On counter, the backside guard kicks out and a second puller, often the backside tackle or an H-back, wraps up to a linebacker. The back follows the pullers and hits inside the kick-out.`,
        { diagram: POWER() },
      ),
    ],
    questions: [
      choice("ALL", "In a zone scheme, which way does every lineman take his first step?", "Toward the play side", ["Straight back, like a pass set", "Toward whoever is across from him, no matter where the play goes", "Away from the play"], "On zone everyone steps to the play side together and blocks the defender who comes into his area.", { core: true }),
      choice(["OL", "TE"], "The play is inside zone to the right. Is the highlighted right guard covered or uncovered?", "Covered: a defender is in his play-side gap", ["Uncovered: nobody is head-up on him", "Neither: guards pull on zone plays"], "The 3-technique is on his outside (play-side) shoulder, in his play-side gap, so he's covered.", {
        minLevel: "middle_school",
        diagram: INSIDE_ZONE(["RG"]),
      }),
      choice(["OL", "TE"], "In a zone scheme, what does an uncovered lineman usually do?", "Help double team the play-side down lineman, then climb to a linebacker", ["Pull around the end", "Drop back and pass block", "Block the defender on his back side"], "Uncovered linemen give help on the double team, then come off to the linebacker when he commits.", { core: true, minLevel: "middle_school" }),
      choice(["OL", "TE"], "On a double team (often called a combo), where should both blockers' eyes be?", "On the linebacker, while they move the down lineman back", ["On the running back's path", "On the down lineman's feet", "On the quarterback"], "You're moving the down lineman, but the linebacker tells you when one of you comes off.", { minLevel: "middle_school" }),
      trueFalse(["OL", "TE"], "On a double team, leave for the linebacker right away, before he moves.", false, "Leaving early frees the down lineman. Stay on the double team until the linebacker commits.", { minLevel: "middle_school" }),
      choice("ALL", "What is a down block?", "Blocking the defender to your inside, toward the ball", ["Blocking a defender who has fallen down", "Blocking straight back in pass protection", "Blocking the defender to your outside, toward the sideline"], "Down means toward the ball. Down blocks build a wall on gap plays.", { core: true }),
      choice("ALL", "What is a kick-out block?", "A puller or back blocks the end man on the line from the inside out, pushing him toward the sideline", ["A block on the other team's kicker", "Blocking a defender from behind as he chases the play", "A down block on the nose tackle"], "The kick-out opens the hole inside it. A block from behind is a foul, never a kick-out.", { core: true }),
      choice("ALL", "On classic power, who usually pulls?", "The backside guard", ["The center", "The play-side tackle", "The running back"], "The backside guard pulls up through the hole for a linebacker while the fullback or a tight end kicks out the end.", { minLevel: "middle_school" }),
      choice("ALL", "Which kind of run scheme usually has linemen pulling?", "Gap (power) schemes", ["Inside zone", "Outside zone", "Slide pass protection"], "Pullers are the mark of a gap scheme: they add blockers at the hole.", { core: true }),
      trueFalse(["OL", "TE"], "Outside zone asks linemen to take a wider first step than inside zone, working to reach the defender to the play side.", true, "Outside zone tries to get the whole defense running sideways, so the first step is wider.", { minLevel: "middle_school" }),
      choice(["OL", "TE"], "In man blocking, how does a lineman know whom to block?", "A rule tells him which defender is his, like the man on him or the man inside him", ["He blocks whoever is closest after the snap", "He waits to see where the running back goes", "He always blocks the middle linebacker"], "Man schemes give every blocker a rule so each defender is accounted for before the snap."),
      order(["OL", "TE"], "Put a zone lineman's thinking in order.", ["Know which way the play is going", "Ask: is a defender on me or in my play-side gap?", "Covered? Block him. Uncovered? Help on the double team", "Come off to the linebacker when he commits"], "Play side first, then covered or uncovered, then the double team and the climb.", { minLevel: "middle_school" }),
      choice("ALL", "On this power play, what is the highlighted left guard doing?", "Pulling through the hole to block a linebacker", ["Kicking out the defensive end", "Pass blocking", "Blocking the defender in front of him"], "The fullback kicks out the end; the backside guard pulls and turns up through the hole for the linebacker.", {
        minLevel: "middle_school",
        diagram: POWER(["LG"]),
      }),
      open("ALL", "In your own words: what is the biggest difference between zone blocking and gap (power) blocking?", "In zone, every lineman steps the same way and blocks whoever comes into his area, and the back reads the blocks to find the hole. In gap, linemen block down at angles and someone pulls to kick out or lead, and the back hits a set hole.", ["zone blocks areas, all stepping the same way", "gap uses down blocks and pullers", "zone back reads; gap back hits a set hole"], "Zone is about areas and reading; gap is about angles, pullers and a set hole.", { minLevel: "middle_school" }),
    ],
  },

  // 3 ------------------------------------------------------------------
  {
    key: "off_run_plays",
    version: 1,
    side: "offense",
    category: "concepts",
    name: "Common run plays",
    summary: "Inside zone, outside zone, power, counter, trap, iso, toss and jet sweep: what each play is trying to do and where the back aims.",
    level: "youth",
    for: ["RB", "QB", "OL", "TE"],
    lessons: [
      lesson(
        "ALL",
        "Inside zone and outside zone",
        `Inside zone: the line zone blocks with a short step to the play side. The back aims at the play-side guard (many teams say his outside hip), presses the line and reads the blocks. If the front side is open, hit it. If the defense flows too fast, cut back. The back picks the hole; it isn't set ahead of time.

Outside zone (often called stretch): the line takes a wider step, trying to reach defenders and get the whole defense running sideways. The back aims wide, at the outside hip of the tackle or tight end, and reads the block on the edge defender. If the edge defender is sealed inside, bounce outside. If not, plant and cut up inside. Either way: one cut, then go downhill.`,
        { diagram: OUTSIDE_ZONE },
      ),
      lesson(
        "ALL",
        "Power and counter",
        `Power is a downhill run that wins with angles and extra blockers. The play side blocks down and double teams, the fullback or a tight end kicks out the end man on the line, and the backside guard pulls up through the hole for a linebacker. The back follows the puller and hits inside the kick-out block.

Counter uses the same kinds of blocks but starts with a fake. The back takes a step away from the play (a counter step), which pulls the linebackers the wrong way. Then two pullers come from the back side: usually the guard kicks out and the tackle or an H-back wraps up to a linebacker. The back follows them back to the play side. Counter is a misdirection play: it wins when defenders bite on that first step.`,
        { diagram: POWER() },
      ),
      lesson(
        "ALL",
        "Trap and iso",
        `Trap: the offense lets a defensive lineman through at the snap on purpose. He charges upfield, and a pulling lineman (often the backside guard) blocks him from the side. That trap block opens a quick hole near the center, so the back hits it fast and stays tight to the trap block. Trap works best against linemen who charge hard.

Iso (often called lead): the line blocks the down linemen and leaves a linebacker for the fullback. The fullback leads through the hole and blocks that linebacker, isolating him one on one. The back follows the fullback, reads his block and cuts off it: if the linebacker gets pushed one way, the back goes the other.`,
        { diagram: ISO },
      ),
      lesson(
        "ALL",
        "Toss, sweep and jet sweep",
        `These runs attack the edge, where speed beats size.
- Toss: the QB pitches the ball to the back, who gets moving wide right away.
- Sweep: the back runs wide behind blockers, often with linemen pulling to lead.

On both, the back's first job is to get to the edge, then turn up the field behind his lead blockers. Don't stop and dance in the backfield: get outside, then up.

Jet sweep: a receiver runs full speed in motion across the formation. The ball is snapped as he gets near the QB, who hands it to him as he goes by. He's already at full speed, so he can beat the defense to the edge. Teams also fake the jet and hand off inside, so defenders can't just chase the motion.`,
        { diagram: JET },
      ),
      lesson(
        "RB",
        "Where the back aims",
        `A quick guide for the ball carrier. Exact aiming points vary by team, so learn your playbook's.
- Inside zone: aim at the play-side guard, press, read the blocks, cut back if the defense overflows.
- Outside zone: aim at the outside hip of the tackle or tight end, read the edge, then bounce or cut up.
- Power: follow the pulling guard and hit inside the kick-out block.
- Counter: counter step away, then follow the pullers back to the play side.
- Trap: hit the quick hole tight to the trap block.
- Iso: follow the fullback and cut off his block on the linebacker.
- Toss and sweep: get to the edge, then turn up behind your blockers.
- Jet sweep: take the ball at full speed and race to the edge.`,
      ),
    ],
    questions: [
      choice("ALL", "On iso (often called lead), whom does the fullback block?", "The linebacker at the hole", ["The defensive end", "The free safety", "The nose tackle"], "Iso isolates a linebacker: the line takes the down linemen and the fullback leads through on the linebacker.", { core: true }),
      choice("ALL", "On a trap play, what happens to the defensive lineman being trapped?", "He's let through at the snap, then a pulling lineman blocks him from the side", ["Two linemen double team him right away", "Nobody blocks him; the back runs right at him", "The quarterback blocks him"], "The trap lets him come upfield, then a puller hits him from the side to open a quick hole.", { core: true }),
      choice("ALL", "On power, where does the ball carrier usually hit the hole?", "Inside the kick-out block, following the pulling guard", ["Outside the kick-out block, along the sideline", "Back to the other side of the formation", "Straight up the middle behind the center"], "The kick-out pushes the end out; the hole is inside him, and the puller leads the way.", { core: true }),
      choice("ALL", "On counter, why does the back first step away from the play?", "To get the linebackers to step the wrong way", ["To give the QB room to throw", "To block the backside end", "Because he lined up too close to the QB"], "Counter is misdirection: the first step pulls linebackers away, then the pullers lead the back the other way.", { core: true }),
      choice(["RB", "QB"], "On outside zone, what is the back reading?", "The block on the edge defender: bounce outside if he's sealed, cut up inside if he isn't", ["The free safety's depth", "The nose tackle's first step", "The other running back"], "The edge block tells the back whether to keep going wide or plant and cut up.", { minLevel: "middle_school" }),
      trueFalse("ALL", "On inside zone, the back must run exactly at the called hole even if it closes.", false, "On zone the back reads the blocks and can cut back. The defense tells him where to go.", { core: true }),
      choice("ALL", "On a jet sweep, who usually gets the ball?", "A receiver running across the formation in motion", ["The fullback lined up behind the QB", "The tight end standing still", "The center"], "The jet receiver takes the handoff at full speed as he crosses in front of the QB."),
      choice("ALL", "On a toss or sweep, what is the back's first job?", "Get to the edge, then turn up the field behind his blockers", ["Cut back inside right away", "Stop and wait for a hole to open", "Run straight at the defensive tackle"], "Outside runs need speed to the edge. Get outside, then get up the field."),
      order(["RB"], "Put the counter play in order for the running back.", ["Take a counter step away from the play", "Take the handoff", "Follow the pullers to the play side", "Hit the hole inside the kick-out block"], "Fake first, then the ball, then follow the pullers and hit inside the kick-out.", { minLevel: "middle_school" }),
      choice("ALL", "What run play is this?", "Iso (lead)", ["Trap", "Toss", "Jet sweep"], "The fullback leads through the hole on a linebacker and the tailback follows him: that's iso.", { diagram: ISO }),
      choice("ALL", "The highlighted left guard pulls and blocks the defensive tackle who was let through. What play is this?", "Trap", ["Iso", "Outside zone", "Toss"], "Letting a lineman through and hitting him from the side with a puller is a trap.", { minLevel: "middle_school", diagram: TRAP }),
      trueFalse(["RB"], "On a trap, the hole opens fast and closes fast, so the back should hit it quickly and stay tight to the trap block.", true, "Trap is a quick-hitter. Hesitate and the hole is gone.", { minLevel: "middle_school" }),
      choice("ALL", "Which of these runs is built on misdirection?", "Counter", ["Iso", "Toss", "Power"], "Counter starts with a step away to fool the linebackers, then goes the other way."),
      open(["RB"], "In your own words: on outside zone, how does the back decide whether to bounce outside or cut up inside?", "He reads the block on the edge defender. If the edge defender is sealed inside, he bounces outside. If the edge is closed, he plants and cuts up inside. He makes one cut and goes downhill.", ["read the edge block", "sealed inside: bounce outside", "edge closed: cut up inside"], "The edge block makes the decision; the back just has to see it and make one cut.", { minLevel: "middle_school" }),
    ],
  },

  // 4 ------------------------------------------------------------------
  {
    key: "off_pass_concepts",
    version: 1,
    side: "offense",
    category: "concepts",
    name: "Routes and pass concepts",
    summary: "The route tree, how pass plays stretch a defense (high-low, horizontal, vertical, triangle), and common concepts: smash, flood, stick, mesh, four verts, slant-flat and curl-flat.",
    level: "youth",
    for: ["QB", "WR", "TE", "RB"],
    lessons: [
      lesson(
        "ALL",
        "The route tree",
        `A route is the path a receiver runs. Many teams number their basic routes in a route tree. A common version:
- 1 Flat (a quick out)
- 2 Slant
- 3 Comeback
- 4 Curl
- 5 Out
- 6 Dig (in)
- 7 Corner
- 8 Post
- 9 Go (also called fly or streak)

In this version, odd numbers break to the outside (toward the sideline) and even numbers break to the inside (toward the middle). The 9 goes straight. Numbers, names and depths vary by team, so learn your playbook's tree. Numbering routes lets a coach give every receiver his route in a short play call.`,
        { diagram: ROUTE_TREE },
      ),
      lesson(
        "ALL",
        "Other routes you'll hear",
        `Not every route is on the tree. Some you'll hear often:
- Hitch (often called a stop): run upfield a few yards, stop and turn back to the QB.
- Fade: an outside receiver runs deep toward the sideline, for a ball over his outside shoulder.
- Seam: an inside receiver runs straight up the field between defenders.
- Drag or shallow cross: run across the field a few yards deep.
- Wheel: run out toward the sideline, then turn straight up the field.
- Stick: push upfield about 5 or 6 yards and settle in open space.

Every route has three parts: the stem (running upfield), the break (the cut) and the finish (getting to the right spot and catching the ball).`,
      ),
      lesson(
        "ALL",
        "Stretching the defense",
        `Pass concepts put receivers together so one defender can't cover them all. Coaches call this stretching the defense.
- High-low stretch: two receivers at different depths in one defender's area. If he drops to the deep one, throw short. If he comes up, throw behind him.
- Horizontal stretch: receivers spread side to side at about the same depth, wider than the underneath defenders can cover.
- Vertical stretch: more receivers running deep than there are deep defenders.
- Triangle stretch: three receivers in a triangle, so the defense is stretched high-low and side to side at the same time.

The QB usually reads one key defender. Whatever that defender does, throw to the receiver he can't cover.`,
        { minLevel: "middle_school", diagram: FOUR_VERTS(true) },
      ),
      lesson(
        "ALL",
        "Concepts: smash, flood, curl-flat, slant-flat",
        `- Smash: the outside receiver runs a hitch (short) and the inside receiver runs a corner (deep and outside). It's a high-low on the cornerback: if he sits on the hitch, throw the corner; if he drops, throw the hitch.
- Flood: three receivers to one side at three depths: one deep (a go that clears out the deep defender), one in the middle (often an out or a sail route), and one short (a flat).
- Curl-flat: the outside receiver runs a curl and an inside receiver or a back runs to the flat. It's a high-low on the flat defender: if he widens with the flat, throw the curl; if he sinks under the curl, throw the flat.
- Slant-flat: the outside receiver runs a slant and the inside receiver runs to the flat. It's a quick throw that puts the flat defender in a bind.`,
        { diagram: SMASH(false) },
      ),
      lesson(
        "ALL",
        "Concepts: stick, mesh and four verts",
        `- Stick: the outside receiver runs a clear-out route deep, the next receiver (often the tight end or slot) runs the stick at about 5 or 6 yards, and a back or slot runs to the flat. The QB reads the flat defender: flat or stick.
- Mesh: two receivers run shallow crossing routes from opposite sides, passing close to each other (about a yard apart). Defenders in man coverage have a hard time getting through the traffic. Receivers just run their routes: running into a defender on purpose to free a teammate is offensive pass interference.
- Four verts (four verticals): four receivers run deep. Against a defense with only three deep defenders, like Cover 3, someone should be open deep, often an inside receiver on a seam.`,
        { diagram: MESH },
      ),
    ],
    questions: [
      choice("ALL", "On many teams' route trees, what do odd-numbered routes do?", "Break to the outside, toward the sideline", ["Break to the inside, toward the middle", "Go deep, past 20 yards", "Belong to the tight end"], "In the common tree, odd routes (1, 3, 5, 7) break out and even routes (2, 4, 6, 8) break in. Your team's tree may differ.", { core: true }),
      choice("ALL", "Which route is usually number 9 on a common route tree?", "Go (also called fly or streak)", ["Slant", "Flat", "Curl"], "The 9 goes straight down the field."),
      choice("ALL", "What route is the highlighted receiver running?", "Slant", ["Out", "Post", "Curl"], "A short stem, then a sharp angle inside toward the middle: a slant.", { core: true, diagram: SLANT }),
      choice("ALL", "Name the highlighted receiver's route.", "Post", ["Corner", "Go", "Dig"], "Deep stem, then a break inside toward the goal posts: a post.", { diagram: POST }),
      choice("ALL", "What is a high-low stretch?", "Two receivers at different depths in one defender's area, so he can't cover both", ["Two receivers running deep side by side", "One receiver who runs deep and then comes back", "A pass thrown high so it can't be tipped"], "One defender, two depths: whichever he takes, throw the other.", { core: true, minLevel: "middle_school" }),
      choice("ALL", "In the smash concept, what do the two receivers run?", "The outside receiver runs a hitch and the inside receiver runs a corner", ["Both run go routes", "The outside receiver runs a post and the inside runs a slant", "Both run shallow crosses"], "Hitch underneath, corner over the top: that's smash.", { core: true }),
      choice("ALL", "Smash is a high-low on which defender (highlighted)?", "The cornerback", ["The middle linebacker", "The nose tackle", "The deep middle safety"], "The corner can't sit on the hitch and also stay deep with the corner route.", { minLevel: "middle_school", diagram: SMASH(true) }),
      choice("ALL", "A flood concept puts three receivers on one side at...", "Three different depths: deep, middle and short", ["The same depth, spread across the field", "The line of scrimmage, to block", "The middle of the field, all crossing"], "Flood fills one side at three levels so the zone defenders there are outnumbered.", { diagram: FLOOD }),
      choice("ALL", "What happens in the mesh concept?", "Two receivers run shallow crosses from opposite sides, passing close to each other", ["Two receivers run deep posts that cross behind the safety", "Two receivers stack and both run fades", "Two receivers block for a screen"], "The crossers pass about a yard apart, which makes man coverage hard.", { core: true }),
      trueFalse(["WR", "TE", "RB"], "On mesh, a receiver may run into a defender on purpose to free up his teammate.", false, "That's offensive pass interference, an illegal pick. Just run your route.", { minLevel: "middle_school" }),
      choice("ALL", "Four verticals sends four receivers deep. Which coverage has only three deep defenders to cover them?", "Cover 3", ["Cover 4", "Cover 2"], "Cover 3 has three deep thirds. Four deep receivers against three deep defenders means one should come open.", { minLevel: "middle_school", diagram: FOUR_VERTS(false) }),
      choice(["QB"], "In curl-flat, the QB reads the highlighted flat defender. He widens with the flat route. Where should the ball go?", "To the curl", ["To the flat, right at him", "Deep down the sideline", "Throw it away"], "If the flat defender widens, the curl behind him is open.", { minLevel: "middle_school", diagram: CURL_FLAT }),
      choice("ALL", "In the stick concept, what does the stick route do?", "Pushes upfield about 5 or 6 yards and settles in open space", ["Runs straight down the field as fast as possible", "Blocks the outside linebacker", "Runs a deep corner route"], "The stick sits underneath; the QB reads the flat defender to choose flat or stick.", { minLevel: "middle_school" }),
      choice("ALL", "Which concept puts the outside receiver on a slant and the inside receiver in the flat?", "Slant-flat", ["Smash", "Four verts", "Mesh"], "Slant inside, flat outside: a quick throw that puts the flat defender in a bind."),
      order("ALL", "In a flood concept, put the three routes in order from deepest to shortest.", ["Go (clear-out)", "Out or sail (middle level)", "Flat"], "The go clears out the deep defender, the sail sits in the middle level and the flat is underneath."),
      open(["QB", "WR", "TE", "RB"], "In your own words: how does curl-flat put the flat defender in a bind?", "He can't cover both routes. If he widens to cover the flat, the curl behind him opens up. If he sinks under the curl, the flat is open. The QB reads him and throws to the one he leaves.", ["he can't cover both", "widens: throw the curl", "sinks: throw the flat"], "One defender, two receivers at two depths: that's a high-low.", { minLevel: "middle_school" }),
    ],
  },

  // 5 ------------------------------------------------------------------
  {
    key: "off_reading_defense",
    version: 1,
    side: "offense",
    category: "concepts",
    name: "Reading the defense",
    summary: "Counting the box and numbers advantages, one-high vs two-high safeties, Cover 0, 1, 2, 3 and 4 tells, blitz tells, hot routes and sight adjustments.",
    level: "middle_school",
    for: ["QB", "WR", "TE", "RB"],
    lessons: [
      lesson(
        "ALL",
        "Count the box",
        `The box is the area near the line where run defenders line up: about from tight end to tight end and about 5 to 7 yards deep. Count the defenders in it.

Then count your blockers. In a one-back formation with a tight end you have six: five linemen and the tight end.
- Fewer defenders in the box than you have blockers: the run should be good.
- More defenders in the box than you can block: someone is free. Throw, or check to a play that attacks where they're light.
- An even count is a fair fight. A QB run threat, like the read option, can give you the extra man.

Count out wide too. If you have three receivers to a side and they have only two defenders out there, you have a numbers advantage, and a quick throw to that side can work.`,
        { diagram: BOX },
      ),
      lesson(
        "ALL",
        "One high or two high?",
        `Look at the safeties before every snap.
- One high: one safety deep in the middle. The middle of the field is closed. The most common one-high coverages are Cover 1 and Cover 3.
- Two high: two safeties deep, splitting the field. The middle of the field is open. The most common two-high coverages are Cover 2 and Cover 4.
- Zero high: no safety deep. Expect Cover 0, an all-out man blitz.

Defenses try to hide what they're in. A safety can rotate down or back at the snap, so a two-high look can turn into one-high. Use your look before the snap to guess, then confirm right after the snap by watching where the safeties go.`,
        { diagram: ONE_HIGH },
      ),
      lesson(
        "ALL",
        "Coverage tells: Cover 0 to Cover 4",
        `- Cover 0: no deep safety; man coverage on every receiver, with everyone else blitzing. Throw quick or hot.
- Cover 1: one deep safety; man coverage underneath. Corners often play tight. Win your matchup.
- Cover 2: two deep safeties, each with half the field. Corners stay short, jam receivers and sit in the flats. Look for the hole between the corner and the safety along the sideline, and the deep middle between the safeties.
- Cover 3: one deep safety and the two corners each take a deep third. Four defenders cover underneath. Look for the flats, the curls and the seams.
- Cover 4 (often called quarters): four deep defenders, each with a quarter of the field. Underneath is softer, but the safeties often jump the run.`,
        { diagram: COVER_3 },
      ),
      lesson(
        "QB",
        "Blitz tells",
        `A blitz brings more rushers than usual. Look for these tells before the snap:
- Linebackers creeping up toward the line or walking into a gap
- Linebackers or safeties standing close to the line in the A gaps
- No deep safety (zero high)
- A safety sneaking down toward the line late
- Defensive backs pressing with no help behind them
- More defenders near the line than you have blockers

Defenses fake blitzes too, and some players back out at the snap. If you see a tell, make sure everyone knows the protection, find your hot answer, and be ready to get the ball out fast. Good defenses disguise pressure, so trust what you see after the snap.`,
        { diagram: BLITZ_TELL },
      ),
      lesson(
        "ALL",
        "Hot routes and sight adjustments",
        `When the defense sends more rushers than you can block, somebody is unblocked. The QB can't hold the ball and wait. He has to throw hot: get the ball out quickly, usually to a receiver in the area the blitzer just left.

Teams handle this in different ways:
- Hot route: before the snap the QB (or a receiver) changes a route to a quick one, like a slant or a quick out.
- Sight adjustment: a receiver who sees a blitzer coming from his side changes his route on his own, usually to a quick route into the open space, and gets his eyes back to the QB right away.

Both only work if the QB and the receiver see the blitz the same way, which is why teams rep it in practice. Learn your team's rules.`,
        { diagram: HOT },
      ),
    ],
    questions: [
      choice("ALL", "What is the box?", "The area near the line, about tight end to tight end and a few yards deep, where run defenders line up", ["The area in the end zone", "The QB's pocket behind the line", "The space between the hash marks 10 yards downfield"], "Count the defenders in the box to see if the run has a chance.", { core: true }),
      choice("ALL", "You have six blockers. How many defenders are in the box here?", "6", ["5", "7", "8"], "Four linemen and two linebackers: six in the box against six blockers, an even count.", { diagram: BOX }),
      choice("ALL", "You have six blockers and the defense puts eight in the box. What usually makes sense?", "Throw, or check to a play that attacks where they're light", ["Run inside, because more defenders means more holes", "Snap it quickly before they can count", "Run a QB sneak every time"], "Eight against six means two defenders are free against the run. Attack where they took players away.", { core: true }),
      choice("ALL", "How many deep safeties do you see, and what does it usually mean?", "One: middle of the field closed, likely Cover 1 or Cover 3", ["Two: middle of the field open, likely Cover 2 or Cover 4", "Zero: an all-out blitz is coming", "One: it has to be Cover 2"], "One safety in the deep middle closes the middle of the field. Cover 1 and Cover 3 are the most common.", { core: true, diagram: ONE_HIGH }),
      choice("ALL", "The defense shows two deep safeties. Which coverages are most likely?", "Cover 2 or Cover 4", ["Cover 1 or Cover 3", "Cover 0", "You can't tell anything from the safeties"], "Two-high usually means Cover 2 or Cover 4, but confirm after the snap.", { diagram: TWO_HIGH }),
      trueFalse("ALL", "Middle of the field open means no safety is in the deep middle, usually because two safeties split the field.", true, "Two safeties each take a side, leaving the deep middle open."),
      choice("ALL", "What is Cover 0?", "No deep safety: man coverage on every receiver, usually with a blitz", ["No blitzers: everyone drops into coverage", "A defense with no cornerbacks", "Zone coverage with four deep defenders"], "Zero deep help means every receiver is one on one and the ball has to come out fast.", { core: true }),
      choice("ALL", "In Cover 3, where does a QB often find open receivers?", "Underneath and between the zones: the flats, curls and seams", ["Deep down the middle, behind the safety", "Deep down the sideline, behind the corner", "Nowhere: Cover 3 has no open spots"], "Three deep defenders take away the deep ball, so the windows are underneath and in the seams.", { diagram: COVER_3 }),
      choice("ALL", "In Cover 2, what do the corners usually do?", "Stay short, jam the receiver and sit in the flat, with a safety deep behind them", ["Run with their receiver all the way to the end zone", "Blitz the quarterback", "Drop to the deep middle"], "Cover 2 corners play short; the hole is between them and the safety along the sideline."),
      choice("ALL", "Which pre-snap tell does this picture show?", "A linebacker creeping up into a gap: a possible blitz", ["A safety backing up: a deep coverage", "A cornerback backing off: off coverage", "Nothing unusual"], "Linebackers creeping toward the line are a common blitz tell.", { core: true, diagram: BLITZ_TELL }),
      choice("ALL", "The defense sends more rushers than you have blockers. What does the QB usually do?", "Throw hot: get the ball out fast, often where the blitzer came from", ["Hold the ball for the deep route", "Always run to the other side", "Spike the ball"], "Someone is unblocked, so the ball has to come out before he gets there.", { core: true }),
      trueFalse(["QB", "WR", "TE"], "A sight adjustment only works if the QB and the receiver see the blitz the same way.", true, "If the receiver changes his route and the QB doesn't expect it, the ball goes to the wrong spot."),
      choice("ALL", "On one side you have three receivers and the defense has only two defenders out there. What does that tell you?", "You have a numbers advantage there; a quick throw that way may work", ["They have the advantage, so stay away", "Nothing: numbers outside don't matter", "It's an illegal formation"], "Three against two means one receiver is free. That's a numbers advantage."),
      order("ALL", "Put these coverages in order from fewest deep defenders to most.", ["Cover 0", "Cover 1", "Cover 2", "Cover 3", "Cover 4"], "The number usually matches the deep defenders: zero, one, two, three, four."),
      open(["QB"], "In your own words: why should a QB confirm the coverage after the snap?", "Defenses disguise what they're in. Safeties can rotate at the snap, so a two-high look can become one-high. The look before the snap is a guess; watching where the safeties go after the snap tells you what it really is.", ["defenses disguise", "safeties can rotate at the snap", "confirm by watching the safeties"], "The pre-snap look is a clue, not the answer."),
    ],
  },

  // 6 ------------------------------------------------------------------
  {
    key: "off_pass_protection",
    version: 1,
    side: "offense",
    category: "concepts",
    name: "Pass protection",
    summary: "Slide vs man (big on big) protection, why an unblocked rusher means throw hot, and how backs and tight ends protect and check-release.",
    level: "middle_school",
    for: ["OL", "TE", "RB", "QB"],
    lessons: [
      lesson(
        "ALL",
        "Two ways to protect: man and slide",
        `Pass protection keeps the QB clean long enough to throw. There are two basic ways:
- Man protection (often called big on big): the linemen block the down linemen (the bigs), and the backs block the linebackers. Each blocker has a man.
- Slide protection (a zone protection): the line steps together in one direction, and each lineman takes the gap on that side. You block whoever comes into your gap.

Many teams mix them: part of the line slides while the rest block man, and a back takes a linebacker. That's often called a half slide.

Before the snap someone, often the center or the QB, points out the middle linebacker (the Mike) so everyone counts the defense the same way.`,
      ),
      lesson(
        "OL",
        "Slide protection",
        `In a slide, all the linemen take a quick set step toward the slide side, and each one is responsible for his gap on that side. If a defender loops or twists into your gap, he's yours. Because you block areas, not men, slides handle stunts and twists well.

The catch: sliding one way leaves the last rusher on the other side without a lineman. That edge belongs to a back or a tight end, or the QB must know that rusher is hot and get the ball out before he arrives.

Stay square, keep your feet under you and never cross them. Keep your hands up and ready to punch.`,
        { diagram: SLIDE() },
      ),
      lesson(
        "ALL",
        "The hot idea",
        `Count it: if the defense rushes more players than you keep in to block, one of them is free. That's not a mistake by the line. It's math.

Good protections are built so the free rusher is one the QB knows about. He's called hot. The answer is to throw hot: get the ball out quickly to a receiver in the area the rusher came from, before he gets to the QB. Many coaches teach: if you can't block him, throw where he came from.

Everyone has a part:
- Linemen and backs block their assignments, even when one rusher is free.
- Receivers know when they're the hot route and look for the ball early.
- The QB knows before the snap who is hot and where the ball goes.`,
        { diagram: HOT },
      ),
      lesson(
        "RB",
        "Running backs in pass protection",
        `When you stay in to block, know the protection call before the snap and who your threats are. Many teams teach backs to check inside to outside: the most dangerous rusher is the one coming straight up the middle.

When your man comes:
- Step up and meet him close to the line. Don't wait for him in the QB's lap.
- Get a wide base with your knees bent, and strike with your hands inside on his chest.
- Keep your face up and your eyes on his chest. Never lower your head or lead with your helmet.
- Stay on your feet. Don't lunge or dive.

If nobody comes, check-release: slip out into your route, often a short check-down, so the QB has an outlet.`,
      ),
      lesson(
        "TE",
        "Tight ends: protect, then check-release",
        `A tight end in protection blocks like a tackle. Take a quick set step, stay square, and punch with both hands to the rusher's chest. Don't let him cross your face to the inside: that's the shortest way to the QB.

Many plays give the tight end a check-release: block first, then release. Set up as if you're blocking. If the defender you're responsible for rushes, block him. If he drops into coverage instead, release into your route, usually a short one where the QB can find you quickly.

Check-release lets the offense block a blitz when it comes and still get a receiver out when it doesn't.`,
      ),
    ],
    questions: [
      choice("ALL", "In man protection (often called big on big), who usually blocks the linebackers?", "The backs (running back, fullback or tight end)", ["The center blocks both linebackers", "Nobody: linebackers are ignored", "The wide receivers"], "Bigs on bigs: linemen take the down linemen and backs take the linebackers.", { core: true }),
      choice(["OL", "TE", "RB"], "In slide protection, each lineman is responsible for...", "A gap in the direction of the slide", ["The defender straight in front of him no matter what", "Only the defensive end", "The middle linebacker"], "A slide is a zone protection: block whoever comes into your gap on the slide side.", { core: true }),
      choice("ALL", "What does it mean to throw hot?", "Get the ball out fast because a rusher is unblocked", ["Throw it as hard as you can on every play", "Throw to the receiver who is playing best that day", "Throw it out of bounds"], "When a rusher is free, the QB can't wait. The ball comes out quickly to the hot receiver.", { core: true }),
      trueFalse("ALL", "If the defense rushes more players than you keep in to block, someone will be unblocked.", true, "Seven rushers against six blockers leaves one free. That's why teams have hot answers.", { core: true }),
      choice(["RB"], "Many teams teach a running back in pass protection to check his threats in what order?", "Inside to outside", ["Outside to inside", "Deepest defender first", "Biggest defender first"], "The rusher coming straight up the middle gets to the QB fastest, so check inside first."),
      choice(["RB", "TE"], "What is a check-release?", "Block first; if no one rushes your area, release into a route", ["Release first, then come back to block", "Check with the coach before every play", "Run a route only if the QB calls your name"], "Check-release lets a back or tight end block a blitz or, if it doesn't come, become a receiver.", { core: true }),
      choice(["RB"], "A linebacker blitzes and he's yours. What should you do?", "Step up and meet him with your hands, staying low with a wide base and your face up", ["Wait deep in the backfield and let him come to you", "Lower your head and hit him with your helmet", "Turn and run your route right away"], "Meet him near the line with your hands. Never lead with your helmet."),
      choice(["OL"], "Which protection is often better against twists and stunts, because blockers handle areas instead of men?", "Slide protection", ["Big on big man protection", "Five-man protection with nobody sliding", "Protection with every receiver blocking"], "In a slide you block whoever comes into your gap, so crossing rushers don't fool you."),
      choice(["OL", "QB"], "On many teams, who points out the middle linebacker (the Mike) so the line knows how to block?", "The center or the QB", ["The left tackle", "A wide receiver", "The kicker"], "Someone has to set the count so everyone blocks the same way. Learn who does it on your team."),
      trueFalse(["OL", "TE"], "In pass protection, a lineman should lean and lunge at the rusher to knock him down.", false, "Leaning and lunging put you off balance. Stay square, keep your feet under you and punch."),
      choice(["OL", "RB"], "The line slides left. Who usually takes the rusher on the right edge?", "The running back (or a tight end)", ["The center", "The left tackle", "A wide receiver"], "The slide leaves the far edge without a lineman, so a back or tight end takes him.", { diagram: SLIDE(["RB"]) }),
      order(["RB"], "Put a running back's pass protection steps in order.", ["Know the protection call before the snap", "Check your threats (many teams go inside to outside)", "Step up and block the first threat who comes", "If nobody comes, release into your route"], "Know it, see it, block it, and if nothing comes, get out as an outlet."),
      choice(["OL"], "Two defensive linemen cross each other (a twist). What do many teams teach the two linemen to do?", "Stay square and pass them off, each taking the rusher who comes to him", ["Both chase the first rusher", "Turn and run with your man wherever he goes", "Let them through and block the linebackers"], "Passing off a twist keeps both blockers in front of a rusher instead of chasing.", { minLevel: "high_school" }),
      open("ALL", "In your own words: what is the difference between man (big on big) and slide protection?", "In man protection each blocker has a certain defender: linemen take the down linemen and backs take the linebackers. In slide protection the line steps together one way and each lineman blocks whoever comes into his gap, with a back or tight end taking the edge on the other side.", ["man: each blocker has a defender", "slide: the line steps one way and blocks gaps", "a back takes the other edge in a slide"], "Man blocks men; slide blocks gaps."),
    ],
  },

  // 7 ------------------------------------------------------------------
  {
    key: "off_option_rpo",
    version: 1,
    side: "offense",
    category: "concepts",
    name: "Option and RPO basics",
    summary: "Read option (give or keep off the unblocked end), the triple option's dive, keep and pitch, and how RPOs read a conflict defender.",
    level: "middle_school",
    for: ["QB", "RB", "WR", "OL"],
    lessons: [
      lesson(
        "ALL",
        "Why option football works",
        `Normally the offense tries to block every defender who can make the tackle. Option football leaves one defender unblocked on purpose and reads him instead. Whatever he does, the ball goes to the player he isn't covering.

That defender is called the read key (or the conflict defender). Because the QB's read takes care of him, the blocker who would have blocked him can block someone else. That gives the offense an extra blocker where the play is going.

The QB has to be patient and make the right read every time. Everyone else has to do his job too: a back who gets faked to still runs hard, so the defense has to respect him.`,
      ),
      lesson(
        "QB",
        "The read option (zone read)",
        `The read option is usually run from the shotgun. The running back runs inside zone one way. The line blocks zone and leaves the backside defensive end unblocked. The QB reads that end.
- If the end crashes down hard toward the running back, the QB pulls the ball and runs outside, where the end left.
- If the end stays wide, sits, or rushes up the field at the QB, the QB gives the ball to the running back.

The mesh: the QB puts the ball in the back's belly and rides it with his eyes on the end, not the back. Many coaches teach one simple rule: if the end can tackle the running back, keep it; if he can't, give it.`,
        { diagram: READ_OPTION },
      ),
      lesson(
        "QB",
        "The triple option",
        `The triple option gives the defense three things to stop: the dive, the QB keep and the pitch. It uses two reads.
- First read (often called the dive key): usually a defensive lineman near the play-side tackle. The QB meshes with the dive back and reads him. If the dive key won't tackle the dive back, give it. If he squeezes down to take the dive, pull the ball.
- Second read (often called the pitch key): the next defender outside. The QB attacks him with the ball. If he comes to tackle the QB, pitch the ball to the trailing back. If he stays wide for the pitch, keep it and run.

Which defenders are the keys depends on the defensive front, so learn your team's rules.`,
        { diagram: TRIPLE },
      ),
      lesson(
        "ALL",
        "RPOs: run-pass options",
        `An RPO puts a run and a pass on the same play. The line blocks a run. A receiver runs a quick route. The QB reads one defender, usually a linebacker or a nickel back who has both a run job and a pass job (a conflict defender).
- If he comes up to stop the run, throw the route behind or beside him.
- If he stays back in coverage, hand the ball off.

Some RPOs are decided before the snap, by looking at alignment and numbers. Others are read after the snap. Either way the ball has to come out fast: the linemen are run blocking, and the rules don't let them be more than a short distance downfield when a pass is thrown past the line.`,
        { diagram: RPO },
      ),
      lesson(
        "ALL",
        "Doing your job without the ball",
        `Option plays only work if everyone sells them.
- Dive back: run hard through the mesh like you have the ball. If the QB pulls it, keep going and become a blocker.
- Pitch back: keep a pitch relationship: a few yards outside the QB and a little behind him, so the pitch is always backward. Many teams teach about four or five yards wide and a yard or two deep. Look the ball in, catch it, then turn up.
- Receivers on RPOs: run the route full speed every time. If you jog, the conflict defender stops respecting the throw.
- Linemen: block the run, and on an RPO don't drift downfield.

A pitch must go backward or straight sideways. If it goes forward, it's a forward pass.`,
      ),
    ],
    questions: [
      choice("ALL", "On the read option, whom does the QB usually read?", "The unblocked backside defensive end", ["The nose tackle", "The free safety", "The cornerback on the other side"], "The line leaves the backside end unblocked on purpose, and the QB reads him.", { core: true, diagram: READ_OPTION }),
      choice(["QB", "RB"], "On the read option, the end crashes hard down toward the running back. What should the QB do?", "Keep the ball and run where the end left", ["Hand it to the running back", "Throw it deep", "Pitch it to a receiver"], "If the end can tackle the back, the QB keeps it and runs into the space the end left.", { core: true }),
      choice(["QB", "RB"], "On the read option, the end stays wide to take the QB. What does the QB do?", "Give the ball to the running back", ["Keep it and run at the end", "Throw it away", "Pitch it backward to a lineman"], "The end can't tackle the back from out wide, so the QB gives."),
      trueFalse("ALL", "In option football, the offense leaves a defender unblocked on purpose and reads what he does.", true, "Reading him instead of blocking him frees a blocker for someone else.", { core: true }),
      order(["QB"], "Put the triple option reads in order.", ["Mesh with the dive back and read the dive key", "Pull the ball if the dive key takes the dive", "Attack the pitch key with the ball", "Pitch if he takes the QB; keep if he takes the pitch"], "First read: dive or pull. Second read: keep or pitch."),
      choice("ALL", "What are the three options in the triple option?", "Dive, QB keep and pitch", ["Run, pass and punt", "Dive, screen and deep pass", "Sweep, reverse and trick play"], "The dive back, the QB and the pitch back each might get the ball.", { core: true, diagram: TRIPLE }),
      choice(["QB", "RB"], "On the triple option, the pitch key attacks the QB. What should the QB do?", "Pitch the ball to the trailing back", ["Keep it and run into him", "Give it to the dive back late", "Throw it forward to a receiver"], "If the pitch key takes the QB, nobody is left for the pitch back."),
      trueFalse("ALL", "On the option, a pitch must go backward or straight sideways, not forward.", true, "A ball tossed forward counts as a forward pass. Keep the pitch relationship so the pitch is always backward."),
      choice("ALL", "What is an RPO?", "A play where the line blocks a run and the QB reads a defender to decide whether to hand off or throw", ["A pass play with seven blockers", "A fake punt", "A play where a receiver throws the ball"], "RPO stands for run-pass option: one read decides run or throw.", { core: true }),
      choice(["QB"], "On an RPO, the defender you're reading steps up hard to stop the run. What do you do?", "Throw the route behind him", ["Hand off anyway", "Keep it and run right at him", "Call a timeout"], "If he plays the run, the space he left in coverage is open.", { diagram: RPO }),
      choice(["QB", "OL"], "On an RPO, why must the ball come out quickly when the QB throws?", "The linemen are run blocking, and they can't be far downfield when a pass is thrown past the line", ["The receivers get tired", "The play clock is still running", "The linemen are pass blocking, so the QB has extra time"], "Run blocking linemen move forward. Throw it quickly so they're not illegally downfield."),
      choice("ALL", "Why do option plays help the offense?", "The QB's read takes the place of a block, so the offense gets an extra blocker somewhere else", ["Defenders aren't allowed to tackle the QB", "Option plays can't lose yards", "The offense gets an extra down"], "Reading one defender instead of blocking him frees a blocker."),
      choice(["RB"], "On the option, where should the pitch back stay?", "A few yards outside the QB and a little behind him", ["Right beside the QB, even with him", "Ahead of the QB, leading the way", "Right behind the center"], "That pitch relationship keeps the pitch backward and gives the QB a clean toss."),
      open(["QB"], "In your own words: on the read option, how does the QB decide to give or keep?", "He reads the unblocked backside end. If the end crashes down and can tackle the running back, the QB keeps it and runs where the end left. If the end stays wide or comes at the QB, he gives it to the running back.", ["read the unblocked end", "end crashes: keep", "end stays wide: give"], "The end decides: the QB gives the ball to whoever the end can't tackle."),
    ],
  },

  // 8 ------------------------------------------------------------------
  {
    key: "off_ol_technique",
    version: 1,
    side: "offense",
    category: "technique",
    name: "Offensive line technique",
    summary: "Stance, first step, hat and hands, drive, reach and down blocks, double teams, pulling to kick out or wrap, pass set and punch.",
    level: "youth",
    for: ["OL", "TE"],
    styles: [
      {
        key: "ol_stance",
        question: "What stance do your linemen use?",
        options: [
          { key: "three_point", label: "Three-point stance", summary: "One hand on the ground. Fire out low on runs; keep it balanced so it doesn't give away run or pass." },
          { key: "two_point", label: "Two-point stance", summary: "No hand down. Easier to see the defense and set in pass protection; sink the hips to fire out on runs." },
        ],
      },
    ],
    lessons: [
      lesson(
        "OL",
        "Your stance: three-point",
        `In a three-point stance one hand is on the ground.
- Feet about shoulder-width apart, with a small toe-to-heel stagger. Many teams put the outside foot back.
- Down hand just inside the back foot, with only a little weight on it.
- Back flat, hips about level with your shoulders, head up, eyes forward.
- Off arm resting on your thigh, ready to come up for the block.

Keep it balanced so you can fire forward on a run, step back into a pass set or pull to either side without giving it away. If you lean too much on your hand, you can only go forward, and defenders will notice. A good stance looks the same on every play.`,
        { style: "ol_stance:three_point" },
      ),
      lesson(
        "OL",
        "Your stance: two-point",
        `In a two-point stance no hand is on the ground.
- Feet about shoulder-width or a little wider, with a small stagger. Many teams put the outside foot back.
- Knees bent and hips down, as if you're sitting on the front edge of a chair.
- Chest up, back flat, weight on the balls of your feet, not your heels.
- Hands ready, on or just above your thighs.

A two-point stance makes it easier to see the defense and to set quickly in pass protection, which is why many spread teams use it. The danger is standing up too tall on run plays. On the snap, sink your hips and fire out low, so you're the lower man when you make contact.`,
        { style: "ol_stance:two_point" },
      ),
      lesson(
        "OL",
        "First step, hat and hands",
        `Every block starts with the same three things.
- First step: short and quick, in the direction you need to go. A long first step puts you off balance. Win the first step and you usually win the block.
- Hat (head) placement: your head goes to the side you're keeping the defender away from, usually the play side. Keep your face up and your eyes on your target so you see what you hit. Your helmet is never what you hit with.
- Hands: hands go inside, on the defender's chest plate, thumbs up and elbows in. Inside hands control him. Hands outside his body get you called for holding.

Then keep your feet moving. Low man wins: bend at your knees and hips, not your waist.`,
      ),
      lesson(
        "OL",
        "Run blocks: drive, reach and down",
        `- Drive (base) block: the defender is in front of you. Take a short step, get your hands inside and drive him back with short, choppy steps. Keep your head on the play side of him and finish the block.
- Reach block: the defender is on your play-side shoulder. Take a quick lateral step to the play side, aim your hands and head at his play-side half, and keep running your feet until your hips get around him. Now he's sealed inside, away from the play.
- Down block: block the defender inside you. Step down at him, get your hands on his near side, and keep your face up with your head in front of him so he can't get upfield. Drive him down the line toward the ball.

For all three: hands do the work, eyes up, feet moving.`,
        { diagram: REACH },
      ),
      lesson(
        "OL",
        "Double teams and pulling",
        `Double team (often called a combo): two blockers hit one down lineman together, hip to hip so he can't split them. Drive him back and keep your eyes on the linebacker. When the linebacker commits, one of you comes off to block him.

Pulling: open your play-side foot (many teams call it a pull step), turn your shoulders and run flat along the line, staying close to it. Find your target.
- Kick-out: block the end man on the line from the inside out. Get your head on his inside, hands on him, and push him toward the sideline. The runner goes inside your block.
- Log: if the end squeezes down so hard you can't get inside him, get your head outside him and seal him in. The runner goes outside.
- Wrap: turn up through the hole and block a linebacker.`,
        { diagram: KICK_OUT },
      ),
      lesson(
        "OL",
        "Pass set and punch",
        `On a pass play, set quickly and stay between the rusher and the QB.
- Set: tackles often kick back with the outside foot and slide; guards and the center take a shorter, quicker set. Keep your shoulders square, your feet under you, and never cross your feet.
- Posture: knees bent, back straight, chest up, weight on the balls of your feet, hands up and ready.
- Punch: a short, quick strike with both hands to the rusher's chest, thumbs up. Then reset your feet and punch again if he keeps coming.
- Don't lunge or lean on him. If you lean, he'll pull you off balance and go around you.

Protect the inside first. Many coaches say never get beat inside, because that's the shortest path to the QB. Keep your hands inside his frame so you don't get called for holding.`,
      ),
    ],
    questions: [
      choice(["OL"], "In a three-point stance, how much weight should be on your down hand?", "Just a little, so you can go forward, back or sideways", ["Almost all of it, so you fall forward fast", "None: the hand doesn't touch the ground", "Enough that your back foot comes off the ground"], "Too much weight on the hand means you can only go forward, and the defense can tell.", { style: "ol_stance:three_point" }),
      choice(["OL"], "In a two-point stance, how do you keep from playing too tall on run plays?", "Sink your hips and fire out low on the snap", ["Stand up straight so you can see better", "Lean back on your heels", "Wait for the defender to come to you"], "Low man wins. From a two-point stance you have to sink your hips to get under the defender.", { style: "ol_stance:two_point" }),
      choice(["OL", "TE"], "When you block, what does the hitting?", "Your hands, with your face up and your head out of the contact", ["The top of your helmet", "Your shoulder pads, with your head down", "Your forearms, swung like a club"], "Hands do the hitting. Keep your face up so you can see what you hit; never lead with your helmet.", { core: true }),
      choice(["OL", "TE"], "Where do your hands go on a run block?", "Inside, on the defender's chest plate, thumbs up", ["Outside, on his shoulder pads", "On the back of his jersey", "On his face mask"], "Inside hands control the defender. Outside hands lead to holding; the face mask is a foul.", { core: true }),
      trueFalse(["OL", "TE"], "Your first step should be a long stride so you cover more ground.", false, "A short, quick first step keeps you balanced. A long step puts you off balance.", { core: true }),
      choice(["OL", "TE"], "The defender is on the highlighted guard's play-side shoulder. Which block seals him inside?", "A reach block: step to the play side and work your head and hands to his play-side half", ["A down block on the man inside", "A pass set", "A kick-out block"], "To seal a defender who is shaded to the play side, you have to reach him.", { minLevel: "middle_school", diagram: REACH }),
      choice(["OL", "TE"], "On a down block, where does your head go?", "In front of the defender, face up, so he can't get upfield", ["Behind him, on his back", "Down, looking at the ground", "Straight into his helmet"], "Head in front, face up, hands on him. Blocking him from behind is a foul.", { diagram: DOWN_BLOCK }),
      choice(["OL"], "The highlighted guard pulls to kick out the end. Where should his head go?", "On the inside of the end, so he can push him out and the runner cuts inside", ["On the outside of the end, so the runner goes outside", "Right into the end's face mask", "It doesn't matter on a pull"], "A kick-out is an inside-out block: head inside, push him toward the sideline.", { minLevel: "middle_school", diagram: KICK_OUT }),
      choice(["OL"], "You pull to kick out the end, but he squeezes down so hard you can't get inside him. What do many teams teach?", "Log him: get your head outside him, seal him in, and the runner goes outside", ["Run past him to the safety", "Stop and go back to your spot", "Push him from behind"], "If you can't kick him out, log him in and let the runner bounce outside.", { minLevel: "middle_school" }),
      choice(["OL", "TE"], "What is a punch in pass protection?", "A short, quick strike with both hands to the rusher's chest, thumbs up", ["A closed-fist hit to the helmet", "A long, slow push with your arms locked", "Grabbing outside his shoulders"], "Punch, then reset your feet. Hits to the head and grabbing outside the shoulders are fouls.", { core: true }),
      order(["OL"], "Put the steps of pulling in order.", ["Open your play-side foot (pull step)", "Turn your shoulders and run flat along the line", "Find your target", "Block him with your hands, head on the correct side"], "Step, turn and run, find him, then block him with your hands."),
      trueFalse(["OL", "TE"], "In a pass set, cross your feet so you can move faster.", false, "Never cross your feet. Crossed feet mean no balance, and a rusher will push you over.", { core: true }),
      choice(["OL"], "On a double team, how do the two blockers fit together?", "Hip to hip, so the defender can't split them", ["A yard apart, so each can see the linebacker", "One behind the other", "Facing different directions"], "A gap between the blockers lets the defender split the double team.", { minLevel: "middle_school", diagram: DOUBLE(["C", "RG"]) }),
      choice(["OL", "TE"], "In pass protection, which way do many coaches say you must never get beat?", "Inside, because it's the shortest way to the QB", ["Outside, toward the sideline", "Straight back over you", "Neither: it doesn't matter"], "An inside rusher has the shortest path to the QB, so protect inside first.", { minLevel: "middle_school" }),
      open(["OL", "TE"], "In your own words: what does hat and hands mean for a blocker?", "Hat means your head goes to the correct side of the defender, usually the side you're keeping him from, with your face up and eyes on him. Hands means your hands go inside on his chest plate. Your hands do the hitting, never your helmet.", ["head on the correct side, face up", "hands inside on the chest", "the helmet doesn't hit"], "Head on the right side, hands inside: that's how every block starts."),
    ],
  },

  // 9 ------------------------------------------------------------------
  {
    key: "off_ball_carrier",
    version: 1,
    side: "offense",
    category: "technique",
    name: "Ball carrier skills",
    summary: "Ball security (high and tight, points of pressure), taking a handoff, pressing the hole and reading blocks, cutting off a double team, finishing runs and pass protection for backs.",
    level: "youth",
    for: ["RB", "QB", "WR"],
    lessons: [
      lesson(
        "ALL",
        "Ball security: high and tight",
        `Every ball carrier's first job is to protect the ball. Carry it high and tight:
- Fingertips over the front point of the ball
- Ball resting on your palm and forearm
- Back point tucked into the inside of your elbow
- Ball squeezed against your chest

Many coaches call these the points of pressure. When the ball is pressed at all of them, it's very hard to knock out.

Carry the ball in the arm away from the nearest defender, usually the sideline arm. If you need to switch arms, do it in open space, never in traffic. When you're about to be hit or you're in a crowd, cover up: bring your other hand over the front point and wrap the ball with both arms. Never carry it loose by your hip or hold it out to reach for yards.`,
      ),
      lesson(
        "RB",
        "Taking the handoff",
        `A good handoff is the back's job as much as the QB's.
- Make a pocket: the arm closest to the QB goes up, elbow high, across your chest. The other arm goes across your belly, palm up. Leave room between them for the ball.
- Keep your eyes on the line and the blocks, not on the ball. The QB puts the ball in your pocket; don't reach for it.
- When the ball hits your belly, clamp down with both arms right away.
- Get it to the high and tight carry before you reach the line.

Fumbled handoffs usually come from someone looking down, reaching for the ball or running the wrong path. Run your path the same way every time so the QB knows where you'll be.`,
      ),
      lesson(
        "RB",
        "Pressing the hole and reading blocks",
        `Pressing means running at your aiming point long enough for the blocks to set up and the linebackers to pick a gap. Cut too early and the linebackers just follow you. Go too slow and the hole closes.
- Run at your aiming point with speed you can still cut from.
- Read the blocks in front of you, not just the hole that was called. On zone plays the defense will show you where to go.
- Make one hard cut and get going north and south. Don't dance behind the line.

Cutting off a double team: aim at the double team. When the linebacker picks a side of it, cut to the other side. Now the double team is between you and him.`,
        { diagram: CUT_DOUBLE },
      ),
      lesson(
        "RB",
        "Finishing runs",
        `A run isn't over until you're down. Finish every run going forward.
- Lower your pads before contact: bend your knees and hips so you're the low man.
- Keep your eyes and face up and see what you hit. Never duck your head or lead with the crown of your helmet. It's dangerous, and it's a foul.
- Keep your legs driving after contact. Short, choppy steps keep you up and moving.
- Cover the ball with both hands when you're being tackled.
- Fall forward. Two extra yards at the end of every run adds up.

Get skinny through the hole: turn your shoulders to slide through a small gap, then square back up and run.`,
      ),
      lesson(
        "RB",
        "Backs in pass protection",
        `On pass plays a back often stays in to block. Know your assignment before the snap and who your threats are.
- Step up and meet the rusher near the line. Don't wait for him in the QB's lap.
- Wide base, knees bent, face up. Strike with your hands inside on his chest.
- Don't duck your head and don't dive. Stay on your feet and stay in front of him.
- If nobody comes, release into your route (a check-release) so the QB has a short throw.

A back who can protect the QB is a back who stays on the field on passing downs.`,
      ),
    ],
    questions: [
      choice(["RB", "QB", "WR", "TE"], "How should you carry the ball in the open field?", "High and tight, with the points covered, in the arm away from the nearest defender", ["Down by your hip so you can run faster", "Out away from your body", "In both hands held out in front of you"], "High and tight in the outside arm keeps the ball away from defenders.", { core: true }),
      choice(["RB", "QB", "WR", "TE"], "Many coaches teach points of pressure on the ball. Which is one of them?", "Fingertips over the front point of the ball", ["Fingertips under the laces only", "The ball resting on your hip", "The back of your hand"], "Fingertips over the front point, palm and forearm, inside of the elbow, and chest."),
      choice(["RB", "QB", "WR", "TE"], "You're about to be hit in traffic. What should you do with the ball?", "Cover it with both hands and arms", ["Switch it to the other hand", "Hold it out to reach for extra yards", "Toss it to a teammate"], "Two hands over the ball in traffic. Most fumbles come from one loose arm in a crowd.", { core: true }),
      trueFalse(["RB", "QB", "WR", "TE"], "Switch the ball to your outside arm while you're being tackled.", false, "Switch arms only in open space. Switching in traffic is how fumbles happen."),
      choice(["RB"], "When you take a handoff, which arm is on top?", "The arm closest to the QB", ["The arm away from the QB", "Neither: both hands stay at your sides", "Both arms go on top"], "Inside arm up, outside arm across the belly makes a pocket for the ball.", { core: true }),
      choice(["RB"], "Where should your eyes be when you take a handoff?", "On the line and the blocks ahead, not on the ball", ["On the ball until it's in your arms", "On the QB's face", "On the sideline"], "The QB places the ball. Your job is to see the blocks and find the hole.", { core: true }),
      choice(["RB"], "What does it mean to press the hole?", "Run at your aiming point long enough for blocks to set up and linebackers to commit, then cut", ["Push your blocker into the hole", "Stop and wait at the line for a hole", "Run as wide as you can right away"], "Pressing makes linebackers commit so your cut leaves them behind."),
      choice(["RB"], "Two linemen double team, and the linebacker steps to the left of the double team. Where should the highlighted back cut?", "To the right of the double team, away from the linebacker", ["To the left, right at the linebacker", "Straight into the back of the double team", "Back to the other side of the field"], "Cut off the double team away from the linebacker so the blockers are between you and him.", { minLevel: "middle_school", diagram: CUT_DOUBLE }),
      trueFalse(["RB"], "A good runner makes one cut and gets going north and south instead of dancing behind the line.", true, "Every step sideways behind the line gives the defense time to catch up."),
      choice(["RB", "WR"], "When you finish a run, what should you do with your pads and head?", "Lower your pads, keep your face and eyes up, and keep your legs driving", ["Duck your head and lead with your helmet", "Stand straight up", "Stop your feet and brace for the hit"], "Low pads and driving legs win. Leading with the helmet is dangerous and a foul.", { core: true }),
      order(["RB"], "Put taking a handoff in order.", ["Form the pocket with your inside arm up", "Keep your eyes on the line as the ball arrives", "Clamp down with both arms", "Press the hole and read the blocks"], "Pocket, eyes up, clamp, then run your read."),
      choice(["RB"], "On a pass play, a linebacker blitzes through your gap. What's your job?", "Step up and block him with your hands, keeping your face up", ["Run your route and ignore him", "Wait for him to reach the QB", "Fake the handoff again"], "Meet him near the line with your hands. If nobody comes, then release."),
      choice(["QB"], "When a QB scrambles past the line and becomes a runner, how should he carry the ball?", "High and tight like a running back, covering it up in traffic", ["Out in one hand so he can still throw it", "Down by his hip", "Held over his head"], "Once he's a runner past the line, the QB carries the ball like any ball carrier."),
      open(["RB", "QB", "WR", "TE"], "In your own words: how do you protect the ball when you run through traffic?", "Carry it high and tight with the points of pressure covered, in the arm away from the defenders. In traffic or when I'm about to be hit, I cover it with both hands and arms. I don't switch arms or reach the ball out in a crowd.", ["high and tight / points covered", "both hands over it in traffic", "don't switch arms in traffic"], "Two hands in traffic, high and tight always."),
    ],
  },

  // 10 -----------------------------------------------------------------
  {
    key: "off_qb_technique",
    version: 1,
    side: "offense",
    category: "technique",
    name: "Quarterback technique",
    summary: "Grip, the snap, under-center drops and shotgun footwork, throwing mechanics, handoffs and ball fakes, eyes and progressions, and ball security in the pocket.",
    level: "youth",
    for: ["QB"],
    lessons: [
      lesson(
        "QB",
        "Grip and the snap",
        `Grip: hold the ball with your fingertips, not your palm. Many QBs put their ring and little fingers across the laces, with the index finger near the back point and the thumb underneath. Leave a little air between your palm and the ball. Hands are different sizes, so find the grip that lets you throw a tight spiral.

Under center: feet about shoulder-width, knees bent. Put your throwing hand on top, pressed up against the center, with your thumbs together and the other hand below to catch the ball. Ride forward with the center as he snaps, so you don't pull out early and fumble.

Shotgun: hands ready in front of you and eyes on the ball until it's in your hands. Find the laces as you start your footwork.`,
      ),
      lesson(
        "QB",
        "Footwork: drops from under center and the gun",
        `Your feet set the timing of the play. Drops are counted in steps:
- 3-step (quick) drop from under center: about 5 yards deep. Goes with quick routes like slants and hitches.
- 5-step drop: about 7 yards deep. Goes with medium routes like curls and digs.
- 7-step drop: about 9 yards deep. Goes with deeper routes.

From the shotgun you start about 5 yards back, so drops are shorter: a 3-step drop usually becomes a 1-step or a catch-and-throw, and a 5-step becomes a 3-step.

Push off hard on the first step to gain depth, keep the ball high, and hit your last step under control so you can throw on time. Teams count and name drops differently, so learn your team's.`,
        { diagram: DROPS },
      ),
      lesson(
        "QB",
        "Throwing mechanics",
        `- Base: feet about shoulder-width, knees slightly bent, front shoulder pointed at the target.
- Ball high: carry the ball near your chest or ear with both hands on it until you throw.
- Step: stride toward the target with your front foot. Not too long.
- Turn: power comes from the ground up. Turn your hips, then your shoulders, then bring your arm through.
- Elbow up: keep your throwing elbow at about shoulder height or higher and release the ball high.
- Follow through: let your throwing hand finish down and across toward your opposite hip, thumb pointing down.
- Eyes: keep them on the target the whole time.

Most misses start with the feet. A front step that's too long, or that points away from the target, pulls the ball off line.`,
      ),
      lesson(
        "QB",
        "Handoffs and ball fakes",
        `Handoffs: look the ball into the back's pocket. Place it in his belly; don't throw it at him. Then get out of his way and carry out your fake.

Fakes: a good fake makes defenders chase the wrong player.
- Make the fake look exactly like the real handoff: same footwork, same speed, same eyes.
- After a handoff, keep running your fake (a bootleg, a drop or a keep) so the end and the linebackers have to watch you.
- On play-action, reach the ball out to the back, pull it back to your chest with both hands, then get your eyes up fast to find your first read.

The more your real plays and your fakes look alike, the slower the defense gets.`,
      ),
      lesson(
        "QB",
        "Eyes, progressions and the pocket",
        `Know before the snap who you're reading and where the ball should go. Many pass plays have a progression: an order to look at your receivers, like first, second, then the check-down. Your coach sets the order for each play.
- Look at your reads in order. When one is covered, move on.
- Don't stare down one receiver. Defenders read your eyes.
- Keep two hands on the ball in the pocket until you throw. A loose ball in the pocket is a fumble waiting to happen.
- When rushers come from the outside, step up into the pocket. Don't drift back.
- If nothing is open, don't force it. Check it down, run if you have room, throw it away where your rules allow, or take the sack. A sack is better than an interception.`,
        { diagram: POCKET },
      ),
    ],
    questions: [
      choice(["QB"], "When gripping the football, where do many QBs put their fingers?", "Ring and little fingers on the laces, holding it with the fingertips", ["The whole palm flat against the ball", "All fingers on the back point", "The thumb on the laces"], "Fingertips on the laces with a little air under the palm gives control and a tight spiral.", { core: true }),
      trueFalse(["QB"], "Hold the ball with your fingertips, leaving a little space between your palm and the ball.", true, "A fingertip grip lets the ball roll off your fingers into a spiral."),
      choice(["QB"], "Under center, where does your throwing hand go?", "On top, pressed up against the center, with the other hand below to catch the ball", ["Below, catching the ball from underneath", "Behind your back", "On the center's helmet"], "Top hand presses up into the center; bottom hand catches. Ride forward with him so you don't pull out early.", { core: true }),
      choice(["QB"], "On many teams, what does a 3-step drop from under center become in the shotgun?", "A 1-step drop or a catch-and-throw", ["A 5-step drop", "A 7-step drop", "A spin move"], "You start 5 yards deep in the gun, so the drop shrinks to keep the same timing.", { minLevel: "middle_school" }),
      choice(["QB"], "What should the depth of your drop match?", "The timing of the routes: quick routes, quick drop", ["The down and distance", "How far the center snaps it", "The weather"], "Quick routes need a quick drop; deeper routes need a deeper drop so the ball comes out on time.", { diagram: DROPS }),
      order(["QB"], "Put the throwing motion in order.", ["Ball high with two hands, front shoulder to the target", "Step toward the target with your front foot", "Turn your hips and shoulders and bring the ball through high", "Follow through toward your opposite hip"], "Set, step, turn and throw, then follow through.", { core: true }),
      choice(["QB"], "Where should your front foot step when you throw?", "Toward the target", ["Away from the target", "Straight back", "Across your body"], "Stepping at the target lines up your hips and shoulders so the ball goes where you aim."),
      trueFalse(["QB"], "In the pocket, keep two hands on the ball until you throw.", true, "Two hands in the pocket prevents strip-sack fumbles.", { core: true }),
      choice(["QB"], "Why should a QB carry out his fake after a handoff?", "So defenders watch him instead of tackling the real ball carrier", ["Because the rules require it", "So he can block the linebacker", "So he can rest"], "If the QB stops, defenders forget about him and go to the ball."),
      choice(["QB"], "During a progression, what should the QB do?", "Look at his reads in order and move on when one is covered", ["Pick one receiver before the snap and throw to him no matter what", "Watch the pass rush the whole time", "Throw to the deepest receiver every time"], "A progression is a set order. Move through it until you find the open receiver.", { core: true }),
      choice(["QB"], "Rushers are coming from both edges. What is usually the best move?", "Step up into the pocket", ["Drift straight back", "Spin toward a rusher", "Sit down"], "Edge rushers run past the pocket. Stepping up gets you away from them.", { minLevel: "middle_school", diagram: POCKET }),
      trueFalse(["QB"], "Staring at one receiver the whole play helps the defense know where you're throwing.", true, "Defenders read the QB's eyes. Look through your progression."),
      choice(["QB"], "On play-action, what must the QB do quickly after the fake?", "Get his eyes up and find his first read", ["Keep watching the running back", "Run toward the line", "Throw to the running back"], "The fake buys time only if your eyes get back downfield fast.", { minLevel: "middle_school" }),
      open(["QB"], "In your own words: what should a QB do when nothing is open?", "Don't force a bad throw. Check it down, run if there's room, throw it away where the rules allow, or take the sack. A sack is better than an interception.", ["don't force it", "check down or throw it away", "a sack is better than an interception"], "Protect the football first; live to play the next down.", { minLevel: "middle_school" }),
    ],
  },

  // 11 -----------------------------------------------------------------
  {
    key: "off_receiver_technique",
    version: 1,
    side: "offense",
    category: "technique",
    name: "Receiver technique",
    summary: "Stance, release against press and off coverage, stem and break, catching by ball height, tucking, stalk blocks and legal crack blocks.",
    level: "youth",
    for: ["WR", "TE"],
    lessons: [
      lesson(
        "WR",
        "Stance and release",
        `Stance: a two-point stance with your feet about shoulder-width apart and one foot forward. Many teams put the inside foot (the foot closer to the ball) forward. Bend your knees, keep most of your weight on your front foot, and hold your hands up and ready. Turn your head to see the ball if you can.

Release against off coverage (the defender is several yards away): get off the line fast and run right at him to eat up his cushion.

Release against press (the defender is right in front of you): use your feet and hands together. A quick jab step one way gets him moving; then go the other way. Use your hands to knock his hands away (swipe, rip or swim) so he can't get them on your chest. Win to the side your route is going.`,
        { diagram: PRESS },
      ),
      lesson(
        "WR",
        "Stem and break",
        `The stem is the part of the route before the break. Run it like it could be a deep route, so the defender has to back up and turn his hips. Push at his leverage: if he's lined up inside you, push at his inside shoulder to make him turn.

The break is the cut:
- In your last two or three steps, shorten your stride and sink your hips: lower your weight with your chest over your knees.
- Plant and drive out of the cut. Don't round it off; a rounded route lets the defender catch up.
- Snap your head and eyes back to the QB right away.

Run your routes at the right depth. The QB is throwing to a spot, and he needs you there on time.`,
        { diagram: STEM_BREAK },
      ),
      lesson(
        "ALL",
        "Catching the ball",
        `Catch with your hands, not your body. Reach out to the ball and watch it all the way into your hands.
- At your chest or higher: thumbs together, fingers spread. Your thumbs and pointer fingers make a diamond (some call it a triangle).
- Below your waist: little fingers (pinkies) together.
- Over your shoulder on a deep ball: pinkies together, hands out in front of you, and look the ball in.

Then tuck it. Bring the ball high and tight into the arm away from the closest defender right away, before you turn to run. Catch, tuck, then run: most drops happen when a receiver looks upfield before he has the ball.`,
      ),
      lesson(
        "WR",
        "Blocking: stalk and crack",
        `Receivers block on almost every run. Big runs happen because a receiver blocked downfield.

Stalk block (on a defensive back in front of you):
- Come off the line like it's a pass, so he backs up.
- When you get close, break down: shorten your steps, sink your hips and get balanced.
- Mirror him. Punch with your hands inside on his chest, keep your feet moving and stay between him and the ball carrier.

Crack block (blocking inside on a linebacker or safety):
- Hit him in the front or side, above the waist, with your hands and your face up.
- If you see the numbers on his back, don't block him. A block in the back is a foul and can hurt someone.
- Never block below the waist on a crack block.`,
        { diagram: CRACK },
      ),
    ],
    questions: [
      choice(["WR", "TE"], "In a receiver's stance, where is your weight?", "Mostly on the front foot, knees bent, ready to explode off the line", ["On the back heel", "Even on both heels, standing tall", "Leaning on your hands"], "Weight forward lets you get off the line fast.", { core: true }),
      choice(["WR", "TE"], "A defender is pressing you at the line. What helps you get off?", "Quick feet and using your hands to keep his hands off you", ["Running straight into his chest", "Waiting until he backs up", "Holding his jersey"], "Win with your feet first, then clear his hands so he can't jam you.", { core: true, diagram: PRESS }),
      choice(["WR", "TE"], "What is the stem of a route?", "The part before the break, when you push upfield", ["The cut itself", "The catch", "The block after the catch"], "Stem, then break, then finish. The stem sets up the break.", { diagram: STEM_BREAK }),
      choice(["WR", "TE"], "How do you sink your hips at the break?", "Shorten your steps and lower your weight in the last few steps before you cut", ["Lean back and slow to a stop", "Take one big long step", "Jump into the cut"], "Short steps and low hips let you cut sharply without slowing down much.", { core: true }),
      trueFalse(["WR", "TE"], "Every route should start out looking like a deep route, so the defender has to respect it.", true, "If every stem looks the same, the defender can't sit on your break."),
      choice(["WR", "TE", "RB"], "A pass comes at your chest or higher. How do your hands go?", "Thumbs together, making a diamond", ["Pinkies together", "Arms trapping it against your chest", "One hand only"], "High balls: thumbs together. Low balls: pinkies together.", { core: true }),
      choice(["WR", "TE", "RB"], "A pass comes below your waist. How do your hands go?", "Pinkies together", ["Thumbs together", "Palms toward the QB, fingers up", "Behind your back"], "Below the waist, turn your hands so your little fingers are together."),
      trueFalse(["WR", "TE", "RB"], "Catch the ball against your body so it doesn't bounce away.", false, "Catch with your hands away from your body. Balls bounce off pads; hands can squeeze."),
      order(["WR", "TE", "RB"], "Put a catch in order.", ["Find the ball and watch it in", "Catch it with your hands", "Tuck it high and tight", "Turn upfield and run"], "Catch, tuck, then run. Looking upfield too early causes drops."),
      order(["WR", "TE"], "Put the parts of a route in order.", ["Stance", "Release off the line", "Stem upfield", "Break (cut)", "Catch the ball"], "Every route goes stance, release, stem, break, finish."),
      choice(["WR", "TE"], "On a stalk block, what do you do as you get close to the defender?", "Break down: shorten your steps, get balanced and mirror him", ["Sprint full speed and dive at him", "Turn your back to him", "Grab his face mask"], "Coming in out of control lets him slip by. Break down, then punch and stay in front of him."),
      choice(["WR", "TE"], "Which crack block is legal?", "Hitting a linebacker from the front or side, above the waist, with your hands", ["Hitting a safety in the back", "Blocking a linebacker below the waist from the side", "Leading with your helmet"], "Front or side, above the waist, hands, face up. Blocks in the back or below the waist are fouls.", { core: true, diagram: CRACK }),
      trueFalse(["WR", "TE"], "If you see the numbers on the back of the defender you're about to block, don't block him.", true, "Seeing his back numbers means you'd hit him from behind, which is a foul and can hurt him."),
      open(["WR", "TE"], "In your own words: how do you stalk block a cornerback?", "Come off like it's a pass so he backs up. When I get close I break down and get balanced, mirror him, punch with my hands inside on his chest, keep my feet moving and stay between him and the ball carrier.", ["break down / under control", "hands inside on his chest", "stay between him and the ball carrier"], "Under control, hands inside, feet moving, stay in front of him."),
    ],
  },
];
