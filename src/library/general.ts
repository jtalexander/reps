/**
 * Football basics everyone shares, offense and defense: the language of the
 * line of scrimmage. Also the example the other library files follow.
 */
import { choice, lesson, open, order, trueFalse } from "./build";
import { diagram, front, gapNotes, note, oline, proSet, qb, shell, tech } from "./draw";
import type { LibTopic } from "./types";

export const GENERAL: LibTopic[] = [
  {
    key: "gaps_techniques",
    version: 1,
    side: "general",
    category: "concepts",
    name: "Gaps and techniques",
    summary: "The names for the spaces between blockers (A, B, C, D gaps) and for where a defensive lineman lines up (technique numbers).",
    level: "youth",
    for: ["ALL"],
    lessons: [
      lesson(
        "ALL",
        "Gaps: the spaces between blockers",
        `A gap is the space between two offensive linemen. Both sides of the ball use the same names, counting out from the center:
- A gap: between the center and a guard
- B gap: between a guard and a tackle
- C gap: between a tackle and the tight end (or just outside the tackle when there's no tight end)
- D gap: outside the tight end

There is an A, B and C gap on each side of the center. Runs are aimed at gaps, and defenders are given a gap to fill. "Fit your gap" means get to your space and own it.`,
        { diagram: diagram({ dots: [...oline("right"), qb("under")], notes: gapNotes("right") }) },
      ),
      lesson(
        "ALL",
        "Technique numbers: where a defensive lineman lines up",
        `Coaches number the spots a defensive lineman can line up on. Even numbers are head-up on a blocker; odd numbers are on a blocker's outside shoulder; an "i" means the inside shoulder.
- 0: head-up on the center
- 1: on the center's shoulder (in the A gap)
- 2: head-up on the guard (2i = guard's inside shoulder)
- 3: guard's outside shoulder (in the B gap)
- 4: head-up on the tackle (4i = tackle's inside shoulder)
- 5: tackle's outside shoulder (in the C gap)
- 6: head-up on the tight end; 7: tight end's inside shoulder
- 9: tight end's outside shoulder

So "the 3-technique" is the tackle lined up on the guard's outside shoulder, and "a 5" is the end on the tackle's outside shoulder.`,
        { diagram: diagram({ dots: [...oline("right"), tech("3", "right", "3"), tech("5", "right", "5"), tech("9", "right", "9"), tech("1", "left", "1"), tech("4i", "left", "4i")] }) },
      ),
      lesson(
        "ALL",
        "Why it matters",
        `Offense: the gap names tell a ball carrier where the play is going and tell blockers who is in their space. A defender lined up in your gap or on your shoulder is the one you usually block.

Defense: your technique tells you where to line up, and your gap tells you what you're responsible for when the ball is snapped. If everyone fills his gap, the run has nowhere to go.`,
      ),
    ],
    questions: [
      choice("ALL", "What gap is between the center and the guard?", "A gap", ["B gap", "C gap", "D gap"], "Gaps are lettered from the center out: A, then B, then C, then D.", { core: true }),
      choice("ALL", "What gap is between the guard and the tackle?", "B gap", ["A gap", "C gap", "D gap"], "A is center-guard, B is guard-tackle.", { core: true }),
      choice("ALL", "Where is the D gap?", "Outside the tight end", ["Between the center and guard", "Between the tackle and tight end", "Behind the quarterback"], "D is the last gap, outside the tight end.", {
        diagram: diagram({ dots: oline("right"), notes: [note("?", 5.3, -2.6)] }),
      }),
      choice("ALL", "A defensive tackle lined up on the guard's outside shoulder is in what technique?", "3-technique", ["1-technique", "2-technique", "5-technique"], "Odd numbers are outside shoulders: 1 on the center, 3 on the guard, 5 on the tackle.", {
        core: true,
        diagram: diagram({ dots: [...oline("right"), tech("3", "right", "T", true)] }),
      }),
      choice("ALL", "What does a 0-technique mean?", "Lined up head-up on the center", ["Lined up off the ball as a linebacker", "No one is lined up there", "Lined up on the tight end"], "0 is head-up on the center, usually a nose tackle."),
      choice("ALL", "What does the \"i\" in 4i mean?", "Inside shoulder of the tackle", ["Inside linebacker", "Ineligible", "In the I-formation"], "4 is head-up on the tackle; 4i is shaded to his inside shoulder."),
      trueFalse("ALL", "Even technique numbers are head-up on a blocker, and odd numbers are on a shoulder.", true, "0, 2, 4 and 6 are head-up; 1, 3, 5, 7 and 9 are shaded.", { core: true }),
      order("ALL", "Put the gaps in order from the center out to the tight end side.", ["A gap", "B gap", "C gap", "D gap"], "Letters go out from the center: A, B, C, D."),
      choice(["ALL"], "In this 4-3 Over front, what technique is the end on the tight end side (highlighted)?", "9-technique", ["5-technique", "3-technique", "1-technique"], "He's on the tight end's outside shoulder: that's a 9.", {
        minLevel: "middle_school",
        diagram: diagram({ dots: [...proSet(), ...front("4-3 Over").map((p) => (p.label === "E" && p.x > 0 ? { ...p, hi: true } : p)), ...shell("two")] }),
      }),
      open("ALL", "In your own words: what does it mean to \"fit your gap\"?", "Get to the gap you're responsible for when the ball is snapped and don't let the ball carrier through it.", ["get to your gap", "own it / don't let the runner through"], "Every gap needs a defender; if you leave yours, the run hits there."),
    ],
  },
];
