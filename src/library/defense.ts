/**
 * Football basics: defense. Fronts, run fits, coverage, pressure and keys
 * (concepts), then line, linebacker, DB and tackling technique.
 */
import { choice, lesson, open, order, trueFalse } from "./build";
import { arrow, d, darrow, diagram, front, gapNotes, note, o, oline, proSet, qb, shell, spread, tech, zone, type FrontName } from "./draw";
import type { Diagram, Dot, LibStyle, LibTopic, Zone } from "./types";

// ---------- shared pieces ----------

/** Coaches teach pullers and kick-outs two ways; declared the same in every topic that uses it. */
const PULL_STYLE: LibStyle = {
  key: "pull_response",
  question: "How does your defense play a pulling guard or kick-out block?",
  options: [
    {
      key: "spill",
      label: "Spill (wrong-arm)",
      summary: "Attack the puller with your inside arm and shoulder, get under his block, close the hole and bounce the ball outside to the pursuit.",
    },
    {
      key: "box",
      label: "Box (squeeze)",
      summary: "Take on the puller with your outside arm and shoulder, keep outside leverage, squeeze the hole and turn the ball back inside to the linebackers.",
    },
  ],
};
const SPILL = "pull_response:spill";
const BOX = "pull_response:box";

/** Highlight the players that match. */
const mark = (dots: Dot[], pick: (p: Dot) => boolean): Dot[] => dots.map((p) => (pick(p) ? { ...p, hi: true } : p));

/** A whole defense (front plus secondary) against the matching offense, so every picture has 11 a side. */
function wholeD(name: FrontName, hi: string[] = []): Dot[] {
  const f = front(name, hi);
  switch (name) {
    case "4-2-5":
      return [...spread(), ...f, ...shell("two", { left: -15, right: 14 }, hi), d("NB", -8, 4.5, hi.includes("NB"))];
    case "4-4":
      return [...proSet(), ...f, d("C", -14, 6), d("C", 11, 6), d("FS", 0, 11)];
    case "3-3 Stack":
      return [...proSet(), ...f, d("C", -14, 6), d("C", 11, 6), d("FS", 0, 12), d("SS", 7, 8), d("R", -7, 8)];
    default:
      return [...proSet(), ...f, ...shell("two", undefined, hi)];
  }
}

/** 4-3 Over against the I: an arrow from every box defender to the gap he fits. */
function fits43(hiLabel?: string): Diagram {
  const dots = mark([...proSet(), ...front("4-3 Over"), ...shell("two")], (p) => p.side === "d" && p.label === hiLabel);
  return diagram({
    dots,
    notes: gapNotes("right"),
    lines: [
      darrow("path", [5.2, 0.9], [5.6, 0.1]),
      darrow("path", [2.1, 0.9], [2.25, 0.1]),
      darrow("path", [-0.7, 0.9], [-0.75, 0.1]),
      darrow("path", [-3.6, 0.9], [-3.75, 0.1]),
      darrow("path", [5.5, 4], [3.75, 1.3]),
      darrow("path", [0.5, 4.5], [0.75, 1.3]),
      darrow("path", [-3.2, 4.5], [-2.25, 1.3]),
    ],
  });
}

/**
 * Power to the right: the tackle blocks down, the backside guard pulls to kick
 * out the end. "spill" and "box" show where the ball and the linebacker go.
 */
function kickOut(how: "read" | "spill" | "box", hiLabel = "E"): Diagram {
  const dots = mark(
    [...oline("none"), qb("under"), o("TB", 0, -6), tech("5", "left", "E"), tech("1", "left", "N"), tech("3", "right", "T"), tech("5", "right", "E"), d("W", -2.5, 4.5), d("M", 1, 4.5), d("SS", 8, 7)],
    (p) => p.side === "d" && p.label === hiLabel && (p.label !== "E" || p.x > 0),
  );
  const lines = [arrow("block", [3, -0.8], [2.3, 0.3]), arrow("block", [-1.5, -0.8], [-1.5, -2.2], [2.5, -2.2], [3.4, -0.6])];
  if (how === "read") return diagram({ dots, lines: [...lines, darrow("path", [3.6, 0.9], [3, 0.3])], notes: [note("Puller!", 0.5, -3.2)] });
  if (how === "spill")
    return diagram({
      dots,
      lines: [...lines, darrow("path", [3.6, 0.9], [3.1, -0.3]), arrow("run", [0, -6], [2, -3.6], [5.5, -2], [8, 1]), darrow("path", [1, 4.5], [5, 3.5], [7, 2.4]), darrow("path", [8, 7], [9, 2.5])],
      notes: [note("Spill: ball bounces out", 7, -4.5)],
    });
  return diagram({
    dots,
    lines: [...lines, darrow("path", [3.6, 0.9], [3.9, -0.3]), arrow("run", [0, -6], [1.8, -3.6], [2.6, 0.4]), darrow("path", [1, 4.5], [2.4, 1.8])],
    notes: [note("Box: ball turns back in", 7, -4.5)],
  });
}

/** Nickel defense against a 2x2 spread, with each coverage's drops (and zones if asked). */
function coverPic(cover: 1 | 2 | 3 | 4, withZones = false, hi: string[] = []): Diagram {
  const base = [...spread(), ...front("4-2-5")];
  const h = (l: string) => hi.includes(l);
  if (cover === 1)
    return diagram({
      dots: [...base, d("C", -15, 5, h("C")), d("C", 14, 5, h("C")), d("NB", -8, 4, h("NB")), d("SS", 5, 5, h("SS")), d("FS", 0, 13, h("FS"))],
      lines: [darrow("read", [-15, 5], [-15, -0.8]), darrow("read", [14, 5], [14, -1.8]), darrow("read", [-8, 4], [-8, -1.8]), darrow("read", [5, 5], [4.5, -0.8]), darrow("read", [1.5, 4.5], [1.5, -5])],
      notes: [note("Free safety: deep middle", 0, 16)],
    });
  if (cover === 2) {
    const zones: Zone[] = [zone("Deep 1/2", -12, 22, 12, 5), zone("Deep 1/2", 12, 22, 12, 5), zone("Flat", -20, 5, 5, 4), zone("Curl", -11, 10, 4, 3), zone("Hook", 0, 10, 4, 3), zone("Curl", 11, 10, 4, 3), zone("Flat", 20, 5, 5, 4)];
    return diagram({
      dots: [...base, d("C", -15, 6, h("C")), d("C", 14, 6, h("C")), d("FS", -7, 11, h("FS")), d("SS", 7, 11, h("SS")), d("NB", -8, 4.5, h("NB"))],
      lines: [darrow("path", [-15, 6], [-19, 6]), darrow("path", [-8, 4.5], [-11, 9]), darrow("path", [-1.5, 4.5], [0, 9]), darrow("path", [1.5, 4.5], [10, 9]), darrow("path", [14, 6], [19, 6]), darrow("path", [-7, 11], [-12, 19]), darrow("path", [7, 11], [12, 19])],
      ...(withZones ? { zones } : {}),
    });
  }
  if (cover === 3) {
    const zones: Zone[] = [zone("Deep 1/3", -18, 21, 8, 5), zone("Deep 1/3", 0, 23, 8, 5), zone("Deep 1/3", 18, 21, 8, 5), zone("Curl/flat", -16, 8, 5, 3), zone("Hook", -5, 10, 4, 3), zone("Hook", 5, 10, 4, 3), zone("Curl/flat", 16, 8, 5, 3)];
    return diagram({
      dots: [...base, d("C", -15, 6, h("C")), d("C", 14, 6, h("C")), d("FS", 0, 12, h("FS")), d("SS", 8, 6, h("SS")), d("NB", -8, 4.5, h("NB"))],
      lines: [darrow("path", [-15, 6], [-18, 18]), darrow("path", [0, 12], [0, 20]), darrow("path", [14, 6], [18, 18]), darrow("path", [-8, 4.5], [-15, 8]), darrow("path", [-1.5, 4.5], [-5, 9]), darrow("path", [1.5, 4.5], [5, 9]), darrow("path", [8, 6], [15, 8])],
      ...(withZones ? { zones } : {}),
    });
  }
  const zones: Zone[] = [zone("Deep 1/4", -19, 20, 6, 5), zone("Deep 1/4", -6.5, 21, 6, 5), zone("Deep 1/4", 6.5, 21, 6, 5), zone("Deep 1/4", 19, 20, 6, 5), zone("Curl/flat", -15, 8, 5, 3), zone("Hook", 0, 10, 4, 3), zone("Curl/flat", 14, 8, 5, 3)];
  return diagram({
    dots: [...base, d("C", -15, 7, h("C")), d("C", 14, 7, h("C")), d("FS", -7, 10, h("FS")), d("SS", 7, 10, h("SS")), d("NB", -8, 4.5, h("NB"))],
    lines: [darrow("path", [-15, 7], [-19, 17]), darrow("path", [-7, 10], [-6.5, 18]), darrow("path", [7, 10], [6.5, 18]), darrow("path", [14, 7], [19, 17]), darrow("path", [-8, 4.5], [-15, 8]), darrow("path", [-1.5, 4.5], [0, 9]), darrow("path", [1.5, 4.5], [13, 8])],
    ...(withZones ? { zones } : {}),
  });
}

/** A four-man pass rush on the right side: T-E or E-T twist. */
function twist(kind: "TE" | "ET", hiLabel?: string): Diagram {
  const dots = mark([...oline("none"), qb("gun"), o("RB", 1.5, -5), tech("5", "left", "E"), tech("3", "left", "T"), tech("3", "right", "T"), tech("5", "right", "E")], (p) => p.side === "d" && p.x > 0 && p.label === hiLabel);
  const lines =
    kind === "TE"
      ? [darrow("path", [2.1, 0.9], [3.1, -0.4]), darrow("path", [3.6, 0.9], [3.5, 1.7], [2.3, 1.9], [2.0, -1.4])]
      : [darrow("path", [3.6, 0.9], [2.4, -0.4]), darrow("path", [2.1, 0.9], [2.2, 1.8], [3.6, 1.9], [4.3, -1.4])];
  return diagram({ dots, lines, notes: [note(kind === "TE" ? "T-E: tackle first, end loops" : "E-T: end first, tackle loops", 4, 4)] });
}

/** 4-3 Over zone blitz: the Will blitzes, the weak end drops into a short zone. */
function zoneBlitz(hiLabel?: string): Diagram {
  const dots = mark([...proSet(), ...front("4-3 Over"), ...shell("one")], (p) => p.side === "d" && p.label === hiLabel && (p.label !== "E" || p.x < 0));
  return diagram({
    dots,
    lines: [darrow("path", [-3.2, 4.5], [-2.3, -0.4]), darrow("path", [-3.6, 0.9], [-7, 6]), darrow("path", [-14, 6], [-17, 17]), darrow("path", [0, 12], [0, 20]), darrow("path", [11, 6], [16, 17])],
    notes: [note("Will blitzes", -8, 2.5), note("End drops", -10, 8)],
  });
}

// ---------- the topics ----------

export const DEFENSE: LibTopic[] = [
  // ===================== 1. positions and fronts =====================
  {
    key: "def_positions_fronts",
    version: 1,
    side: "defense",
    category: "concepts",
    name: "Defensive positions and fronts",
    summary: "Who's who on defense, even and odd fronts, the common fronts (4-3, 3-4, 4-2-5, 5-2, 4-4, 3-3 stack) and how a front sets to the offense's strength.",
    level: "youth",
    for: ["DL", "LB", "DB"],
    lessons: [
      lesson(
        "ALL",
        "The three levels of a defense",
        `A defense has three levels, from the ball back:
- Defensive line: the players with a hand on the ground, right on the ball. Ends play on the outside and tackles play inside. A tackle lined up right over the center is called the nose (or nose tackle).
- Linebackers: a few yards off the ball, behind the line. Many teams call them Mike (middle), Sam (strong side, usually the tight end side) and Will (weak side). Names vary from team to team.
- Defensive backs (DBs): corners cover the wide receivers near the sidelines. Safeties play the deepest, in the middle of the field. Many teams have a free safety and a strong safety.

The line stops the run and rushes the passer. Linebackers fill gaps and drop into coverage. DBs cover receivers and are the last line of defense against a long run.`,
        { diagram: diagram({ dots: wholeD("4-3 Over") }) },
      ),
      lesson(
        "ALL",
        "Nickel and dime: more defensive backs",
        `When the offense puts more receivers on the field, the defense often takes out a linebacker and puts in another defensive back.

The fifth DB is called the nickel (a nickel is five cents). He usually lines up across from a slot receiver, the receiver lined up between the wide receiver and the line. He has to cover like a corner and still help against the run like a linebacker.

A sixth DB is called the dime. Teams use dime on long passing downs, like 3rd and 15.`,
        { diagram: diagram({ dots: wholeD("4-2-5", ["NB"]) }) },
      ),
      lesson(
        "ALL",
        "Naming fronts: the numbers, even and odd",
        `The front is how the defensive line and linebackers line up. Fronts are named by numbers: the first number is the down linemen, the second is the linebackers, and a third number (if there is one) is the defensive backs. A 4-3 has 4 linemen and 3 linebackers. A 4-2-5 has 4 linemen, 2 linebackers and 5 DBs.

Coaches also talk about even and odd fronts. People use the words a little differently, but the simple version is:
- Odd front: a nose tackle lines up head-up on the center, usually with three or five down linemen (3-4, 5-2, 3-3 stack).
- Even front: four down linemen and usually nobody head-up on the center (4-3, 4-4, 4-2-5).`,
        { diagram: diagram({ dots: wholeD("3-4", ["N"]) }) },
      ),
      lesson(
        "ALL",
        "Four-man fronts: 4-3 Over and Under, 4-2-5, 4-4",
        `Four-man fronts:
- 4-3 Over: the line shifts toward the offense's strength. The 3-technique tackle lines up on the strong side, the nose shades the center to the weak side, and the Sam plays off the ball near the tight end.
- 4-3 Under: the line shifts away from the strength. The 3-technique goes to the weak side, the nose shades to the strong side, and the Sam walks up onto the line over the tight end.
- 4-2-5: four linemen, two linebackers and five DBs (a nickel). It's built to cover spread offenses with lots of receivers.
- 4-4: four linemen and four linebackers, eight players near the line. It's strong against the run but has only three DBs, so the deep passing game is a worry.`,
        { diagram: diagram({ dots: wholeD("4-3 Under", ["S"]) }) },
      ),
      lesson(
        "ALL",
        "Odd fronts: 3-4, 5-2 and 3-3 stack",
        `Odd fronts put a nose on the center:
- 3-4: three linemen (a nose and two ends, usually over or just outside the offensive tackles) and four linebackers: two outside linebackers who often play on the edge of the line, and two inside linebackers.
- 5-2: five down linemen (a nose, two tackles and two ends) and two linebackers. It puts a lot of big bodies on the line and is popular in youth football against running teams.
- 3-3 stack: three linemen with three linebackers stacked right behind them, plus five DBs (two corners and three safeties; the third safety, marked R in the picture, is often called a rover). The linebackers are hidden behind the linemen, so it's hard for the offense to tell who will blitz and where.`,
        { diagram: diagram({ dots: wholeD("3-3 Stack", ["M", "S", "W"]) }) },
      ),
      lesson(
        "ALL",
        "Setting the front to the strength",
        `Before the snap, the defense decides which side is the offense's strong side and makes a strength call, so everyone knows which way to line up.

Most teams set the strength to the tight end. When there's no tight end, many teams set it to the side with more receivers, or to the wide side of the field (often called the field side). Your coach decides the rule.

Then everyone lines up by the call. In a 4-3 Over, the 3-technique and the Sam go to the strength. In a 4-3 Under, the Sam goes to the strength and the 3-technique goes away from it. If the tight end shifts or motions to the other side, the defense has to re-call the strength and adjust quickly.`,
        { diagram: diagram({ dots: mark(wholeD("4-3 Over"), (p) => p.label === "S" || p.label === "T") }) },
      ),
    ],
    questions: [
      choice("ALL", "On most teams, which linebacker lines up on the strong (tight end) side?", "Sam", ["Will", "Mike", "Nickel"], "Sam is the strong-side linebacker, Will the weak side and Mike the middle.", { core: true }),
      choice("ALL", "Which defensive backs usually line up farthest outside, across from the wide receivers?", "Corners", ["Free safeties", "Inside linebackers", "Defensive tackles"], "Corners cover the wide receivers near the sidelines; safeties play deep in the middle.", { core: true }),
      choice("ALL", "What do the numbers in \"4-3\" stand for?", "4 down linemen and 3 linebackers", ["4 defensive backs and 3 linemen", "4 linebackers and 3 safeties", "4 rushers and 3 players in coverage"], "The first number is the down linemen and the second is the linebackers.", { core: true }),
      choice("ALL", "What is a nickel back?", "A fifth defensive back, usually covering a slot receiver", ["A linebacker who blitzes every play", "The nose tackle in a 3-4", "The safety who lines up deepest"], "The nickel is the fifth DB, brought in when the offense has more receivers."),
      trueFalse("ALL", "In most odd fronts, a nose tackle lines up head-up on the center.", true, "Odd fronts like the 3-4, 5-2 and 3-3 stack put a nose on the center.", { core: true }),
      choice(["DL", "LB", "DB"], "Which front is this?", "3-4", ["4-3 Over", "4-4", "5-2"], "Three down linemen (a nose and two ends) with four linebackers is a 3-4.", { diagram: diagram({ dots: wholeD("3-4") }) }),
      choice(["DL", "LB", "DB"], "Count the down linemen and linebackers. Which front is this?", "4-4", ["4-3 Under", "3-4", "4-2-5"], "Four linemen and four linebackers, with only three DBs, is a 4-4.", { diagram: diagram({ dots: wholeD("4-4") }) }),
      choice(["DL", "LB", "DB"], "Name this front: three linemen with a linebacker right behind each one.", "3-3 stack", ["5-2", "4-3 Over", "4-4"], "Linebackers stacked behind three linemen is the 3-3 stack.", { diagram: diagram({ dots: wholeD("3-3 Stack") }) }),
      choice(["DL", "LB", "DB"], "Which front puts five down linemen and two linebackers on the field?", "5-2", ["3-4", "4-3 Over", "3-3 stack"], "The first number is the down linemen: five of them, with two linebackers."),
      choice(["DL", "LB", "DB"], "In a 4-3 Under, where does the Sam linebacker line up?", "On the line of scrimmage over the tight end", ["Off the ball on the weak side", "Deep in the middle of the field", "Head-up on the center"], "In the Under, the Sam walks up onto the line on the tight end side.", {
        minLevel: "middle_school",
        diagram: diagram({ dots: wholeD("4-3 Under", ["S"]) }),
      }),
      choice(["DL", "LB", "DB"], "In a 4-3 Over, which way does the defensive line shift?", "Toward the strength: the 3-technique lines up on the tight end side", ["Away from the strength: the 3-technique lines up on the weak side", "It doesn't shift; every lineman is head-up", "Always toward the wide side of the field"], "Over means the line shifts over to the strength; Under means it shifts away.", { minLevel: "middle_school" }),
      choice("ALL", "Most teams set the front's strength to which side?", "The tight end side", ["The side the quarterback looks at", "The short side of the field, always", "The side of our sideline"], "The tight end is the most common strength rule; with no tight end, many teams use the side with more receivers or the field side.", { core: true }),
      trueFalse(["DL", "LB", "DB"], "If the tight end motions to the other side, the defense may need to re-call the strength and shift.", true, "The front is set to the strength, so when the strength moves, the front moves with it."),
      choice(["DL", "LB", "DB"], "Why do many teams play a 4-2-5 against spread offenses?", "It puts an extra DB on the field to cover more receivers", ["It puts eight players near the line to stop the run", "It has no linebackers at all", "It blitzes five players on every snap"], "Swapping a linebacker for a nickel gives the defense another player who can cover a slot receiver."),
      order("ALL", "Put the levels of a defense in order, from the line of scrimmage back.", ["Defensive line", "Linebackers", "Safeties"], "Linemen are on the ball, linebackers a few yards off, safeties deepest."),
      open(["DL", "LB", "DB"], "In your own words: what is the difference between an even front and an odd front?", "An odd front puts a nose tackle head-up on the center, usually with three or five down linemen. An even front has four down linemen and usually nobody head-up on the center.", ["odd: a nose head-up on the center", "even: four down linemen, nobody head-up on the center"], "Coaches use the words a little differently, but the nose on the center is the simple test."),
    ],
  },

  // ===================== 2. run fits =====================
  {
    key: "def_run_fits",
    version: 1,
    side: "defense",
    category: "concepts",
    name: "Run fits",
    summary: "How a defense stops the run: a player for every gap, one-gap and two-gap play, force and contain, spill or box, the alley, staying home on the backside, and pursuit.",
    level: "youth",
    for: ["DL", "LB", "DB"],
    styles: [PULL_STYLE],
    lessons: [
      lesson(
        "ALL",
        "Every gap has an owner",
        `A run fit is the plan for which defender fills which gap. Each defender in the box (the area near the ball) owns a gap. When the ball is snapped and you read run, you get to your gap and own it.

The offense wins when it finds a gap with nobody in it. That usually happens because someone left his gap to chase the ball. If every gap is filled, the runner has nowhere to go.

Count the gaps: the offense creates one more gap with every extra blocker. A fullback leading through the hole or a quarterback who can run means the defense needs one more player in the fit, often a safety who comes down.`,
        { diagram: fits43() },
      ),
      lesson(
        "ALL",
        "One-gap and two-gap",
        `In a one-gap defense, each lineman lines up on a blocker's shoulder, attacks his one gap at the snap and stays in it. It's fast and simple, and it's how most youth and high school defenses play.

In a two-gap defense, a lineman lines up head-up on a blocker. He gets his hands inside, locks his arms out to control the blocker, finds the ball, and then sheds to whichever side the runner goes. He's responsible for the gaps on both sides of that blocker.

Two-gapping takes a big, strong lineman and lots of practice. Many defenses mix the two: a two-gap nose tackle with one-gap players around him.`,
        { minLevel: "middle_school" },
      ),
      lesson(
        "ALL",
        "Force, contain and the alley",
        `Every run defense needs someone on the edge.
- Force: on a run to his side, the force player meets the ball and turns it back inside toward his teammates. He keeps his outside arm free and never lets the runner get outside him. By the call, it can be the end, an outside linebacker, a safety or a corner.
- Contain: the same idea against a quarterback who scrambles or runs a bootleg. The contain player stays outside the QB so he can't escape around the edge.

Many teams use force and contain to mean the same job, so listen to how your coach uses them.

The alley is the lane just inside the force player. On an outside run, the alley player (often a safety or linebacker) fills it from the inside out, so the runner can't cut up between the force player and the rest of the defense.`,
        {
          diagram: diagram({
            dots: mark([...proSet(), ...front("4-3 Over"), ...shell("two")], (p) => (p.label === "C" && p.x > 0) || p.label === "SS"),
            lines: [arrow("run", [0, -6.5], [6, -4.5], [10, -1.5]), darrow("path", [11, 6], [10.5, 1.5]), darrow("path", [7, 11], [8, 3])],
            notes: [note("Force", 13, 2), note("Alley", 6.5, 6)],
          }),
        },
      ),
      lesson(
        "ALL",
        "Our way vs pullers and kick-outs: spill",
        `Our defense spills pulling guards and kick-out blocks. Spill means we make the ball bounce outside, where we have help.
- The player the puller is coming for attacks him with his inside arm and shoulder pad, getting under the block. This is often called wrong-arming. Eyes up, head out of the contact.
- He closes the hole by blowing up the block as close to the line as he can, even if he doesn't make the tackle himself.
- The runner has to bounce outside. Our linebackers scrape fast over the top and fit outside the pile, and the force player keeps outside leverage and turns the ball back in.

Spill only works if everyone outside plays fast. If the ball bounces and the force player isn't there, it's a long run.`,
        { style: SPILL, diagram: kickOut("spill") },
      ),
      lesson(
        "ALL",
        "Our way vs pullers and kick-outs: box",
        `Our defense boxes pulling guards and kick-out blocks. Box (also called squeeze) means we keep the ball inside, in front of our linebackers.
- The player the puller is coming for takes him on with his outside arm and shoulder pad and keeps his outside arm free. Eyes up, head out of the contact.
- He pushes the blocker back into the hole to make it smaller, and he never lets the ball get outside him. He is the edge.
- The runner has to cut back inside. Our linebackers fill from the inside out, right on the box player's inside hip, and make the tackle.

Box only works if the box player holds the edge. If he gets kicked out, the ball gets outside and nobody is there.`,
        { style: BOX, diagram: kickOut("box") },
      ),
      lesson(
        "ALL",
        "Backside and pursuit",
        `When the play goes away from you, you still have a job.

The backside end or outside linebacker stays home. He squeezes down the line but doesn't chase until he checks for bootleg, counter and reverse:
- Bootleg: the QB fakes the run one way and keeps it coming your way.
- Counter: the run starts one way, then cuts back your way.
- Reverse: a receiver takes the ball and runs back your way.

The backside linebacker checks the cutback lane before running to the ball.

Everyone else pursues. Run to the ball on an angle that gets ahead of the runner, and stay inside of him so he can't cut back. Don't run to where he is; run to where he's going.`,
      ),
    ],
    questions: [
      choice("ALL", "What does gap responsibility mean?", "Each defender owns a gap and must fill it on a run", ["Each defender covers one receiver", "Defenders wait in their stance until they see the ball", "Only the defensive linemen worry about gaps"], "Every gap needs an owner; the run hits where nobody is.", { core: true }),
      trueFalse("ALL", "If you leave your gap to chase the ball, the run can hit right where you were.", true, "That's how most long runs happen: somebody left his gap.", { core: true }),
      choice(["DL", "LB"], "In this 4-3 Over run fit, which gap does the Will linebacker (highlighted) fill?", "The weak-side B gap", ["The strong-side A gap", "The D gap", "The weak-side C gap"], "In this fit the Will fills between the guard and tackle on the weak side.", { diagram: fits43("W") }),
      choice("ALL", "A fullback leads through the hole. What does that do to the run fit?", "The offense has one more blocker, so the defense needs one more player in the fit", ["Nothing changes", "The linemen should drop into coverage", "Only the nose tackle needs to adjust"], "Every extra blocker creates another gap the defense has to fill, often with a safety.", { minLevel: "middle_school" }),
      choice("ALL", "Who is the force player?", "The defender who turns an outside run back inside", ["The deepest safety who makes the last tackle", "The lineman lined up on the center", "The player who calls the defense"], "The force player sets the edge so the runner can't get outside.", { core: true }),
      trueFalse("ALL", "The force player keeps his outside arm free so the runner can't get around him.", true, "Outside arm free means nothing gets outside him."),
      choice(["LB", "DB"], "What is the alley?", "The lane just inside the force player that a safety or linebacker fills on outside runs", ["The space between the two deep safeties", "The A gap on the backside", "The area behind the corner near the sideline"], "The alley player fills inside the force player, from the inside out.", { minLevel: "middle_school" }),
      choice("DL", "What is a two-gap defensive lineman responsible for?", "Controlling the blocker in front of him and playing the gap on either side", ["Rushing through two gaps at once", "Covering two receivers", "Blitzing through the A gap on every play"], "A two-gapper locks out the blocker, finds the ball and sheds to the side it goes.", { minLevel: "middle_school" }),
      choice(["DL", "LB"], "The run is going away from you and you're the backside end. What must you check before chasing?", "Bootleg, counter and reverse", ["The down and distance", "Whether the punt team is coming on", "A deep pass to the other side"], "The backside end stays home until he's sure the ball isn't coming back his way.", { core: true }),
      order("LB", "On a run away from you, put the backside linebacker's steps in order.", ["Read the play going away", "Check the cutback lane", "Pursue to the ball"], "Check the cutback first; then run to the ball."),
      trueFalse("ALL", "Good pursuit means running straight at where the ball carrier is right now.", false, "Aim ahead of the runner, where he's going, or you'll end up chasing him from behind."),
      choice("ALL", "Our team spills. A guard pulls to kick you out. How do you take him on?", "With your inside arm and shoulder, getting under his block", ["With your outside arm and shoulder, keeping outside leverage", "Run around behind him to the outside", "Stop and wait for him to come to you"], "We wrong-arm the puller, close the hole and make the ball bounce outside.", { style: SPILL, core: true, diagram: kickOut("spill") }),
      choice(["LB", "DB"], "When we spill a kick-out block, where does the ball go, and who makes the play?", "It bounces outside, where the scraping linebackers and the force player make the tackle", ["It cuts back inside to the nose tackle", "It goes straight up the middle to the free safety", "Nowhere: the spill player always makes the tackle alone"], "The spill player closes the hole; the help is outside.", { style: SPILL }),
      choice("ALL", "Our team boxes. A guard pulls to kick you out. How do you take him on?", "With your outside arm and shoulder, keeping your outside arm free", ["With your inside arm and shoulder, getting under his block", "By spinning outside behind him", "By running upfield past him"], "We keep outside leverage, squeeze the hole and turn the ball back inside.", { style: BOX, core: true, diagram: kickOut("box") }),
      choice(["LB", "DB"], "When we box a kick-out block, where does the ball go, and who makes the play?", "Back inside, where the linebackers fill on the box player's inside hip", ["Outside to the corner and the sideline", "Over the top to the deep safety", "Nowhere: the box player always makes the tackle alone"], "The box player holds the edge; the help is inside.", { style: BOX }),
      open(["DL", "LB"], "In your own words: what does it mean to stay home on the backside?", "When the run goes away, the backside player squeezes down the line but doesn't chase until he checks for a bootleg, counter or reverse coming back his way.", ["don't chase right away", "check bootleg, counter, reverse"], "Plays that come back to the backside only work against defenders who left."),
    ],
  },

  // ===================== 3. coverage =====================
  {
    key: "def_coverage",
    version: 1,
    side: "defense",
    category: "concepts",
    name: "Defensive pass coverage",
    summary: "Man and zone, Cover 0 through Cover 4, the zone drops, press and off coverage, and carrying vertical routes.",
    level: "youth",
    for: ["DB", "LB"],
    lessons: [
      lesson(
        "ALL",
        "Man and zone",
        `There are two basic ways to cover receivers.

Man-to-man: you are given one receiver, and you cover him wherever he goes. Your eyes are mostly on him. Man is great at taking away quick, short throws, but if a receiver beats you there may be no one to help.

Zone: you are given an area of the field, and you cover any receiver who comes into it. Your eyes are on the quarterback, so you can break on the ball when he throws. Zone keeps everything in front of the defense, but there are small open spaces between the zones.

Most defenses play both and mix them so the quarterback can't tell which one is coming.`,
      ),
      lesson(
        "ALL",
        "Coverage numbers: Cover 0, 1, 2, 3 and 4",
        `The coverage number usually tells you how many defenders split up the deep part of the field:
- Cover 0: man-to-man with no deep safety. It usually goes with a blitz.
- Cover 1: man-to-man with one free safety deep in the middle to help (often called man-free).
- Cover 2: two safeties each take a deep half of the field; five players cover the short zones underneath.
- Cover 3: three deep defenders (usually the two corners and a safety) each take a deep third; four players cover underneath.
- Cover 4 (often called quarters): four deep defenders (two corners and two safeties) each take a deep quarter; three players cover underneath.

Teams have many versions, like Cover 2 man, but counting the deep defenders is the place to start.`,
        { diagram: coverPic(3, true) },
      ),
      lesson(
        "ALL",
        "Zone drops: where to go",
        `In zone, each player drops to an area. Common zones:
- Flat: the short area near the sideline, about 0 to 5 yards deep.
- Curl: between the hash and the numbers, about 10 to 12 yards deep, where curls and outs are thrown.
- Hook: the middle of the field inside the hashes, about 10 to 12 yards deep.
- Deep third, deep half, deep quarter: the deep part of the field split into three, two or four pieces.

Exact depths and landmarks change from coach to coach. To get there, turn and run (don't backpedal the whole way) with your eyes on the quarterback. When he sets his feet to throw, settle down and get ready to break on the ball.`,
        { minLevel: "middle_school", diagram: coverPic(2, true) },
      ),
      lesson(
        "DB",
        "Press and off coverage",
        `Corners can line up two ways.

Press: the corner lines up right on the receiver, within about a yard. He watches the receiver's hips, stays patient, and jams him with his hands to throw off the timing of the route. Press makes quick throws hard, but if the receiver gets a clean release he can get behind you.

Off: the corner lines up about 5 to 8 yards off the receiver. The space between them is called the cushion. Off coverage lets you see the receiver and the quarterback and keeps everything in front of you, but it gives up short, quick throws.

Many teams mix them, and sometimes a corner shows press and backs off at the snap so the QB can't read the coverage.`,
        { minLevel: "middle_school", diagram: diagram({ dots: [...oline("right"), qb("gun"), o("Z", 14, -1.8), d("C", 14, 0.9, true), o("X", -15, -0.8), d("C", -15, 7)], notes: [note("Press", 14, 3), note("Off", -15, 10)] }) },
      ),
      lesson(
        "ALL",
        "Carrying vertical routes",
        `A zone isn't a spot on the grass. If a receiver runs straight up the field through your zone and nobody is deeper on that side yet, carry him: run with him until a deeper teammate can take him, then go back to your zone or look for the next receiver.

If underneath defenders just stop at their spot, a receiver can run free right between the levels of the defense. For example, in many Cover 2 defenses the middle linebacker runs with a receiver going straight up the middle, because the two safeties are wide. In Cover 3, the curl/flat player often carries the inside receiver up the seam until the deep defender is there.

Talk while you do it, so your teammate knows you're passing the receiver to him.`,
        { minLevel: "middle_school" },
      ),
    ],
    questions: [
      choice("ALL", "What is the difference between man and zone coverage?", "In man you cover one player; in zone you cover an area", ["In man you rush the QB; in zone you cover", "Man is only for corners; zone is only for linebackers", "There is no difference; they're two names for the same thing"], "Man: one receiver wherever he goes. Zone: an area and anyone who comes into it.", { core: true }),
      choice("ALL", "In Cover 3, how many defenders play deep?", "Three", ["Two", "One", "Four"], "Cover 3 splits the deep field into thirds, usually two corners and a safety.", { core: true, diagram: coverPic(3) }),
      choice("ALL", "Which coverage has no deep safety?", "Cover 0", ["Cover 1", "Cover 2", "Cover 4"], "Cover 0 is man with nobody deep, usually with a blitz.", { core: true }),
      choice(["DB", "LB"], "In Cover 2, what does each safety cover?", "A deep half of the field", ["A deep third", "The flat on his side", "The tight end, man-to-man"], "Two safeties split the deep field in half.", { diagram: coverPic(2, false, ["FS", "SS"]) }),
      choice(["DB", "LB"], "In Cover 1, what does the free safety do?", "Plays deep in the middle and helps on any deep route", ["Covers the running back man-to-man", "Blitzes through the A gap", "Covers the short flat"], "Everyone else is in man; the one free safety is the deep help.", { diagram: coverPic(1, false, ["FS"]) }),
      choice(["DB", "LB"], "In Cover 4 (quarters), who are the four deep defenders?", "The two corners and the two safeties", ["The four linebackers", "Two corners, the nickel and the Mike", "The two safeties and the two defensive ends"], "Corners and safeties each take a deep quarter.", { minLevel: "middle_school", diagram: coverPic(4) }),
      choice(["DB", "LB"], "Where is the flat zone?", "The short area near the sideline", ["Deep down the middle", "Between the hashes, about 10 yards deep", "Behind the line of scrimmage"], "The flat is shallow and wide, about 0 to 5 yards deep near the sideline.", { minLevel: "middle_school" }),
      choice(["DB", "LB"], "Where is the hook zone?", "The middle of the field, inside the hashes, about 10 to 12 yards deep", ["Near the sideline, 0 to 5 yards deep", "Deep middle, past 20 yards", "Outside the numbers, deep"], "Hook defenders take away throws over the middle.", { minLevel: "middle_school" }),
      trueFalse(["DB", "LB"], "In most zone coverage, you watch the quarterback while you get to your area.", true, "Eyes on the QB let you see the throw and break on it."),
      trueFalse("DB", "In press coverage, the corner lines up about 8 yards off the receiver.", false, "Press is right on the receiver, within about a yard; 5 to 8 yards off is off coverage.", { minLevel: "middle_school" }),
      choice("DB", "What is one big job of press coverage?", "Jam the receiver to throw off the timing of his route", ["Keep 10 yards of cushion", "Rush the quarterback", "Watch the backfield for the run"], "Press disrupts the release so the quick throw isn't there on time.", { minLevel: "middle_school" }),
      trueFalse(["DB", "LB"], "If a receiver runs straight up the field through your zone and no teammate is deeper on that side, you should carry him.", true, "Run with him until a deeper teammate can take him, or he'll run free between the levels.", { minLevel: "middle_school", core: true }),
      order(["DB", "LB"], "Put these coverages in order from the fewest deep defenders to the most.", ["Cover 0", "Cover 1", "Cover 2", "Cover 3", "Cover 4"], "The number usually tells you how many defenders play deep: 0, 1, 2, 3, 4.", { core: true }),
      open(["DB", "LB"], "In your own words: what does it mean to carry a vertical route in zone?", "When a receiver runs straight up the field through my zone and no one is deeper yet, I run with him until a deeper teammate can take him, then go back to my zone.", ["run with the receiver going deep", "until a deeper teammate takes him"], "Zone defenders who stop at their spot leave a receiver running free between levels.", { minLevel: "middle_school" }),
    ],
  },

  // ===================== 4. pressure =====================
  {
    key: "def_pressure",
    version: 1,
    side: "defense",
    category: "concepts",
    name: "Blitzes and stunts",
    summary: "How a defense brings pressure: blitzes (who comes, who's free, who covers), line stunts and twists, slants, and the zone blitz.",
    level: "middle_school",
    for: ["DL", "LB", "DB"],
    lessons: [
      lesson(
        "ALL",
        "What a blitz is",
        `A blitz sends extra rushers after the quarterback, usually a linebacker or a defensive back along with the linemen. Every blitz answers three questions:
- Who comes? Each blitzer has a gap or a lane to rush through.
- Who's free? If the defense rushes more players than the offense can block, somebody comes free (unblocked). He has to get to the quarterback fast.
- Who covers? Every extra rusher is one less player in coverage. Behind a blitz the defense often plays man-to-man with one deep safety (Cover 1) or with nobody deep (Cover 0).

Offenses answer a blitz with a quick throw to the receiver the blitzer left open, often called a hot throw. That's why the coverage behind a blitz has to be tight.`,
      ),
      lesson(
        "ALL",
        "Blitz rules for everyone",
        `- Disguise it: don't creep up early and tip off the blitz. Get to your spot at the right time.
- Time it: start moving on the snap, not before. Being offside wastes the blitz.
- Hit your gap fast and stay in your rush lane. If you leave your lane, the quarterback can escape through it.
- If a back steps up to block you, take him on with your hands and shoulder, head out of the contact, and keep working to the QB. Don't run around behind him.
- Coverage players: in Cover 0 there is no help, so stay tight to your man and don't let him get behind you.
- Everyone: if the ball comes out quickly, the coverage has to make the tackle right away.`,
      ),
      lesson(
        "DL",
        "Stunts and twists",
        `A stunt is when defensive linemen trade gaps after the snap to confuse the blockers. In a twist, one player goes first (often called the penetrator) and the other loops around behind him. The first letter tells you who goes first:
- T-E: the tackle goes first, crashing hard outside into the offensive tackle. The end loops around behind him into the inside gap.
- E-T: the end goes first, crashing inside. The tackle loops around him to the outside.

The first player's job is to hit his blocker hard and drag him along, so a gap opens for the looper. The looper must be patient: a short step, then a tight wrap.

A slant (also called an angle) is a simpler stunt: at the snap, a lineman steps across into the next gap over. When the whole line does it together, it's a line slant.`,
        { diagram: twist("TE") },
      ),
      lesson(
        "ALL",
        "The zone blitz",
        `A zone blitz sends a linebacker or defensive back after the quarterback and drops a defensive lineman back into a short zone.

The defense usually still rushes four or five and plays zone behind it, often three deep and three underneath (many teams call that a fire zone).

Why it works: the offense blocks the players it thinks are rushing, so the surprise rusher can come free. And the quarterback's quick throw might go right to the lineman who dropped.

Dropping linemen: at the snap, turn and get to your zone (often a short hook or curl area), find the quarterback, and break on the ball. You don't have to cover deep; take away the quick throw.`,
        { diagram: zoneBlitz() },
      ),
    ],
    questions: [
      choice("ALL", "A blitz brings extra rushers. What does that usually mean for the coverage behind it?", "Fewer players in coverage, often man with little or no deep help", ["More players in coverage than normal", "The defense plays three deep and five underneath", "Nothing changes in the coverage"], "Every extra rusher is one less player in coverage.", { core: true }),
      choice("ALL", "The offense has six blockers and the defense rushes seven. What should happen?", "One rusher comes free", ["The offense gets a penalty", "Every rusher gets blocked", "The quarterback gets extra time"], "Seven rushers against six blockers leaves one unblocked.", { core: true }),
      trueFalse(["LB", "DB"], "In Cover 0 there is no deep safety to help, so defenders in coverage must stay tight to their man.", true, "With nobody deep, any receiver who gets behind his defender is gone.", { core: true }),
      choice("ALL", "What is a hot throw?", "A quick pass to the receiver the blitz left open", ["A deep pass after a play-action fake", "A pass behind the line on every play", "A run play aimed at the blitzer's gap"], "Offenses beat the blitz by throwing quickly to the spot the blitzer left."),
      choice("DL", "In a T-E twist, who goes first?", "The tackle crashes outside first and the end loops behind him", ["The end crashes inside first and the tackle loops outside", "Both go straight ahead at the same time", "The linebacker goes first"], "The first letter goes first: T-E means tackle, then end.", { core: true, diagram: twist("TE", "T") }),
      choice("DL", "In an E-T stunt, what does the tackle do?", "Loops around the end to the outside", ["Crashes inside first", "Drops into coverage", "Stays head-up and two-gaps"], "In E-T the end goes first, inside, and the tackle loops around him.", { diagram: twist("ET", "T") }),
      choice("DL", "What is the first player's job in a twist?", "Hit his blocker hard and drag him along to open a gap for the looper", ["Stop at the line and wait for the looper", "Drop into the flat", "Run around both blockers to the outside"], "If the penetrator doesn't take his blocker with him, the looper runs into a wall."),
      trueFalse("DL", "The looper in a twist should sprint straight upfield as fast as he can at the snap.", false, "The looper is patient: a short step, then a tight loop behind the penetrator."),
      choice("DL", "What is a slant (or angle)?", "At the snap, a lineman steps across into the next gap over", ["A lineman drops into coverage", "Two linemen trade gaps with a loop", "A blitz by the corner"], "A slant moves a lineman one gap over at the snap."),
      choice("ALL", "What makes a zone blitz different from a regular blitz?", "A defensive lineman drops into a zone while a linebacker or DB rushes", ["Everyone plays man with no safety", "Only the defensive line rushes", "It's only called on fourth down"], "The surprise rusher comes from the second or third level, and a lineman takes his place in coverage.", { core: true }),
      choice(["DL", "LB"], "In this zone blitz, what does the highlighted end do?", "Drops into a short zone", ["Rushes outside the tackle", "Covers a deep third", "Blitzes through the A gap"], "The Will blitzes and the end drops into his short zone.", { diagram: zoneBlitz("E") }),
      order("DL", "Put the T-E twist in order.", ["The ball is snapped", "The tackle crashes hard outside", "The end loops tight behind him", "The end rushes through the inside gap"], "The tackle goes first and takes the blocker; the end loops into the gap he opened."),
      trueFalse("ALL", "When you blitz, stay in your rush lane so the quarterback can't escape through it.", true, "A blitzer who leaves his lane gives the QB a running lane."),
      open(["DL", "LB"], "In your own words: why does a zone blitz drop a lineman into coverage?", "So the defense can send a surprise rusher and still have enough players in coverage. The offense blocks the wrong players, and the quick throw may go right to the lineman who dropped.", ["a surprise rusher comes from somewhere else", "still enough players in coverage"], "Zone blitzes confuse the blocking without giving up the coverage."),
    ],
  },

  // ===================== 5. keys and reads =====================
  {
    key: "def_keys_reads",
    version: 1,
    side: "defense",
    category: "concepts",
    name: "Keys and reads on defense",
    summary: "What linebackers and DBs look at to tell run from pass: guard keys, backfield flow, the triangle, the end man on the line, and eye discipline against play-action.",
    level: "middle_school",
    for: ["LB", "DB"],
    lessons: [
      lesson(
        "ALL",
        "What a key is",
        `A key is the player you watch right after the snap to tell you what the play is. "Read your key" means your eyes go to that player first, and your feet go where he tells you.

Offensive linemen give the play away first. On a run they fire off the ball with their pads low (often called a low hat). On a pass they step back with their heads and hands up (a high hat), because linemen can't run downfield on a pass.

Backs and the quarterback can fake. Linemen usually can't fake as well. That's why so many keys start with a lineman.`,
      ),
      lesson(
        "LB",
        "Linebacker keys: guards, flow and the triangle",
        `Most linebackers key a guard, the backs, or both. Your coach tells you which.
- Guard key: if the guard fires out at you or blocks down inside, it's a run: fill. If he pulls, go with him; he's leading you to the play. If he steps back with a high hat, think pass and get to your drop or your man.
- Backfield flow: the direction the running backs go at the snap. Flow toward you: get to your gap fast. Flow away: check the cutback lane, then pursue.
- The triangle: many coaches teach you to see the near guard and the backs (and sometimes the quarterback) as one picture, so you see the block and the flow at the same time.

Trust your key over a fake. The backs can lie; the guard usually tells the truth.`,
        {
          diagram: diagram({
            dots: mark([...proSet(), ...front("4-3 Over"), ...shell("two")], (p) => p.label === "M"),
            lines: [arrow("block", [1.5, -0.8], [1.2, -1.9], [-4, -1.9], [-4.6, -0.4]), darrow("read", [0.5, 4.5], [1.5, -0.4]), darrow("path", [0.5, 4.5], [-3.5, 3.2])],
            notes: [note("Guard pulls: go with him", -7, -3.5)],
          }),
        },
      ),
      lesson(
        "DB",
        "DB keys: run or pass",
        `Safeties and corners decide run or pass by watching the end man on the line: the last offensive player on the line on that side, usually the tight end or the tackle.
- If he blocks (fires out low), think run and come up to your run fit.
- If he pass sets (steps back, high hat) or runs a route, think pass and play your coverage.

Corners also watch their receiver. If he comes off the ball to block you or jogs, it's probably a run. If he runs hard off the ball, it's probably a pass.

Pass first: a DB who comes up for the run on a pass gives up a touchdown. Be sure before you come up.`,
        {
          diagram: diagram({
            dots: mark([...proSet(), ...front("4-3 Over"), ...shell("two")], (p) => p.label === "SS"),
            lines: [arrow("block", [4.5, -0.8], [3.9, 0.4]), darrow("read", [7, 11], [4.6, -0.3])],
            notes: [note("Tight end blocks: run", 10, -3)],
          }),
        },
      ),
      lesson(
        "ALL",
        "Play-action and eye discipline",
        `Play-action is a run fake followed by a pass. It works on defenders whose eyes are in the wrong place: a linebacker staring at the running back, or a safety watching the quarterback's fake.

Eye discipline means looking at your key, not at the ball. If your key tells you pass (linemen with high hats, receivers running hard off the ball), ignore the fake and get to your coverage.

On a bootleg, the quarterback fakes one way and rolls out the other. The backside end and linebackers must check for him instead of chasing the fake.

Bad eyes give up big plays. Good eyes see a fake for what it is.`,
      ),
    ],
    questions: [
      choice(["LB", "DB"], "What is a key?", "The player you watch first to tell you what the play is", ["The defensive play call", "Always the ball carrier", "The coach's hand signal"], "Your key is the first thing your eyes go to after the snap.", { core: true }),
      choice("LB", "Your guard key pulls across the formation. What does that usually tell you?", "The play is going where he's going, so go with him", ["It's a pass, so drop", "The play is coming straight at you", "It's a fake, so stay put"], "A pulling guard is leading you to the play.", {
        diagram: diagram({ dots: mark([...proSet(), ...front("4-3 Over")], (p) => p.label === "M"), lines: [arrow("block", [1.5, -0.8], [1.2, -1.9], [-4, -1.9], [-4.6, -0.4]), darrow("read", [0.5, 4.5], [1.5, -0.4])] }),
      }),
      choice("LB", "Your guard steps back with his hands up and his head high. What does that tell you?", "Pass: get to your drop or your man", ["Run right at you: fill your gap", "He's pulling: go with him", "Screen: rush the quarterback"], "A high hat means pass; linemen can't run downfield on a pass.", { core: true }),
      choice("LB", "What is backfield flow?", "The direction the running backs go at the snap", ["How fast the quarterback throws", "Where the offensive line lines up", "The path of a deep pass"], "Flow tells you which way the play is going."),
      trueFalse("LB", "When backfield flow goes away from you, the backside linebacker should check the cutback lane before pursuing.", true, "Cutbacks hit backside linebackers who run too fast."),
      choice("LB", "Many coaches teach a triangle read. What are you looking at?", "The near guard and the backs (and sometimes the QB) as one picture", ["The two corners and the free safety", "The ball, the goalpost and the sideline", "Only the quarterback's eyes"], "Seeing the guard and the backs together shows you the block and the flow at once."),
      choice("DB", "What is the end man on the line?", "The last offensive player on the line on that side, usually the tight end or tackle", ["The wide receiver lined up farthest out", "The center", "The deepest running back"], "DBs read him for run or pass.", { core: true }),
      choice("DB", "You're a safety keying the tight end. He fires out low and blocks. What do you think?", "Run: come up to your run fit", ["Pass: bail deep", "Screen: rush the quarterback", "Punt: get back to return it"], "A low hat from the end man on the line means run.", {
        diagram: diagram({ dots: mark([...proSet(), ...front("4-3 Over"), ...shell("two")], (p) => p.label === "SS"), lines: [arrow("block", [4.5, -0.8], [3.9, 0.4]), darrow("read", [7, 11], [4.6, -0.3])] }),
      }),
      trueFalse("DB", "A DB should come up for the run as soon as he sees the quarterback hand off, even if the end man on the line is pass setting.", false, "The handoff can be a fake; trust the end man's high hat and play pass."),
      choice(["LB", "DB"], "What is play-action?", "A run fake followed by a pass", ["A pass caught behind the line", "A run after a fake pass", "A quick pass to the flat"], "Play-action fakes the run to pull defenders up, then throws behind them."),
      choice(["LB", "DB"], "Why does play-action work?", "Defenders look at the fake instead of their key", ["Linemen are allowed to go downfield on play-action", "The defense can't see the ball", "The quarterback gets extra time by rule"], "Eyes on the backfield get fooled; eyes on your key don't.", { core: true }),
      order("DB", "Put a safety's run/pass read in order.", ["See the end man on the line", "Decide run or pass", "Go to your run fit or your coverage"], "Read the key, decide, then go."),
      open(["LB", "DB"], "In your own words: what is eye discipline, and why does it matter?", "Eye discipline means looking at my key, not at the ball or the fake. It matters because fakes like play-action only work on defenders who look in the wrong place.", ["look at your key, not the ball", "so fakes don't fool you"], "Where your eyes go, your feet go."),
    ],
  },

  // ===================== 6. DL technique =====================
  {
    key: "def_dl_technique",
    version: 1,
    side: "defense",
    category: "technique",
    name: "Defensive line technique",
    summary: "Stance, get-off and hands for defensive linemen; beating base, reach, down, double-team and pulling or kick-out blocks; and pass rush basics.",
    level: "youth",
    for: ["DL"],
    styles: [PULL_STYLE],
    lessons: [
      lesson(
        "DL",
        "Stance and get-off",
        `Stance: feet about shoulder width with a small stagger (most teams put the outside hand down and the outside foot back a little), weight forward on your hand, back flat, eyes up on your key. Some teams have inside players use a four-point stance with both hands down.

Get-off: move on the ball, not the count. Watch the ball (or the blocker's hand, if your coach teaches that) and explode on the first movement. Your first step is short and quick, and you stay low.

The lineman who moves first and gets lowest usually wins.`,
      ),
      lesson(
        "DL",
        "Hands inside: win the block",
        `You take on blocks with your hands and your pads, never your head.
- Shoot your hands inside, onto the blocker's chest plate, thumbs up and elbows in.
- Keep your pads lower than his and your eyes up.
- Lock your arms out to separate from him, so he can't grab you or get into your body.
- Find the ball.
- Shed: rip or push his shoulder aside and get to your gap or the ball carrier.

Whoever gets his hands inside first usually controls the block. If his hands are inside yours, knock them off and reset.`,
      ),
      lesson(
        "DL",
        "Block reactions: base, reach, down and double",
        `Read the blocker in front of you, and react:
- Base (drive) block: he comes straight at you. Hands inside, lock out, hold your ground, find the ball and shed to it.
- Reach block: he steps to get outside of you and cut you off from your gap. Press his outside shoulder and work flat down the line to keep your gap. Don't run around him upfield.
- Down block: he leaves you to block inside. Close down hard right behind him, hip to hip, and get your eyes inside: a pulling guard or kick-out block is often coming.
- Double team: two blockers on you. Sink your hips, widen your base and fight to hold your spot. Don't get moved, and don't spin out. If you hold, the linebackers are free to make the tackle.`,
        { diagram: kickOut("read") },
      ),
      lesson(
        "DL",
        "Our way vs a puller or kick-out: spill",
        `When the tackle in front of you blocks down and a guard pulls at you, our team spills (wrong-arms) it.
- Close down inside right away so the hole stays small.
- Attack the puller with your inside arm and shoulder pad, getting under his block. Eyes up, head out of the contact.
- Hit him as close to the line of scrimmage as you can and make a pile. Don't let him kick you out.
- The ball should bounce outside. Our linebackers are scraping over the top and the force player is outside to make the tackle.

Your job was to close the hole. If the runner tries to squeeze back inside, get off the block and tackle him. The same rule works when a guard pulls to trap a defensive tackle.`,
        { style: SPILL, diagram: kickOut("spill") },
      ),
      lesson(
        "DL",
        "Our way vs a puller or kick-out: box",
        `When the tackle in front of you blocks down and a guard pulls at you, our team boxes (squeezes) it.
- Close down inside, then take on the puller with your outside arm and shoulder pad. Keep your outside arm free. Eyes up, head out of the contact.
- Push the blocker back into the hole to squeeze it smaller.
- Never let the ball get outside you. You are the edge.
- The ball should cut back inside, where our linebackers are filling right on your inside hip.

If the runner tries to bounce outside, shed the block and make the tackle. Getting kicked out is the one thing you can't let happen.`,
        { style: BOX, diagram: kickOut("box") },
      ),
      lesson(
        "DL",
        "Pass rush basics",
        `When you read pass (the blocker steps back with his head up), rush.
- Get-off: the first step wins. Get upfield before the blocker sets.
- Rush lanes: each rusher has a lane. Stay in it so the quarterback has no hole to step up or run through.
- Contain: the ends (or whoever has contain) rush outside the quarterback and never let him escape around the edge.

Moves:
- Bull rush: hands inside on his chest, drive him straight back into the quarterback.
- Rip: dip your shoulder past his hip and swing your inside arm up under his arm, like an uppercut.
- Swim: knock his hands down with one hand and bring your other arm over his shoulder. Do it fast; it leaves your chest open.
- Long-arm: lock one arm into his chest, push him back, then shed and go.

When the quarterback throws, get your hands up.`,
      ),
    ],
    questions: [
      choice("DL", "When should a defensive lineman move at the snap?", "On the first movement of the ball (or his key)", ["When the quarterback finishes the cadence", "After the blocker moves first", "When the linebacker yells go"], "Move on the ball, not the count; the first one off the ball usually wins.", { core: true }),
      choice("DL", "Where should your hands go when you take on a blocker?", "Inside, on his chest plate, thumbs up", ["Outside, on his shoulder pads", "On top of his shoulders to push down", "Down by his knees"], "Hands inside control the blocker; hands outside let him into your body.", { core: true }),
      trueFalse("DL", "A defensive lineman should make first contact with the top of his helmet.", false, "Never. Contact with your hands and pads, eyes up, head out of the contact.", { core: true }),
      choice("DL", "The blocker steps outside to reach you. What do you do?", "Press his outside shoulder and work flat down the line to keep your gap", ["Run upfield around his back", "Give up your gap and go inside", "Stop and wait for the ball"], "Running around a reach block opens the gap you're supposed to own.", {
        diagram: diagram({ dots: [...oline("none"), qb("under"), tech("3", "right", "T"), tech("5", "right", "E", true)], lines: [arrow("block", [3, -0.8], [4.3, 0.1]), darrow("path", [3.6, 0.9], [4.8, 0.4])], notes: [note("Reach", 6, -2)] }),
      }),
      choice("DL", "The tackle in front of you blocks down inside. What do you do?", "Close down hard behind him and look for a puller", ["Rush straight upfield at the quarterback", "Chase the tackle inside", "Drop into coverage"], "A down block usually means a puller or kick-out is coming at you.", { core: true, diagram: kickOut("read") }),
      choice("DL", "Two blockers double-team you. What is your job?", "Sink your hips and hold your ground so you don't get moved", ["Spin out of it right away", "Back up to get away from them", "Run around both of them to the outside"], "Holding a double team keeps the linebackers free.", {
        diagram: diagram({ dots: [...oline("none"), qb("under"), tech("3", "right", "T", true), tech("5", "right", "E")], lines: [arrow("block", [1.5, -0.8], [1.9, 0.3]), arrow("block", [3, -0.8], [2.4, 0.3])], notes: [note("Double team", 0, 3)] }),
      }),
      order("DL", "Put the down-block reaction in order.", ["See the tackle block down", "Close down hip to hip behind him", "Get your eyes inside for a puller", "Take on the puller our way"], "Close the gap first, then find the puller."),
      choice("DL", "What is a base (drive) block?", "The blocker comes straight at you to move you off the ball", ["The blocker steps outside to cut you off", "The blocker leaves you to block someone inside", "Two blockers block you at once"], "Base is straight ahead; reach is outside; down is inside; a double is two blockers.", { minLevel: "middle_school" }),
      choice("DL", "Our team spills. The tackle blocks down and a guard pulls at you to kick you out. How do you take him on?", "With your inside arm and shoulder, under his block", ["With your outside arm and shoulder, keeping outside leverage", "Run upfield and around him", "Wait at the line for him to hit you"], "We wrong-arm the puller and close the hole; the ball bounces out to our help.", { style: SPILL, core: true, diagram: kickOut("spill") }),
      trueFalse("DL", "When we spill, it's okay if the ball bounces outside, because our linebackers and force player are there.", true, "That's the plan: close the hole, bounce the ball to the help outside.", { style: SPILL }),
      choice("DL", "Our team boxes. The tackle blocks down and a guard pulls at you to kick you out. How do you take him on?", "With your outside arm and shoulder, keeping your outside arm free", ["With your inside arm and shoulder, under his block", "By spinning inside behind him", "By running upfield past him"], "We keep the edge, squeeze the hole and turn the ball back to the linebackers.", { style: BOX, core: true, diagram: kickOut("box") }),
      trueFalse("DL", "When we box, you must never let the ball get outside you.", true, "The box player is the edge; the linebackers are filling inside him.", { style: BOX }),
      choice("DL", "Which pass rush move means driving the blocker straight back with your hands on his chest?", "Bull rush", ["Swim", "Rip", "Spin"], "The bull rush is pure power: hands inside, drive him into the quarterback."),
      choice("DL", "What is a defensive end's main job on a contain rush?", "Rush outside the quarterback and keep him from escaping around the edge", ["Rush through the A gap", "Drop into the flat", "Watch the running back and never rush"], "Contain keeps the QB in the pocket where the other rushers can get him."),
      trueFalse("DL", "In a rip move, you swing your inside arm up under the blocker's arm, like an uppercut, as you dip past him.", true, "The rip gets the blocker's hands off you as you turn the corner.", { minLevel: "middle_school" }),
      open("DL", "In your own words: why does staying in your rush lane matter?", "If every rusher stays in his lane, the quarterback has no hole to step up into or run through. If I leave my lane, he can escape through it.", ["leaves no hole for the QB", "leaving it lets the QB escape"], "A pass rush is a team job: lanes keep the QB trapped."),
    ],
  },

  // ===================== 7. LB technique =====================
  {
    key: "def_lb_technique",
    version: 1,
    side: "defense",
    category: "technique",
    name: "Linebacker technique",
    summary: "Linebacker stance, read steps, fill, scrape and fast flow, taking on lead blockers and pullers, zone drops and man coverage on backs and tight ends.",
    level: "youth",
    for: ["LB"],
    styles: [PULL_STYLE],
    lessons: [
      lesson(
        "LB",
        "Stance and read step",
        `Stance: feet about shoulder width, knees bent, weight on the balls of your feet, hands ready in front of you, back flat and eyes on your key. Most linebackers line up about 4 to 5 yards off the ball; your coach will set your depth.

Read step: at the snap, take one short, quick step (many coaches call it a read step or pop step) while your eyes read your key. Don't take a big step forward or backward. A short step keeps you balanced so you can go any direction.

Then go: fill, scrape or flow, depending on what your key tells you.`,
      ),
      lesson(
        "LB",
        "Fill, scrape and fast flow",
        `How you get to the ball depends on where it's going:
- Fill: the run is coming right at your gap. Attack downhill and meet it at the line of scrimmage, square to the line.
- Scrape: the run is going a gap or two outside you. Shuffle or run sideways right behind your defensive linemen, then fit in your outside gap. Stay square and close to the line.
- Fast flow: the backs go wide fast, like a toss or sweep. Turn and run to beat the ball to the edge, staying inside-out: keep your body on the runner's inside hip so he can't cut back inside you.

If the ball is going away from you, check the cutback lane before you pursue.`,
        {
          diagram: diagram({
            dots: mark([...proSet(), ...front("4-3 Over")], (p) => p.label === "M"),
            lines: [arrow("run", [0, -6.5], [2.5, -3], [3.75, -0.3]), darrow("path", [0.5, 4.5], [2, 3.4], [3.75, 2])],
            notes: [note("Scrape", 4, 6)],
          }),
        },
      ),
      lesson(
        "LB",
        "Taking on blocks",
        `Linemen, fullbacks and pulling guards will all try to block you. Beat the block before it beats you.
- Attack: meet the blocker as close to the line of scrimmage as you can. If you wait, he picks the spot.
- Hands and pads: shoot your hands into his chest, keep your pads low and your eyes up. Your head is never the point of contact.
- Shed: lock out, find the ball, then rip or push him aside and get to the runner.
- Leverage: which arm you keep free tells your teammates where the ball will go. Our team's rule is in the next lesson.

A linebacker who gets blocked and stays blocked leaves a gap open. Get off blocks.`,
      ),
      lesson(
        "LB",
        "Our way vs lead blockers and pullers: spill",
        `Our team spills. When a fullback or a pulling guard comes at you in the hole:
- Attack him downhill with your inside arm and shoulder pad (wrong-arm), getting under his block. Eyes up, head out of the contact.
- Blow him up as close to the line as you can and close the hole, even if you don't make the tackle.
- The ball bounces outside, where teammates are scraping over the top and the force player keeps outside leverage.

When a teammate spills the block and you're the other linebacker, scrape fast over the top and fit outside the pile. That's where the ball is coming. Don't come underneath the pile; the spill player has that.`,
        { style: SPILL, diagram: kickOut("spill", "M") },
      ),
      lesson(
        "LB",
        "Our way vs lead blockers and pullers: box",
        `Our team boxes (squeezes).
- When the end or outside linebacker squeezes a puller, fit right on his inside hip. The ball will be turned back inside to you, so fill fast and fill tight.
- When a fullback or a pulling guard comes at you in the hole, take him on with your outside arm and shoulder pad and keep your outside arm free. Eyes up, head out of the contact. Push him back into the hole.
- The ball should go back inside, to the next linebacker or the backside pursuit. Never let it get outside you.

Fill tight: if there's space between you and the squeeze player, the runner will find it.`,
        { style: BOX, diagram: kickOut("box", "M") },
      ),
      lesson(
        "LB",
        "Pass drops and man coverage",
        `Zone drop: when you read pass, open your hips and run to your landmark (often the hook or curl area, about 10 to 12 yards deep) with your eyes on the quarterback. Feel receivers crossing into your area. When the quarterback sets his feet, settle and get ready to break on the ball.

Man on a back or tight end: line up with inside leverage, a little inside of him. Watch his hips, not his head, because hips don't fake. Stay on him wherever he goes.

If your man stays in to block, some teams let you add to the rush (often called a hug or green dog). Only do it if your coach teaches it.`,
      ),
    ],
    questions: [
      choice("LB", "What is a linebacker's read step?", "A short, quick step at the snap while his eyes read his key", ["A big step backward to get depth", "A jump to see over the line", "Standing still until the handoff"], "A short step keeps you balanced while you read.", { core: true }),
      trueFalse("LB", "A linebacker's first step should be a long step forward on every play.", false, "A big step forward makes you easy to fool on play-action and cutbacks; take a short read step."),
      choice("LB", "The run is coming right at your gap. What do you do?", "Fill: attack downhill and meet it at the line", ["Scrape outside", "Drop to your zone", "Wait for the runner to come to you"], "Downhill linebackers meet the runner at the line, not past it.", { core: true }),
      choice("LB", "What does it mean to scrape?", "Move sideways right behind your linemen and fit in an outside gap", ["Attack straight downhill into the A gap", "Drop back into the hook zone", "Run around the outside of the end"], "Scraping keeps you tight behind the line on runs a gap or two outside.", {
        diagram: diagram({ dots: mark([...proSet(), ...front("4-3 Over")], (p) => p.label === "M"), lines: [arrow("run", [0, -6.5], [2.5, -3], [3.75, -0.3]), darrow("path", [0.5, 4.5], [2, 3.4], [3.75, 2])] }),
      }),
      choice("LB", "On a fast toss to your side, how do you stay inside-out?", "Keep your body on the runner's inside hip so he can't cut back inside you", ["Get outside the runner and push him back inside", "Run straight at the quarterback", "Stop at the line and let the end make the play"], "Inside-out pursuit takes away the cutback."),
      choice("LB", "What should make first contact on a lead blocker?", "Your hands and shoulder pad, with your eyes up", ["The top of your helmet", "Your facemask, with your eyes down", "Your hip, turning sideways"], "Your head is never the point of contact.", { core: true }),
      trueFalse("LB", "It's better to meet a lead blocker close to the line of scrimmage than to wait for him in the hole.", true, "If you wait, he picks the spot and the hole gets bigger."),
      choice("LB", "Our team spills. A fullback leads into your hole. How do you take him on?", "With your inside arm and shoulder, under his block, to bounce the ball outside", ["With your outside arm and shoulder, keeping the ball inside", "Turn sideways and let him go by", "Back up and wait for the runner"], "We wrong-arm the lead blocker and send the ball outside to our help.", { style: SPILL, core: true, diagram: kickOut("spill", "M") }),
      choice("LB", "Our team spills. Your teammate wrong-arms the puller. Where do you go?", "Scrape fast over the top and fit outside the pile", ["Fill underneath the pile on the inside", "Drop into the hook zone", "Stay where you are and wait"], "The spill sends the ball outside, so that's where you need to be.", { style: SPILL }),
      choice("LB", "Our team boxes. A fullback leads into your hole. How do you take him on?", "With your outside arm and shoulder, keeping your outside arm free", ["With your inside arm and shoulder, under his block", "Turn sideways and let him go by", "Back up and wait for the runner"], "We keep the ball inside and in front of our pursuit.", { style: BOX, core: true, diagram: kickOut("box", "M") }),
      choice("LB", "Our team boxes. The end squeezes a kick-out block. Where do you fit?", "Right on the end's inside hip, because the ball will cut back inside", ["Outside the end, near the sideline", "Deep in the middle of the field", "On the other side of the formation"], "The box player turns the ball in; you're waiting for it there.", { style: BOX }),
      choice("LB", "In a zone drop, where should your eyes be while you get to your landmark?", "On the quarterback", ["On the ground in front of you", "On the deepest receiver only", "On the sideline"], "Eyes on the QB let you break on the throw."),
      choice("LB", "You have a running back in man coverage. What should you watch?", "His hips", ["His eyes", "The quarterback's helmet", "The deep safety"], "Hips don't fake; heads and eyes do."),
      order("LB", "Put a linebacker's actions on a run in order.", ["Take your read step", "Find the ball and fill, scrape or flow", "Take on and shed the blocker", "Make the tackle"], "Read, go, beat the block, tackle."),
      open("LB", "In your own words: what is the difference between filling and scraping?", "Filling is attacking straight downhill into a gap when the run is coming at me. Scraping is moving sideways behind my linemen to fit an outside gap when the run goes a gap or two outside.", ["fill: downhill into your gap", "scrape: sideways behind the line to an outside gap"], "Both get you to the line; the direction is what changes."),
    ],
  },

  // ===================== 8. DB technique =====================
  {
    key: "def_db_technique",
    version: 1,
    side: "defense",
    category: "technique",
    name: "Defensive back technique",
    summary: "Stance, backpedal and break, press and off coverage, leverage, playing the ball, run support and communication for corners and safeties.",
    level: "youth",
    for: ["DB"],
    lessons: [
      lesson(
        "DB",
        "Stance, backpedal and break",
        `Stance: feet about shoulder width, one foot slightly ahead (usually the inside foot for corners), knees bent, weight on the front foot, chest over your toes and eyes on your key.

Backpedal: stay low, push off your front foot, keep your shoulders over your toes and your arms pumping. Take short, quick steps, and never let your weight drift back onto your heels.

Break: when the receiver cuts or the ball is thrown, plant your foot under you, drop your hips and drive toward the ball. The fewer steps it takes you to change direction, the closer you'll be when the ball gets there.`,
      ),
      lesson(
        "DB",
        "Press, off and bail",
        `Press: line up close, within about a yard. Stay square and patient: watch his hips, mirror his feet and don't lunge. Jam him with your hands to throw off his release, then get on his hip and run with him. Hands off once the ball is in the air, and never grab and hold.

Off: line up about 5 to 8 yards off. Keep your cushion (the space between you and him) so he can't get behind you. Read his route and the quarterback, and break on short throws.

Bail: show press or a short alignment, then at the snap open up, turn and run to your deep zone. It's common in Cover 3 and hides the coverage from the quarterback.`,
        { minLevel: "middle_school", diagram: diagram({ dots: [...oline("right"), qb("gun"), o("Z", 14, -1.8), d("C", 14, 0.9, true)], lines: [darrow("path", [14, 0.9], [15, 4], [16, 12])], notes: [note("Press, then run with him", 10, 6)] }) },
      ),
      lesson(
        "DB",
        "Leverage",
        `Leverage is which side of the receiver you line up on.
- Inside leverage: line up a little inside him. You take away inside routes (slants, posts, digs) and push him toward the sideline.
- Outside leverage: line up a little outside him. You take away outside routes (outs, corners, fades) and push him inside.

A good rule: take away the side where you have no help, and let him go toward your help. If a safety is helping you inside, you can play outside leverage. If nobody is helping you, the call or your coach will tell you which side to protect.

Keep your leverage through the route. If he gets to the side you're protecting, you're beat.`,
        { diagram: diagram({ dots: [...oline("right"), qb("gun"), o("Z", 14, -1.8), d("C", 13, 6, true), d("FS", 0, 12)], notes: [note("Inside leverage", 10, 9)] }) },
      ),
      lesson(
        "DB",
        "Playing the ball",
        `When the ball is in the air, it's your ball too.
- Look for it: when you're running hip to hip with the receiver and he looks back for the ball, turn your head and find it.
- High point: go up and catch it at the top of your jump, before the receiver can.
- Play through the hands: if you can't catch it, swipe your arm down through his hands as the ball arrives to knock it out.
- Don't be early: hitting him before the ball gets there can be pass interference.

On a receiver who's catching the ball, never lead with your head. Tackle or hit with your shoulder, eyes up and head out of the contact.`,
      ),
      lesson(
        "DB",
        "Run support and communication",
        `Run support: when you read run, come up fast but under control.
- If you're the force player on the call, keep outside leverage and turn the ball back inside.
- If you're the alley player, fill inside-out on the runner's inside hip.
- Break down a few yards before you get to the ball carrier so he can't make you miss.

Communication: DBs talk on every play. Call out the formation and the strength, yell "Motion!" when a player moves, "Run!" or "Pass!" when you see it, and "Ball!" when it's thrown so everyone turns and plays it. Words vary by team, so learn your team's calls. A quiet secondary gives up big plays.`,
      ),
    ],
    questions: [
      choice("DB", "During a backpedal, where should your weight be?", "Forward, with your shoulders over your toes", ["Back on your heels", "Standing straight up", "Leaning back to see the quarterback"], "Weight forward lets you break quickly; weight on your heels makes you slow.", { core: true }),
      choice("DB", "What is a DB's break?", "Planting your foot and driving toward the ball when the receiver cuts or the ball is thrown", ["Resting between plays", "Turning and running deep on every play", "A jam at the line of scrimmage"], "A quick break closes the space to the ball."),
      choice("DB", "What is cushion in off coverage?", "The space between you and the receiver, so he can't get behind you", ["Padding inside your shoulder pads", "The area between the hashes", "Your distance from the sideline"], "Keep enough cushion that he can't run past you.", { core: true }),
      choice("DB", "In press coverage, what should you watch?", "The receiver's hips", ["His head and shoulders", "The quarterback only", "The running back"], "Heads and shoulders fake; hips go where he goes.", { minLevel: "middle_school", diagram: diagram({ dots: [...oline("right"), qb("gun"), o("Z", 14, -1.8), d("C", 14, 0.9, true)] }) }),
      trueFalse("DB", "In press, a good corner lunges at the receiver as soon as the ball is snapped.", false, "Lunging lets the receiver run right past you; stay patient and mirror him.", { minLevel: "middle_school" }),
      choice("DB", "What is a bail technique?", "Show press, then turn and run to your deep zone at the snap", ["Jam the receiver and stay on him the whole way", "Blitz off the edge", "Back up 15 yards before the snap"], "Bail hides the coverage: it looks like press but plays deep zone.", { minLevel: "middle_school" }),
      choice("DB", "The corner (highlighted) lines up a little inside the receiver. Which routes is he taking away first?", "Inside routes like slants and posts", ["Outside routes like outs and fades", "Screens behind the line", "None; leverage doesn't change anything"], "Inside leverage protects the inside and pushes the receiver toward the sideline.", {
        core: true,
        diagram: diagram({ dots: [...oline("right"), qb("gun"), o("Z", 14, -1.8), d("C", 13, 6, true)] }),
      }),
      trueFalse("DB", "A good leverage rule is to take away the side where you have no help.", true, "Let the receiver go toward your help, not away from it."),
      choice("DB", "What does it mean to high-point the ball?", "Catch it at the top of your jump, before the receiver can", ["Jump before the ball is thrown", "Wait for the ball to come down to you", "Knock the ball as high as you can"], "The highest hands win the ball."),
      choice("DB", "You can't catch the ball. When do you play through the receiver's hands?", "As the ball arrives, not before", ["Before the ball arrives, so he can't get ready", "After he has caught it and run three steps", "Never; just watch the catch"], "Swiping through his hands as the ball gets there knocks it loose without interference.", { core: true }),
      trueFalse("DB", "Hitting a receiver before the ball gets there can be pass interference.", true, "Once the ball is thrown, you can't hit him early; play the ball."),
      choice("DB", "Many teams yell one word when the ball is thrown. What is it?", "Ball!", ["Motion!", "Run!", "Huddle!"], "\"Ball!\" tells everyone to turn and play the throw. Check your team's word."),
      choice("DB", "You read run and come up to support. What should you do a few yards before you reach the runner?", "Break down: shorten your steps and get under control", ["Leave your feet and dive at him", "Speed up and lower your head", "Stop and wait for help"], "A DB who flies in out of control gets made to miss."),
      order("DB", "Put press technique in order.", ["Line up close and square to the receiver", "Watch his hips and be patient", "Jam with your hands as he releases", "Get on his hip and run with him"], "Patient feet first, then hands, then run with him.", { minLevel: "middle_school" }),
      open("DB", "In your own words: what is your job if you're the force player on a run to your side?", "Come up under control, keep outside leverage and turn the runner back inside to my teammates. Never let him get outside me.", ["keep outside leverage", "turn the ball back inside"], "The force player sets the edge for the whole defense."),
    ],
  },

  // ===================== 9. tackling and pursuit =====================
  {
    key: "def_tackling_pursuit",
    version: 1,
    side: "defense",
    category: "technique",
    name: "Tackling and pursuit",
    summary: "Safe shoulder tackling with the head out of the contact, breaking down in space, pursuit angles and gang tackling.",
    level: "youth",
    for: ["ALL"],
    lessons: [
      lesson(
        "ALL",
        "Safe tackling: keep your head out of it",
        `Tackle with your shoulder, never with your head. Your helmet is there to protect you, not to hit with.
- Eyes up: see what you hit. Keep your chin up and never duck your head.
- Head out of the contact: slide your head to the side so your shoulder pad, not your head, hits the runner. Many teams teach putting your head behind the runner's hip.
- Aim at his near thigh or hip, below his chest.

Hitting with the crown (top) of your helmet is called spearing, and hitting a player in the head or neck area is called targeting. Both are illegal and can cause serious neck and head injuries, to you and to him. If your head is down, you can't see, and that's how players get hurt.`,
      ),
      lesson(
        "ALL",
        "The tackle, step by step",
        `- Approach: run hard to the ball carrier, then break down when you get close.
- Near foot, near shoulder: step with the foot on the same side as the shoulder you'll hit with. Hitting with your right shoulder? Step with your right foot.
- Contact: shoulder pad on his near thigh or hip, head to the side, eyes up.
- Wrap: shoot both arms around his thighs and squeeze, grabbing cloth if you can.
- Drive: keep your feet moving with short, powerful steps.
- Finish: take him to the ground. Many teams teach rolling him to the side; others teach driving him back. Either way you land on him, not on your head.

Practice it slowly first. Good form at slow speed becomes good form at full speed.`,
      ),
      lesson(
        "ALL",
        "Breaking down in space",
        `Most missed tackles happen in the open field, when the tackler runs in too fast and the runner cuts.

Break down about 3 to 5 yards from the runner:
- Chop your feet: short, fast steps.
- Sink your hips and bend your knees.
- Keep a wide base, with your chest and eyes up.

Now you can move with his cut. Close the space under control, then shoot your near foot and shoulder.

Near the sideline, the sideline is an extra defender. Stay inside the runner and push him toward it, so his run ends there.`,
      ),
      lesson(
        "ALL",
        "Pursuit angles",
        `Pursuit is how all eleven players get to the ball. Don't run to where the runner is. Run to where he's going.

Pick a landmark: a spot ahead of the runner where your path will meet his, and run hard to it. The faster he is and the farther away you are, the deeper (farther ahead of him) your landmark should be. If you aim right at him, you'll end up chasing him from behind.

Stay inside-out: approach from his inside so he can't cut back across your face. If he does cut back, your teammates who stayed home and the players pursuing behind you are there.`,
        {
          diagram: diagram({
            dots: [...oline("right"), qb("under"), o("TB", 3, -4), d("W", -2, 6, true)],
            lines: [arrow("run", [3, -4], [10, -2], [16, 3], [20, 10]), darrow("path", [-2, 6], [17.5, 6.5])],
            notes: [note("Landmark", 18, 8.5)],
          }),
        },
      ),
      lesson(
        "ALL",
        "Gang tackling",
        `One player makes the first hit, and everyone else arrives right behind him. The first tackler stops the runner's feet; the second and third players finish the tackle and go for the ball.

Run to the ball on every play until the whistle. That's how missed tackles get saved and fumbles get recovered.

Stop when the whistle blows. Hitting a player after the play is over is a penalty, it can hurt someone, and it's not how good teams play.`,
      ),
    ],
    questions: [
      choice("ALL", "What part of your body makes contact in a tackle?", "Your shoulder pad, with your head to the side", ["The top of your helmet", "Your facemask", "Your forearm, swinging it"], "Shoulder pad on the runner, head out of the contact.", { core: true }),
      trueFalse("ALL", "You should keep your eyes up and see what you hit when you tackle.", true, "Eyes up keeps your head and neck safe and lets you see the runner's cut.", { core: true }),
      trueFalse("ALL", "Lowering your head and leading with the crown of your helmet is a good way to tackle a bigger runner.", false, "Never. That's spearing: illegal and the way neck injuries happen.", { core: true }),
      choice("ALL", "What does \"near foot, near shoulder\" mean?", "Step with the foot on the same side as the shoulder you hit with", ["Step with the opposite foot from the shoulder you hit with", "Hit the runner's near shoulder with your helmet", "Plant both feet and wait for him"], "Same side foot and shoulder gives you balance and power."),
      order("ALL", "Put the parts of a tackle in order.", ["Break down", "Step near foot, hit with near shoulder", "Wrap", "Drive your feet", "Finish him to the ground"], "Break down, hit, wrap, drive, finish.", { core: true }),
      choice("ALL", "What does it mean to wrap in a tackle?", "Shoot your arms around the runner's legs and squeeze", ["Bump him with your shoulder without using your arms", "Grab his facemask", "Push him with both hands"], "Wrapping keeps him from bouncing off you."),
      choice("ALL", "Why do you break down before a tackle in the open field?", "So you're under control and can move with his cut", ["So you look bigger to the runner", "So the referee can see you", "So a teammate can make the tackle instead"], "A tackler who runs in too fast gets made to miss."),
      choice("ALL", "About how far from the runner do most coaches have you start to break down?", "About 3 to 5 yards", ["About 15 yards", "Right when you touch him", "At the line of scrimmage, every time"], "Close enough to tackle, far enough to adjust to his cut."),
      choice("ALL", "The runner is heading for the sideline. Where should the highlighted linebacker aim?", "At a landmark ahead of the runner, where their paths meet", ["Straight at where the runner is now", "At the quarterback", "Back to his starting spot"], "Aim where he's going, not where he is.", {
        core: true,
        diagram: diagram({ dots: [...oline("right"), qb("under"), o("TB", 3, -4), d("W", -2, 6, true)], lines: [arrow("run", [3, -4], [10, -2], [16, 3], [20, 10])] }),
      }),
      trueFalse("ALL", "On a pursuit angle, stay inside the runner so he can't cut back across your face.", true, "Inside-out pursuit takes away the cutback."),
      trueFalse("ALL", "The faster the runner, the farther ahead of him your pursuit landmark should be.", true, "A fast runner covers more ground, so you have to aim farther ahead."),
      choice("ALL", "What is gang tackling?", "Everyone running to the ball so several players finish the tackle", ["Two teammates tackling each other in practice", "Only the closest player tackles while the others watch", "Piling on after the whistle"], "The first hit stops him; the next players finish him and go for the ball."),
      trueFalse("ALL", "Hitting a ball carrier after the whistle shows great effort.", false, "It's a penalty and it can hurt someone; play to the whistle, then stop."),
      choice("ALL", "The runner is near the sideline. How can you use it?", "Stay inside him and make the sideline an extra defender", ["Let him cut back to the middle", "Stop chasing, because he'll run out of bounds", "Push him out after the whistle"], "Inside leverage pins him to the sideline, where his run ends."),
      open("ALL", "In your own words: how do you keep your head safe when you tackle?", "Keep my eyes up so I see what I hit, slide my head to the side so it's out of the contact, and hit with my shoulder pad, never the top of my helmet.", ["eyes up", "head to the side, out of the contact", "hit with the shoulder, never the crown"], "Shoulder tackling with your head out of it is safer and works better."),
    ],
  },
];
