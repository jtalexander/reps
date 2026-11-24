/**
 * Football basics: special teams. The rules of the kicking game, kickoffs,
 * punts, field goals and PATs, and specialist technique. Rules follow the
 * high school (NFHS) book unless a lesson says otherwise.
 *
 * Kicking diagrams use their own frame: on kickoffs the kicking team is at
 * y = 0 running up the field and the returners are near y = 35 (not to scale);
 * on punts and field goals the line of scrimmage is at y = 0 as usual.
 */
import { choice, lesson, open, order, trueFalse } from "./build";
import { arrow, d, darrow, diagram, note, o, zone } from "./draw";
import type { Diagram, Dot, LibTopic, Line } from "./types";

// ---------- small diagram helpers (special teams only) ----------

/** Mark these labels as highlighted. */
const hiLabels = (dots: Dot[], labels: string[]): Dot[] => dots.map((p) => (labels.includes(p.label) ? { ...p, hi: true } : p));

/** Kickoff coverage lanes, left to right (x in yards). The kicker is the safety. */
const LANES: [string, number][] = [
  ["L5", -22],
  ["L4", -17],
  ["L3", -12],
  ["L2", -7],
  ["L1", -3],
  ["R1", 3],
  ["R2", 7],
  ["R3", 12],
  ["R4", 17],
  ["R5", 22],
];
const kickTeam = (): Dot[] => [...LANES.map(([l, x]) => o(l, x, -1)), o("K", 0, -5)];

/** Where each lane runs to on coverage, with the ball caught at (4, 36). */
const LANE_END: Record<string, [number, number]> = {
  L5: [-14, 29],
  L4: [-8, 28],
  L3: [-3, 27],
  L2: [0, 26],
  L1: [2.5, 25],
  R1: [5.5, 25],
  R2: [8, 26],
  R3: [11, 27],
  R4: [14.5, 28],
  R5: [20, 29],
};

function coverageDiagram(hi: string[] = []): Diagram {
  return diagram({
    dots: [...hiLabels(kickTeam(), hi), d("R", 4, 36)],
    lines: [...LANES.map(([l, x]) => arrow("run", [x, -1], LANE_END[l]!)), arrow("run", [0, -5], [2, 14])],
    notes: [note("contain", -16, 31), note("contain", 21, 31), note("safety", 2, 15.8), note("not to scale", -20, 38)],
    los: false,
  });
}

/** A kickoff return with a wall set on the right side. */
function returnWallDiagram(): Diagram {
  const front = [d("F", -16, 13), d("F", -8, 13), d("F", 0, 13), d("F", 8, 13), d("F", 16, 13)];
  const second = [d("M", -12, 24), d("M", -4, 24), d("M", 4, 24), d("M", 12, 24)];
  return diagram({
    dots: [...LANES.map(([l, x]) => o(l, x, 0)), o("K", 0, -4), ...front, ...second, d("R", -6, 35), d("R", 5, 36, true)],
    lines: [
      darrow("path", [8, 13], [12, 16.5]),
      darrow("path", [16, 13], [13, 20]),
      darrow("path", [4, 24], [12, 28]),
      darrow("block", [0, 13], [2, 9]),
      darrow("block", [-8, 13], [-6, 9]),
      darrow("block", [-16, 13], [-15, 9]),
      darrow("block", [-12, 24], [-10, 17]),
      darrow("block", [-4, 24], [-2, 17]),
      darrow("run", [5, 36], [9, 33], [17, 28], [18, 8]),
    ],
    zones: [zone("wall", 12.5, 22.5, 2, 7.5)],
    notes: [note("not to scale", -20, 38)],
    los: false,
  });
}

// Punt formations: line of scrimmage at y = 0, punt team below it.
const LY = -0.8;

function spreadPunt(hi: string[] = []): Dot[] {
  return hiLabels(
    [o("GN", -20, LY), o("T", -3.2, LY), o("G", -1.6, LY), o("LS", 0, LY), o("G", 1.6, LY), o("T", 3.2, LY), o("GN", 20, LY), o("S", -1.6, -5), o("S", 0, -5.2), o("S", 1.6, -5), o("P", 0, -14)],
    hi,
  );
}

function tightPunt(hi: string[] = []): Dot[] {
  return hiLabels(
    [o("E", -4.5, LY), o("T", -3, LY), o("G", -1.5, LY), o("LS", 0, LY), o("G", 1.5, LY), o("T", 3, LY), o("E", 4.5, LY), o("W", -5.8, -2), o("W", 5.8, -2), o("PP", 0, -5), o("P", 0, -12)],
    hi,
  );
}

/** Field goal / PAT protection: tight splits, wings, holder at 7 yards, kicker behind him. */
function fieldGoal(hi: string[] = []): Dot[] {
  return hiLabels(
    [o("E", -3.6, LY), o("T", -2.4, LY), o("G", -1.2, LY), o("LS", 0, LY), o("G", 1.2, LY), o("T", 2.4, LY), o("E", 3.6, LY), o("W", -4.7, -1.8), o("W", 4.7, -1.8), o("H", 0, -7), o("K", -1.6, -9.5)],
    hi,
  );
}

/** Each lineman's short step inside (toward the snapper) to close his gap. */
const stepInside = (): Line[] => [-3.6, -2.4, -1.2, 1.2, 2.4, 3.6].map((x) => arrow("block", [x, LY], [x - Math.sign(x) * 0.5, -0.2]));

const fgRushers = (): Dot[] => [d("E", -7, 1), d("R", -3, 1), d("R", -1.8, 1), d("R", -0.6, 1), d("R", 0.6, 1), d("R", 1.8, 1), d("R", 3, 1), d("E", 7, 1)];

// ---------- the topics ----------

export const SPECIAL: LibTopic[] = [
  {
    key: "st_rules_basics",
    version: 1,
    side: "special",
    category: "rules",
    name: "Special teams rules",
    summary: "The rules of the kicking game: kickoffs and onside kicks, touchbacks, the fair catch, punts, the try after a touchdown, safeties and missed field goals.",
    level: "youth",
    for: ["ALL"],
    lessons: [
      lesson(
        "ALL",
        "Kickoffs and onside kicks",
        `A kickoff starts each half and comes after every touchdown and field goal. It's a free kick: the kicking team kicks off a tee, and nobody can rush the kicker. In high school the kick is from the kicking team's 40-yard line (college and the NFL kick from the 35).
- The receiving team lines up at least 10 yards away from the ball.
- The kicking team can't touch the ball, or block anyone, until the ball has gone 10 yards or a receiver touches it.
- Once the ball goes 10 yards, or as soon as a receiver touches it, either team can recover it.

That last rule is what makes an onside kick work. An onside kick is a short kick, usually bounced off the ground, that the kicking team tries to get back. If the kicking team recovers it, it keeps the ball, but in high school it can't run with it.

A kickoff that goes out of bounds before anyone touches it is a penalty on the kicking team.`,
      ),
      lesson(
        "ALL",
        "Touchbacks and the fair catch",
        `A touchback happens when a kick goes into the receiving team's end zone. In high school, the play is over as soon as the kick reaches the end zone; nobody runs it out. The receiving team gets the ball at its own 20-yard line. (College and the NFL let returners run kicks out of the end zone, and they put some touchbacks farther out.)

A fair catch lets a returner catch a kick without being hit.
- The signal: one hand raised high above the head and waved side to side, before the catch.
- After a fair catch, the returner can't run with the ball. His team takes it where he caught it.
- Nobody may hit a player who signaled for a fair catch. It's a 15-yard penalty and it's dangerous.

Signal or no signal, the kicking team must give a returner a clear chance to catch the ball. Don't touch him or get in his way while the kick is in the air.`,
      ),
      lesson(
        "ALL",
        "Punts: muffs, first touching and the end zone",
        `A punt is a kick from the line of scrimmage, usually on fourth down. Learn these words:
- Muff: touching the ball without catching it. If a returner muffs a punt, it's a loose ball, and the kicking team can recover it and keep it.
- First touching: a kicking team player touches the punt past the line before the receiving team does. It isn't a penalty, but the receiving team may choose to take the ball at that spot.
- Downed: if no returner touches the punt, the kicking team can stop it. The ball is dead where they down it or where it stops.
- A punt that goes into the end zone is a touchback: ball at the 20.
- A punt that is blocked and stays behind the line is a loose ball either team can pick up.

In high school, the kicking team can keep a punt it recovers past the line, but it can't run with it.

The big lesson for returners: if you aren't going to catch it, stay far away from it. Once it touches you, it's anybody's ball.`,
      ),
      lesson(
        "ALL",
        "The try, safeties and missed field goals",
        `After a touchdown (6 points), the scoring team gets one more play called the try.
- Kick it through the goal posts: 1 point (often called the PAT, point after touchdown).
- Run or pass it into the end zone: 2 points.
- In high school, the try is snapped from the 3-yard line. If the defense gets the ball, the play is over. (In college and the NFL, the defense can run it back for 2 points.)

A safety is 2 points for the defense. It happens when the offense's ball carrier is tackled in his own end zone, or the ball goes out of bounds behind his own goal line, like a snap over the punter's head. The team that gave up the safety must free kick to the other team from its own 20-yard line, often with a punt. So a safety costs you points and the ball.

In high school, a missed field goal is treated like a punt. If it goes into the end zone, it's a touchback. If it falls short, the defense can return it. In college and the NFL, a miss gives the other team the ball near where it was kicked from.`,
      ),
      lesson(
        "ALL",
        "Your league may change the kicking rules",
        `Many youth leagues change special teams rules to keep young players safe and keep the game moving. Your league might:
- Skip kickoffs and start each drive at a set yard line.
- Let a team declare a punt, so the ball is moved down the field a set distance with no kick, no rush and no return.
- Allow punts, but no punt rush, so nobody tries to block it.
- Make a kicked try worth 2 points and a run or pass worth 1, because kicking is harder for young players.
- Ban onside kicks, or allow them only at certain times.

These lessons teach the high school rules (the NFHS rules), because most leagues build from them. Your coach will tell you what your league changes. When in doubt, follow your league's rules.`,
      ),
    ],
    questions: [
      choice(
        "ALL",
        "On a kickoff, how far must the ball go before the kicking team can recover it?",
        "10 yards, or less if a receiver touches it first",
        ["5 yards", "15 yards", "It must touch the ground first"],
        "After 10 yards, or once the receiving team touches it, the ball belongs to whoever recovers it. That's what makes onside kicks possible.",
        { core: true },
      ),
      trueFalse(
        "ALL",
        "In high school, if the kicking team recovers an onside kick, it can run with the ball.",
        false,
        "The kicking team keeps the ball where it recovered it, but in high school it can't advance it.",
      ),
      choice(
        "ALL",
        "What is the fair catch signal?",
        "One hand raised high above the head and waved side to side",
        ["Both arms crossed over the chest", "One hand pointed at the kicker", "Kneeling down before the ball arrives"],
        "One hand, clearly above the head, waved side to side, before the catch.",
        { core: true },
      ),
      trueFalse(
        "ALL",
        "After a fair catch, the returner can run with the ball if he sees an opening.",
        false,
        "A fair catch means no run. The ball is dead where he catches it.",
      ),
      choice(
        "ALL",
        "A returner has signaled for a fair catch. What should the kicking team do?",
        "Get close, but don't touch him; be ready if he drops it",
        ["Tackle him the moment he catches it", "Bump him while the ball is in the air", "Stop running and wait for the whistle"],
        "Hitting a fair catch player is a 15-yard penalty and dangerous. If he muffs it, it's a loose ball you can recover.",
        { core: true },
      ),
      choice(
        "ALL",
        "In high school, a kickoff rolls into the end zone. What happens?",
        "Touchback: the receiving team gets the ball at its 20",
        ["The kicking team gets the ball back", "The receiving team must run it out", "The kicking team kicks again from 5 yards back"],
        "In high school, a kick that reaches the end zone is a touchback, and the ball comes out to the 20.",
        { core: true },
      ),
      choice(
        "ALL",
        "A punt hits a returner's leg and bounces away. Who can recover it?",
        "Either team: it's a loose ball",
        ["Only the receiving team", "Nobody; the play is dead", "Only the kicking team, as a penalty"],
        "Once a returner touches (muffs) the punt, it's a loose ball and the kicking team can get it.",
        { core: true },
      ),
      choice(
        "ALL",
        "A kicking team player touches a punt past the line before any returner does. What is it called?",
        "First touching",
        ["A muff", "Kick-catch interference", "A touchback"],
        "First touching isn't a penalty, but the receiving team may take the ball at that spot.",
        { minLevel: "middle_school" },
      ),
      choice(
        "ALL",
        "In high school, where is the try after a touchdown snapped from?",
        "The 3-yard line",
        ["The 2-yard line", "The 5-yard line", "The 10-yard line"],
        "High school snaps the try from the 3. The NFL is different: kicks from the 15, 2-point tries from the 2.",
      ),
      choice(
        "ALL",
        "How many points is a safety worth, and who gets them?",
        "2 points for the defense",
        ["1 point for the defense", "2 points for the offense", "3 points for the defense"],
        "A safety is 2 points for the defense, and the team that gave it up has to kick to them too.",
      ),
      order(
        "ALL",
        "Put what happens on a safety in order.",
        ["The ball carrier is tackled in his own end zone", "The defense scores 2 points", "The team that gave up the safety free kicks from its own 20", "The team that scored the safety gets the ball"],
        "A safety costs you 2 points and the ball: you kick from your 20 to the team that scored.",
      ),
      choice(
        "ALL",
        "In high school, a field goal try falls short and comes down at the 5-yard line. What is it treated like?",
        "A punt: the defense can return it, or it can be downed",
        ["An incomplete pass: the ball goes back to the line", "A touchback at the 20", "A safety"],
        "A missed field goal is a kick like a punt. It's only a touchback if it reaches the end zone.",
        { minLevel: "middle_school" },
      ),
      trueFalse(
        "ALL",
        "In high school, if the defense intercepts a 2-point try, it can run it back for points.",
        false,
        "In high school the try ends when the defense gets the ball. College and the NFL let the defense return it for 2.",
      ),
      trueFalse(
        "ALL",
        "Some youth leagues skip kickoffs or don't allow punt rushes, so you should learn your league's rules.",
        true,
        "Many youth leagues change the kicking game. Your coach will tell you what's different.",
      ),
      open(
        "ALL",
        "Why should a punt returner stay far away from a punt he isn't going to catch?",
        "If the ball touches him, it becomes a loose ball and the kicking team can recover it. If he stays away, the kicking team can only down it.",
        ["touching it makes it a loose ball", "the kicking team can recover it"],
        "A muffed punt is one of the easiest ways to give the ball away. Stay clear unless you're catching it.",
      ),
    ],
  },

  {
    key: "st_kickoff",
    version: 1,
    side: "special",
    category: "concepts",
    name: "Kickoff coverage and return",
    summary: "Covering a kickoff in lanes with contain and a safety, beating blocks without leaving your lane, and returning kicks with a front line, a wall and legal blocks.",
    level: "youth",
    for: ["ALL"],
    lessons: [
      lesson(
        "ALL",
        "Kickoff coverage: run in lanes",
        `On kickoff coverage, 10 players run down the field in lanes, five on each side of the kicker. Think of the field split into lanes like a swimming pool. Your lane is your job.
- Inside players (closest to the kicker) squeeze toward the ball.
- The outside players are contain. They stay outside the returner so he can't run around the edge. Keep the ball carrier on your inside shoulder.
- The kicker, and sometimes one more player, is the safety: the last tackler, in case the returner breaks free.

Run hard, but stay spread out, about 5 yards apart. If two players drift together, they leave a hole somewhere else, and a good returner will find it. Close in on the ball carrier together, like a wall moving up the field.`,
        { diagram: coverageDiagram() },
      ),
      lesson(
        "ALL",
        "Beating blocks on coverage",
        `Blockers will try to push you out of your lane. Your job is to get past them and stay in it.
- See the blocker coming, but keep your eyes on the ball carrier.
- Don't run around behind a blocker. That pulls you out of your lane and opens the hole you were supposed to fill.
- Beat him on one side, the side that keeps you in your lane. Get skinny (turn your shoulders), rip or swim your arm past him, and get back in your lane.
- If you must take him on, strike with your hands, keep your head out of it, shed him (get free) and keep going.
- Break down as you get close to the ball carrier: short choppy steps, knees bent, balanced.
- Tackle with your head up and to the side. Wrap your arms and drive your legs.

Kickoffs are high-speed plays. Good form keeps you and everyone else safe.`,
      ),
      lesson(
        "ALL",
        "Kickoff return: front line, second line and the wall",
        `The return team has three jobs: catch the kick, block for the returner and protect the ball.
- Front line: the players closest to the kicking team. They watch for a short or onside kick first. Once the ball sails over them, they turn, run back and find their blocks.
- Second line: deeper players who block the next wave of tacklers.
- Returners: the deep players who catch the kick.

Many teams set a wall. Blockers run to a spot on one side of the field and line up one after another, each blocking a coverage player who comes at him. The returner catches the ball, heads to the wall and runs between the wall and the sideline. Other teams block in lanes: each blocker takes a man, and the returner hits the crease (the opening) up the middle.`,
        { diagram: returnWallDiagram() },
      ),
      lesson(
        "ALL",
        "Legal blocks on returns",
        `A long return can be wiped out by one illegal block. Know the rules:
- Block from the front. If you can see the numbers on the back of his jersey, don't block him. A block in the back is a 10-yard penalty.
- Block above the waist. Low blocks are not allowed on kick plays.
- Keep your hands inside his shoulders and your head out of the block.
- Don't grab his jersey. Holding him up means staying in front of him and moving your feet, not grabbing.
- If you can't get in front of your man, run with him and stay between him and the returner. You can be in his way without hitting him from behind.

Stay on your block until the whistle, and never hit a player who is out of the play.`,
      ),
      lesson(
        "ALL",
        "The returner, squib kicks and onside kicks",
        `Returner decisions:
- Catch the ball first. Then run where the return is built to go, hit it hard and don't dance.
- In high school, a kick that reaches the end zone is a touchback. Let it go; the ball comes out to the 20.
- Carry the ball high and tight, especially in traffic.

Squib kick: a low, bouncing kick that's hard to handle. The front-line or second-line player closest to it must field it. Scoop it up if you can. Fall on it if you can't. Never let it bounce around near you.

Onside kick: when the kicking team might kick short, the coach sends in the hands team, the players best at catching. Attack the ball, catch it or cover it up and take the hit. Don't try to run, just secure it. A kick that is still in the air (hasn't hit the ground) can be fair caught, which protects you from being hit.`,
      ),
    ],
    questions: [
      choice(
        "ALL",
        "On kickoff coverage, what is a contain player's job?",
        "Stay outside the returner so he can't run around the edge",
        ["Stay back as the last tackler", "Run straight at the kicker", "Block the front line"],
        "Contain keeps the ball carrier inside, toward the rest of the coverage. The safety is the one who stays back.",
        { core: true, diagram: coverageDiagram(["L5", "R5"]) },
      ),
      choice(
        "ALL",
        "Who is usually the safety on kickoff coverage?",
        "The kicker",
        ["The fastest player on the team", "The player in the middle lane", "The contain player"],
        "The kicker usually stays back as the last line of defense; some teams add a second safety.",
      ),
      trueFalse(
        "ALL",
        "On coverage, it's fine to run around behind a blocker, even if it takes you out of your lane.",
        false,
        "Running behind a blocker leaves your lane open. Beat him on one side and get back in your lane.",
        { core: true },
      ),
      choice(
        "ALL",
        "Why do coverage players stay in lanes instead of all running at the ball?",
        "So there are no big holes for the returner to run through",
        ["So they don't get tired", "So the kicker can see them", "So they can't be blocked"],
        "Lanes keep the coverage spread out so every part of the field has a tackler.",
        { core: true },
      ),
      order(
        "ALL",
        "Put a coverage player's job in order.",
        ["Sprint down your lane", "Beat the blocker on one side and get back in your lane", "Break down as you near the ball carrier", "Tackle with your head up and to the side"],
        "Run, beat the block, break down, then make a safe, head-up tackle.",
      ),
      choice(
        "ALL",
        "What does it mean to break down as you near the ball carrier?",
        "Shorten your steps, bend your knees and get balanced",
        ["Slow to a walk and wait for help", "Dive at his feet from a few yards away", "Stop and stand up tall"],
        "Breaking down keeps you under control so the ball carrier can't make you miss.",
      ),
      choice(
        "ALL",
        "On a kickoff return, what do front-line players watch for first?",
        "A short or onside kick",
        ["Which way the returner will run", "The kicking team's safety", "A fair catch signal"],
        "The front line is closest to the ball, so they must handle a short kick before turning to block.",
      ),
      trueFalse(
        "ALL",
        "If you can see the numbers on the back of a coverage player's jersey, you should not block him.",
        true,
        "Seeing his back numbers means a block would hit him from behind, which is illegal. Run with him instead.",
        { core: true },
      ),
      choice(
        "ALL",
        "On a wall return, where does the returner run?",
        "Between the wall and the sideline",
        ["Straight into the middle of the wall", "To the opposite sideline, away from the wall", "Back toward his own end zone first"],
        "The wall keeps the tacklers inside, so the returner runs on its far side, near the sideline.",
        { diagram: returnWallDiagram() },
      ),
      choice(
        "ALL",
        "A squib kick is bouncing near you on the front line. What should you do?",
        "Field it: scoop it up or fall on it",
        ["Let it roll back to the returner", "Turn and block the closest player", "Bat it toward the sideline"],
        "The closest player must secure a squib. A loose bouncing ball can be recovered by the kicking team.",
      ),
      choice(
        "ALL",
        "What is the hands team's main job on an onside kick?",
        "Catch or cover the ball, even if it means taking a hit",
        ["Return it for a touchdown", "Block the kicking team before the ball goes 10 yards", "Let it roll so it goes out of bounds"],
        "Possession is everything on an onside kick. Secure the ball first.",
        { core: true },
      ),
      trueFalse(
        "ALL",
        "On a kickoff return, blocking a player below the waist is legal.",
        false,
        "On kick plays, block from the front and above the waist.",
      ),
      open(
        "ALL",
        "In your own words: how do you get past a blocker on kickoff coverage without leaving your lane?",
        "Keep running in my lane, pick a side of the blocker, get skinny and rip or swim past him, then get back in my lane. I never run around behind him.",
        ["beat him on one side", "don't run behind him", "get back in your lane"],
        "Beating blocks on the side that keeps you in your lane keeps the coverage from springing a hole.",
      ),
    ],
  },

  {
    key: "st_punt",
    version: 1,
    side: "special",
    category: "concepts",
    name: "Punt team, punt return and punt block",
    summary: "Punt formations and protection rules, snap-to-kick timing, punt coverage, and how to block a punt or set up a return.",
    level: "youth",
    for: ["ALL"],
    styles: [
      {
        key: "punt_formation",
        question: "What punt formation does your team use?",
        options: [
          { key: "spread", label: "Spread/shield punt", summary: "Punter deep, a shield of three blockers in front." },
          { key: "tight", label: "Tight/pro punt", summary: "Linemen tight, punter about 10-15 yards deep." },
        ],
      },
    ],
    lessons: [
      lesson(
        "ALL",
        "The spread (shield) punt",
        `In a spread punt, also called a shield punt, the punter lines up about 13 to 15 yards behind the snapper. Three blockers called the shield stand side by side about 5 yards in front of him. The linemen line up with small gaps between them, and two fast players called gunners split out wide near the sidelines.
- Linemen: step back, punch the rusher in front of you, then release and cover.
- Shield: you are the wall. Nobody gets through you. Rushers have to go around the shield, and that takes too long to reach the punter.
- Gunners: beat the blocker in front of you and sprint to the returner.

Because the linemen get off the line fast, the spread punt covers the field quickly. It only works if the shield stands its ground.`,
        {
          style: "punt_formation:spread",
          diagram: diagram({ dots: [...spreadPunt(), d("R", 0, 32)], lines: [arrow("run", [-20, LY], [-6, 28]), arrow("run", [20, LY], [6, 28])], notes: [note("shield", 4, -5), note("about 14 yds", 3.5, -14)] }),
        },
      ),
      lesson(
        "ALL",
        "The tight (pro) punt",
        `In a tight punt, also called a pro punt, the linemen line up close together, foot to foot, with a wing on each end just behind the line. One personal protector (the PP) stands about 5 yards deep, and the punter is about 10 to 15 yards behind the snapper.
- Linemen: protect your inside gap first. Step inside, keep your shoulders square and don't let anyone through.
- Wings: protect the edge. Step out and block the outside rusher.
- PP: the last blocker. He makes the protection calls and takes the most dangerous rusher who comes free.
- Hold your block until you hear the ball kicked, then release and cover.

The tight punt gives more protection, but the coverage gets down the field a little slower.`,
        { style: "punt_formation:tight", diagram: diagram({ dots: tightPunt(), notes: [note("wing", -5.8, -3.3), note("wing", 5.8, -3.3), note("about 12 yds", 3.5, -12)] }) },
      ),
      lesson(
        "ALL",
        "Protection rules and timing",
        `Every punt protection follows the same big rules:
- Inside gap first. The punt goes up the middle, so the most dangerous rusher is the one coming inside you. Take care of him first.
- Nobody gets through untouched. Make contact before you release.
- Don't get pushed back into the punter's path.
- Know your man. Before the snap, see which rusher is yours.

Timing: a good punt takes about 2 seconds from the snap until the ball is kicked. The snap gets back there in under a second, and the punter needs a little over a second to catch, step and kick. Your block only has to hold that long, so short, firm blocks win.

Then cover: once you hear the ball kicked, sprint into your lane.`,
      ),
      lesson(
        "ALL",
        "Punt coverage",
        `Punt coverage works like kickoff coverage, with lanes.
- Gunners get down the field first. Their job is to tackle the returner or make him fair catch.
- Everyone else covers a lane and keeps spacing, about 5 yards apart.
- The outside covering players are contain: keep the returner inside.
- The punter, and often one of the deep blockers, stays back as a safety.
- If the returner signals fair catch, get close but don't touch him.
- If the punt is bouncing toward the end zone, try to down it (stop it and hold it) before it gets there. If it reaches the end zone, it's a touchback.
- If a returner muffs it, it's a loose ball. Get on it.

Head up and to the side on every tackle.`,
      ),
      lesson(
        "ALL",
        "Blocking a punt",
        `Before you rush, check for a fake: a run or pass from punt formation. Someone must stay responsible for the punter and the blockers in front of him.

To block a punt:
- Aim for the block point, a spot a few yards in front of where the punter lines up. That's where his foot meets the ball. Don't aim at the punter.
- Use your rush lane and get through fast. The block is won with the first two steps.
- Put your hands out in front to take the ball off his foot. Don't leave your feet and fly into him.
- If you miss, run past him, not into him. Running into the punter is a 5-yard penalty; roughing him is 15 yards and an automatic first down for the punting team.

If you block it, the ball is loose behind the line. Scoop it up if you can, fall on it if you can't.`,
        {
          minLevel: "middle_school",
          diagram: diagram({
            dots: [...tightPunt(), d("E", -8, 1), d("R", -2.25, 1), d("R", -0.75, 1), d("R", 0.75, 1), d("R", 2.25, 1), d("E", 8, 1)],
            lines: [darrow("run", [-8, 1], [-7.4, -2.6], [-1.3, -8.4]), darrow("run", [8, 1], [7.4, -2.6], [1.3, -8.4])],
            zones: [zone("block point", 0, -9, 2.4, 0.9)],
          }),
        },
      ),
      lesson(
        "ALL",
        "Punt return: when to catch, fair catch or let it go",
        `On a punt return, the blockers at the line hold up their men (stay in front of them and slow them down), then run back to form the return wall. Block from the front and above the waist.

The returner makes one of three choices:
- Catch and run, when he has room.
- Fair catch, when the tacklers will reach him about when the ball does. Raise one hand high and wave it before the catch.
- Let it go, when the punt is coming down inside his own 10-yard line or is short and bouncing. A bouncing punt deep in your territory often rolls into the end zone for a touchback.

When the returner lets it go, he warns his teammates so everyone gets away from the ball. A punt that touches any return player is a loose ball the kicking team can recover.`,
      ),
    ],
    questions: [
      choice(
        "ALL",
        "What is the first rule of punt protection?",
        "Protect your inside gap first",
        ["Block the rusher outside you first", "Release and cover right away", "Block whoever is closest to the punter"],
        "The punt goes up the middle, so the rusher coming inside you is the most dangerous.",
        { core: true },
      ),
      choice(
        "ALL",
        "About how long should it take from the snap until the punt is kicked?",
        "About 2 seconds",
        ["About 1 second", "About 4 seconds", "About 6 seconds"],
        "A good punt is off in about 2 seconds, so protection only has to hold that long.",
        { minLevel: "middle_school" },
      ),
      choice(
        "ALL",
        "In a spread punt, what does the shield do?",
        "Forms a wall in front of the punter that nobody gets through",
        ["Runs down the field first to make the tackle", "Snaps the ball to the punter", "Catches the snap if it's high"],
        "The three-man shield is the last wall. Rushers have to go around it, which takes too long.",
        { style: "punt_formation:spread", diagram: diagram({ dots: spreadPunt(["S"]) }) },
      ),
      trueFalse(
        "ALL",
        "In a spread punt, the linemen step back, punch the rusher, then release to cover.",
        true,
        "Spread punt linemen get off the line fast because the shield protects the punter.",
        { style: "punt_formation:spread" },
      ),
      choice(
        "ALL",
        "In a tight punt, who is the PP?",
        "The personal protector: the last blocker in front of the punter",
        ["The punt returner", "The player who downs the ball", "The backup punter"],
        "The PP lines up about 5 yards deep, makes the protection calls and takes the most dangerous free rusher.",
        { style: "punt_formation:tight", diagram: diagram({ dots: tightPunt(["PP"]) }) },
      ),
      trueFalse(
        "ALL",
        "In a tight punt, linemen should release to cover before they've blocked anyone.",
        false,
        "Hold your block until you hear the ball kicked, then cover. Nobody gets through untouched.",
        { style: "punt_formation:tight" },
      ),
      choice(
        "ALL",
        "On punt coverage, what does a gunner do?",
        "Sprints down the field first to tackle the returner or force a fair catch",
        ["Stays back to protect the punter", "Snaps the ball", "Blocks the punt rushers"],
        "Gunners line up wide and are the first ones down the field.",
        { core: true },
      ),
      choice(
        "ALL",
        "A punt is bouncing toward the end zone. What should the coverage team try to do?",
        "Down it before it reaches the end zone",
        ["Let it roll into the end zone for a touchback", "Pick it up and run it in for a touchdown", "Stay away so the returner has to touch it"],
        "Downing it short of the goal line pins the other team deep. If it reaches the end zone, it comes out to the 20.",
        { core: true },
      ),
      choice(
        "ALL",
        "Where should a punt blocker aim?",
        "The block point: a spot a few yards in front of the punter",
        ["The punter's body", "The long snapper", "Where the punter's foot lands after the kick"],
        "The block point is where the foot meets the ball. Take the ball off his foot, not the punter off his feet.",
        { core: true, minLevel: "middle_school" },
      ),
      trueFalse(
        "ALL",
        "If you miss a punt block and crash into the punter, it can be called roughing the kicker: 15 yards and an automatic first down.",
        true,
        "Running past the punter after a miss avoids giving the ball right back to the punting team.",
        { minLevel: "middle_school" },
      ),
      choice(
        "ALL",
        "You're the punt returner and the punt will come down at your own 7-yard line. What should you usually do?",
        "Let it go and get away from it",
        ["Catch it and run", "Fair catch it at the 7", "Run up and catch it on the first bounce"],
        "Inside your own 10, let it go. A bouncing punt there often rolls into the end zone for a touchback at the 20.",
        { core: true },
      ),
      choice(
        "ALL",
        "When should a punt returner signal for a fair catch?",
        "When the tacklers will reach him about when the ball does",
        ["On every punt, no matter what", "Only when the punt is short", "Only when he's standing in the end zone"],
        "If there's no room to run, a fair catch keeps the ball and keeps him safe.",
      ),
      order(
        "ALL",
        "Put a punt return blocker's job at the line in order.",
        ["Check for a fake", "Hold up the man in front of you", "Run back to your spot in the return wall", "Block from the front, above the waist"],
        "Fake first, then slow your man down, get to the wall and make a legal block.",
      ),
      open(
        "ALL",
        "Why does the punt return team check for a fake before rushing or setting up the return?",
        "Because the punting team might run or pass instead of punting. If everyone turns and runs back to block, nobody is there to stop the fake.",
        ["the punt team might run or pass", "someone has to stop the fake before turning to block"],
        "Fake punts work when the return team leaves too early. Ball first, then the return.",
      ),
    ],
  },

  {
    key: "st_field_goal_pat",
    version: 1,
    side: "special",
    category: "concepts",
    name: "Field goals and extra points",
    summary: "Protecting a field goal or PAT, the snap-hold-kick timing, blocking kicks without a penalty, spotting fakes, and the basic 2-point decision.",
    level: "youth",
    for: ["ALL", "SP"],
    lessons: [
      lesson(
        "ALL",
        "Field goal and PAT protection",
        `On a field goal or PAT (point after touchdown), the ball is kicked from close behind the line, so the protection has to be tight. The linemen line up close together, and the line must not get pushed back.
- Step inside with your inside foot and plant it. Keep your outside foot planted too.
- Hold your gap: nobody gets through the space inside you. Stay low and square, with your hands ready.
- Don't chase rushers. Hold your spot until the ball is kicked.
- Wings: line up a step behind and outside the end. Your job is the edge rusher. Step out, stay low and push him wide of the kick.

The kick takes about a second and a half, so you don't have to win your block. You just can't lose it.`,
        { diagram: diagram({ dots: [...fieldGoal(), ...fgRushers()], lines: stepInside(), notes: [note("hold your gap", 0, -3), note("holder, about 7 yds", 4.5, -7)] }) },
      ),
      lesson(
        "ALL",
        "Snap, hold, kick: the timing",
        `A field goal is a three-player job: the snapper, the holder and the kicker.
- The snapper sends a fast, firm snap back to the holder, who kneels about 7 yards behind the line.
- The holder catches it, sets it down on the spot and turns the laces toward the goal posts.
- The kicker times his steps so his foot arrives just as the ball is set down.

Good high school teams get the whole thing done in about 1.3 to 1.5 seconds. That's why the line only has to hold for a moment. A slow snap, a bobbled hold or a late start gives the rush time to block the kick, so these three practice together all the time.

High school rules allow a small kicking tee on field goals and PATs. College and the NFL don't.`,
      ),
      lesson(
        "ALL",
        "Blocking field goals and PATs",
        `The block team has two jobs: block the kick, and don't give away a penalty.
- Aim for the block point, a spot about a yard or two in front of where the holder sets the ball. Get your hands up there, not into the kicker.
- Inside rushers push their gap hard and get their hands up to knock down a low kick.
- Edge rushers come from outside the wings, flat and fast, to the block point.
- Never jump over a blocker. Hurdling is illegal and dangerous.
- Don't run into or rough the kicker or holder. Running into the kicker is 5 yards. Roughing him is 15 yards and an automatic first down, which can give the offense another try.

If you block it, the ball is loose behind the line: scoop it if you can, fall on it if you can't. (On a try in high school, the play ends once the defense has the ball.)`,
        {
          minLevel: "middle_school",
          diagram: diagram({
            dots: [...fieldGoal(), ...fgRushers()],
            lines: [darrow("run", [-7, 1], [-6.4, -2.6], [-1.2, -5.2]), darrow("run", [7, 1], [6.4, -2.6], [1.2, -5.2])],
            zones: [zone("block point", 0, -5.5, 2.4, 0.9)],
          }),
        },
      ),
      lesson(
        "ALL",
        "Fakes and the 2-point decision",
        `Fakes: the kicking team might run or pass instead of kicking. On the block team, the edge players stay responsible for the holder and kicker, and the defensive backs cover anyone who runs out for a pass. If you see the holder stand up with the ball, yell "fake" to warn everyone.

The 2-point decision: after a touchdown, the coach chooses to kick for 1 point or run a play for 2. Coaches think about:
- The score. If your touchdown leaves you down by 2, a 2-point try can tie the game. Down by 8 means you need a touchdown and a 2-point try to tie.
- Time left. Late in the game, the score matters most.
- Your kicker. Kicks are hard for young players, so many youth teams go for 2, or their league makes a kick worth more.

The coach makes the call. Your job is to know both plays.`,
      ),
    ],
    questions: [
      choice(
        ["ALL"],
        "On field goal protection, which way does a lineman step?",
        "Inside, then hold his gap",
        ["Outside, toward the sideline", "Backward, toward the holder", "Forward, to block the linebacker"],
        "Step inside and plant. Nobody gets through the gap inside you.",
        { core: true },
      ),
      trueFalse(
        ["ALL"],
        "On field goal protection, a lineman should chase a rusher who goes outside him.",
        false,
        "Hold your gap. The man outside you belongs to the next blocker or the wing, and chasing opens your inside gap.",
      ),
      choice(
        ["ALL"],
        "What is the wing's job on field goal protection?",
        "Block the edge rusher and push him wide of the kick",
        ["Catch the snap if it's bad", "Run out for a pass every time", "Block the middle of the line"],
        "The wing protects the edge, where the rusher has the longest path to the kick.",
        { diagram: diagram({ dots: [...fieldGoal(["W"]), ...fgRushers()] }) },
      ),
      choice(
        ["ALL", "SP"],
        "About how far behind the line does the holder usually kneel?",
        "About 7 yards",
        ["About 3 yards", "About 12 yards", "About 15 yards"],
        "About 7 yards gives the kick time to rise over the line without giving the rush too long.",
      ),
      choice(
        ["SP"],
        "About how long should a field goal take from snap to kick?",
        "About 1.3 to 1.5 seconds",
        ["About half a second", "About 3 seconds", "About 5 seconds"],
        "A quick operation means the line only has to hold for a moment.",
        { minLevel: "middle_school" },
      ),
      order(
        ["ALL", "SP"],
        "Put the field goal in order.",
        ["The snapper snaps the ball", "The holder catches it", "The holder sets it on the spot, laces toward the goal posts", "The kicker kicks it"],
        "Snap, catch, spot, kick: all in about a second and a half.",
        { core: true },
      ),
      choice(
        ["ALL"],
        "On the field goal block team, where should rushers aim?",
        "A spot about a yard or two in front of the holder",
        ["The kicker's legs", "The holder's helmet", "The snapper's back"],
        "That's the block point, where the ball is still low. Go for the ball, never the kicker.",
        { core: true },
      ),
      choice(
        ["ALL"],
        "What is the penalty for roughing the kicker?",
        "15 yards and an automatic first down",
        ["5 yards", "10 yards and loss of down", "Nothing, if you were trying to block it"],
        "Roughing is 15 yards and a first down. Just running into the kicker is 5 yards.",
        { minLevel: "middle_school" },
      ),
      trueFalse(
        ["ALL"],
        "Jumping over a blocker to get to a kick is allowed if you don't touch anyone.",
        false,
        "Hurdling over players is illegal and dangerous. Rush through the gaps.",
      ),
      choice(
        ["ALL"],
        "The holder stands up with the ball on a field goal. What is happening?",
        "A fake: yell to warn everyone and cover your man",
        ["A bad snap: the play is dead", "A timeout", "A penalty on the kicking team"],
        "The ball isn't dead until the whistle. Yell \"fake\" and get to your man.",
        { core: true },
      ),
      choice(
        ["ALL"],
        "Your touchdown leaves your team down by 2 points late in the game. What do most coaches do?",
        "Go for 2 to tie the game",
        ["Kick the PAT to get within 1", "Kick off right away and skip the try", "Kick the PAT and try an onside kick"],
        "A 1-point kick still leaves you behind. Two points ties it.",
        { core: true },
      ),
      choice(
        ["ALL"],
        "Your team is down by 8 late in the game. What do you need to tie it?",
        "A touchdown and a 2-point try",
        ["A touchdown and a PAT kick", "Two field goals", "A field goal and a safety"],
        "6 for the touchdown plus 2 for the try makes 8.",
      ),
      trueFalse(
        ["ALL", "SP"],
        "In high school, a small kicking tee may be used for field goals and PATs.",
        true,
        "High school rules allow a small tee on place kicks from scrimmage. College and the NFL don't.",
      ),
      open(
        ["ALL"],
        "In your own words: what are the two jobs of the field goal block team?",
        "Block the kick by getting my hands to the block point, and don't commit a penalty like running into or roughing the kicker. Watch for a fake too.",
        ["block the kick at the block point", "don't rough or run into the kicker"],
        "A block can change a game, but a roughing penalty can give the offense another chance.",
      ),
    ],
  },

  {
    key: "st_specialists",
    version: 1,
    side: "special",
    category: "technique",
    name: "Specialist technique",
    summary: "The basics for kickers, punters, long snappers, holders and returners: steps, contact, the snap, the hold, catching kicks and protecting the ball.",
    level: "youth",
    for: ["SP", "WR", "RB", "DB"],
    lessons: [
      lesson(
        "SP",
        "Kicker: approach, plant, contact, follow-through",
        `Most kickers kick soccer style, with the top of the foot.
- Approach: line up a few steps behind the ball and a couple of steps to the side (a right-footed kicker sets up on the left). Use the same steps every time.
- Plant foot: your non-kicking foot lands beside the ball, about a hand's width to the side, toes pointed at the target.
- Contact: lock your ankle with your toe pointed down and hit the ball with the top of your foot, over the laces of your shoe, a little below the middle of the ball.
- Follow-through: keep your leg swinging up through the ball toward the target. Don't stop your leg at the ball.
- Head down: watch your foot hit the ball.

Kickoffs use a longer, faster run-up, but the same plant, contact and follow-through.`,
      ),
      lesson(
        "SP",
        "Punter: catch, drop, steps",
        `- Stance: feet about shoulder width apart, kicking foot a little forward, knees bent, hands out as a target.
- Catch: catch the snap with your hands, not your body. Turn the ball so the laces are up.
- Hold: hold the ball out over your kicking leg at about waist height, nose pointed slightly down.
- Steps: most punters take a short step with the kicking foot, then a step with the other foot, then kick. Same steps every time, straight at the target.
- Drop: let the ball fall; don't toss it up. The drop is the most important part of a punt. A bad drop means a bad punt.
- Contact: lock your ankle, toe pointed, and hit the ball with the top of your foot. Swing up through it and finish high.

Practice the drop by itself: drop, let it land and see if it hits the same way every time.`,
      ),
      lesson(
        "SP",
        "Long snapper: grip, snap, then protect",
        `The long snapper starts every punt, field goal and PAT.
- Grip: your strong hand grips the ball like a quarterback throwing a pass, fingers across the laces. Your other hand rests on the ball as a guide.
- Stance: feet wider than your shoulders, the ball out in front of you, back flat. Look back through your legs at the target.
- Snap: pull the ball back hard through your legs with both arms, and let your hands follow through toward the target.
- Target: on a punt, the punter's waist on his kicking side; on a field goal, the holder's hands.
- Protect: as soon as the ball is gone, bring your head up, get your hands up and block. You are a blocker too, and rushers will come right at you.

Some rule books give the snapper a moment of protection after the snap. Check your league's rules, and get your hands up fast anyway.`,
        { minLevel: "middle_school" },
      ),
      lesson(
        "SP",
        "Holder: catch, spot, laces",
        `The holder kneels about 7 yards behind the line, on the side away from the kicker's plant foot, so the kicker has room to step.
- Before the snap: one knee down, hands out as a target, the spot (or tee) right in front of you.
- Catch: watch the ball all the way into your hands.
- Spot: put the tip of the ball down on the spot in one quick move. Hold it with one finger on top.
- Laces: spin the ball so the laces face the goal posts, away from the kicker's foot. Kicking the laces can make the ball fly off line.
- Tilt: hold the ball straight up or tilted the way your kicker likes it.

If the snap is bad, still try to get the ball down. If you can't, pick it up and follow your coach's plan for a bad snap.`,
      ),
      lesson(
        "ALL",
        "Returner: catching kicks, the fair catch and ball security",
        `Returners catch punts and kickoffs. Catching comes first; running comes second.
- Get to the spot early and be still when the ball comes down. Line it up in front of your chest.
- Catch with your hands, elbows close together, and watch the ball all the way in. Then tuck it.
- Punts spin and drift, so be ready to move a step or two at the last second.
- Fair catch when tacklers will reach you about when the ball does. Raise one hand high and wave it side to side before the catch.
- Inside your own 10-yard line, let punts go unless your coach says otherwise, and get away from the ball.
- In high school, a kickoff that reaches the end zone is a touchback. Let it go.
- Ball security: carry it high and tight, fingers over the tip, the ball pressed against your forearm and chest, in the arm closer to the sideline.

A returner who never fumbles is worth more than one who breaks a long run once in a while.`,
      ),
    ],
    questions: [
      choice(
        "SP",
        "Where should a soccer-style kicker's plant foot land?",
        "Beside the ball, about a hand's width away, toes pointed at the target",
        ["Right behind the ball", "A full yard to the side of the ball", "In front of the ball, toes pointed at the sideline"],
        "A good plant foot points where you want the ball to go and lets your leg swing freely.",
        { core: true },
      ),
      choice(
        "SP",
        "What part of the foot does a soccer-style kicker hit the ball with?",
        "The top of the foot, over the laces",
        ["The toe", "The heel", "The inside edge, like a soccer pass"],
        "The top of the foot with a locked ankle gives power and a solid contact.",
      ),
      trueFalse(
        "SP",
        "A kicker should stop his leg as soon as his foot hits the ball.",
        false,
        "Follow through up and toward the target. Stopping the leg takes away power and accuracy.",
      ),
      choice(
        "SP",
        "What is the most important part of a good punt?",
        "A good drop",
        ["A long run-up", "Kicking with the toe", "Tossing the ball up high"],
        "The foot can only hit the ball well if the drop puts it in the same place every time.",
        { core: true },
      ),
      order(
        "SP",
        "Put the punter's steps in order.",
        ["Catch the snap with your hands", "Turn the laces up", "Step with the kicking foot, then the other foot", "Drop the ball and kick it"],
        "Catch, laces up, steps, then a clean drop and kick.",
      ),
      choice(
        "SP",
        "Where should a long snapper aim on a punt?",
        "The punter's waist on his kicking side",
        ["The punter's face mask", "The punter's feet", "Just over the punter's head"],
        "That's where the punter wants to catch it, ready to drop and kick.",
        { core: true, minLevel: "middle_school" },
      ),
      trueFalse(
        "SP",
        "After the snap, the long snapper's job is done.",
        false,
        "Snap, then get your head and hands up and block. Rushers come right at the snapper.",
        { minLevel: "middle_school" },
      ),
      choice(
        ["SP", "QB"],
        "Which way should the holder turn the laces?",
        "Toward the goal posts, away from the kicker",
        ["Toward the kicker", "Toward the holder's hand", "It doesn't matter"],
        "Kicking the laces can make the ball fly off line.",
        { core: true },
      ),
      choice(
        ["SP", "QB"],
        "Where does the holder kneel?",
        "About 7 yards back, on the side away from the kicker's plant foot",
        ["Directly behind the ball", "On the same side as the kicker's plant foot", "In front of the ball"],
        "The plant foot lands beside the ball, so the holder kneels on the other side to give the kicker room.",
      ),
      choice(
        ["WR", "RB", "DB", "SP"],
        "How should a returner catch a punt?",
        "With his hands, elbows close together, watching it all the way in",
        ["Trapped against his chest with his arms spread wide", "One-handed, so he can start running sooner", "On the run, at full speed"],
        "Hands, elbows in, eyes on the ball, then tuck it. Catch first, run second.",
        { core: true },
      ),
      choice(
        ["WR", "RB", "DB", "SP"],
        "Coverage players will reach you just as the punt comes down. What is the smart choice?",
        "Signal for a fair catch",
        ["Catch it and try to run anyway", "Let it hit the ground and then pick it up", "Back up and catch it on the run"],
        "A fair catch keeps the ball and keeps you safe when there's no room to run.",
        { core: true },
      ),
      trueFalse(
        ["WR", "RB", "DB", "SP"],
        "A returner should carry the ball in the arm closer to the sideline.",
        true,
        "The outside arm keeps the ball away from tacklers coming from the middle of the field.",
      ),
      choice(
        ["WR", "RB", "DB", "SP"],
        "What does carrying the ball high and tight mean?",
        "Fingers over the tip, ball pressed against your forearm and chest",
        ["Holding it out away from your body in one hand", "Holding it in both hands in front of your face", "Carrying it low by your hip so you can run faster"],
        "High and tight leaves no space for a tackler to punch or pull the ball out.",
      ),
      open(
        "SP",
        "In your own words: why should a kicker or punter use the same steps every time?",
        "So every kick is the same. The same steps put the plant foot and the ball in the same place, and that makes the kick accurate.",
        ["same steps give the same kick", "accuracy / consistency"],
        "Kicking is about repeating the same motion. Change the steps and the kick changes.",
      ),
    ],
  },
];
