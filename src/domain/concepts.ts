/**
 * Built-in concept library: standard youth/HS reads for common pass, run,
 * option and RPO concepts. When a play is recognized as a concept, missing
 * reads are filled from here and marked `suggested` until the coach approves.
 * A team can override any entry (`team_concepts`); overrides flow into every
 * play whose fields came from the concept (`from_concept`).
 *
 * Reads name routes, not players: "the corner route" becomes whoever runs
 * the corner in that play.
 */
import { z } from "zod";
import {
  COVERAGES,
  UNKNOWN,
  getPath,
  isUnknown,
  setPath,
  type Coverage,
  type PlayData,
  type Player,
} from "./play";
import { normalizeRouteName } from "./routes";

export const ConceptSchema = z.object({
  key: z.string(),
  name: z.string(),
  kind: z.enum(["pass", "run", "option", "rpo", "screen"]),
  aliases: z.array(z.string()).default([]),
  summary: z.string(),
  /** routes that identify the concept (pass/rpo) */
  routes: z.array(z.string()).default([]),
  presnap_read: z.string().nullable().default(null),
  qb_drop: z.string().nullable().default(null),
  progression: z.array(z.object({ route: z.string(), trigger: z.string() })).default([]),
  hot: z.string().nullable().default(null),
  vs_coverage: z
    .record(z.string(), z.object({ route: z.string(), why: z.string() }))
    .default({}),
  scheme: z.string().nullable().default(null),
  point_of_attack: z.string().nullable().default(null),
  ball_carrier: z.string().nullable().default(null),
  option_type: z.string().nullable().default(null),
  read_key: z.string().nullable().default(null),
  give_rule: z.string().nullable().default(null),
  keep_rule: z.string().nullable().default(null),
  pitch_rule: z.string().nullable().default(null),
  decisions: z
    .array(z.object({ reaction: z.string(), action: z.enum(["give", "keep", "pitch", "throw"]) }))
    .default([]),
  coaching_points: z.array(z.string()).default([]),
});
export type Concept = z.infer<typeof ConceptSchema>;

const c = (x: z.input<typeof ConceptSchema>): Concept => ConceptSchema.parse(x);

export const CONCEPT_LIBRARY: Concept[] = [
  c({
    key: "smash",
    name: "Smash",
    kind: "pass",
    aliases: ["china", "smash corner"],
    summary: "Outside receiver runs a hitch, inside receiver runs a corner. High-low the corner.",
    routes: ["hitch", "corner"],
    qb_drop: "3_step",
    presnap_read: "Find the corner on the smash side. Off and bailing (Cover 3/4) means the hitch is there; squatting with a safety over the top (Cover 2) means the corner route.",
    progression: [
      { route: "corner", trigger: "Corner squats on the hitch — throw the corner route over him." },
      { route: "hitch", trigger: "Corner sinks with the corner route — throw the hitch underneath." },
    ],
    hot: "Blitz: throw the hitch right away.",
    vs_coverage: {
      cover_0: { route: "hitch", why: "No help deep and pressure coming — ball out fast to the hitch." },
      cover_1: { route: "corner", why: "Man coverage — the corner route breaks away from an inside-leverage defender." },
      cover_2: { route: "corner", why: "The corner squats in the flat; the corner route lands in the hole before the safety gets there." },
      cover_3: { route: "hitch", why: "The corner bails to his deep third; the hitch is open underneath." },
      cover_4: { route: "hitch", why: "Quarters corner stays deep; take the hitch." },
    },
  }),
  c({
    key: "slant_flat",
    name: "Slant-Flat",
    kind: "pass",
    aliases: ["slant flat", "slant/flat", "quick slant"],
    summary: "Outside slant, inside flat. Read the flat defender.",
    routes: ["slant", "flat"],
    qb_drop: "3_step",
    presnap_read: "Find the flat defender (the outside linebacker or nickel). He decides it.",
    progression: [
      { route: "slant", trigger: "Flat defender widens with the flat — throw the slant behind him." },
      { route: "flat", trigger: "Flat defender sits or jumps inside — throw the flat." },
    ],
    hot: "Blitz from the flat defender: throw the slant now.",
    vs_coverage: {
      cover_0: { route: "slant", why: "Pressure and man — the slant is the fastest throw." },
      cover_1: { route: "slant", why: "Slant beats outside-leverage man coverage." },
      cover_2: { route: "slant", why: "The corner squats on the flat; the slant fits behind him." },
      cover_3: { route: "flat", why: "The curl/flat defender has to carry the slant window; the flat is open." },
      cover_4: { route: "flat", why: "Apex defender walls the slant; throw the flat." },
    },
  }),
  c({
    key: "stick",
    name: "Stick",
    kind: "pass",
    aliases: ["stick route", "snag"],
    summary: "Outside go/fade, stick at five, back to the flat. Read the flat defender.",
    routes: ["stick", "flat"],
    qb_drop: "3_step",
    presnap_read: "Count the defenders over the stick side. Find the flat defender.",
    progression: [
      { route: "flat", trigger: "Flat defender sits inside on the stick — throw the flat." },
      { route: "stick", trigger: "Flat defender widens with the flat — throw the stick." },
    ],
    vs_coverage: {
      cover_1: { route: "stick", why: "Stick beats man with a quick turn away from leverage." },
      cover_2: { route: "stick", why: "Corner squats on the flat; the stick sits behind him." },
      cover_3: { route: "flat", why: "Curl/flat defender carries the stick; the flat is there." },
      cover_4: { route: "flat", why: "Apex player squeezes the stick; throw the flat." },
    },
  }),
  c({
    key: "flood",
    name: "Flood",
    kind: "pass",
    aliases: ["sail", "levels flood", "flood concept"],
    summary: "Three levels to one side: go/clear, out at 10-12, flat. Read the flat-to-deep defender.",
    routes: ["go", "out", "flat"],
    qb_drop: "play_action",
    presnap_read: "Find the deep defender on the flood side and the flat defender. One-high usually means the out.",
    progression: [
      { route: "go", trigger: "Corner squats — throw the clear-out deep." },
      { route: "out", trigger: "Corner bails and the flat defender jumps the flat — throw the out." },
      { route: "flat", trigger: "Flat defender drops under the out — throw the flat." },
    ],
    vs_coverage: {
      cover_2: { route: "go", why: "Corner squats; the clear route gets behind him before the safety arrives." },
      cover_3: { route: "out", why: "Three receivers against two defenders on that side; the out is between them." },
      cover_4: { route: "flat", why: "Quarters defenders take away the deep and intermediate; the flat is open." },
    },
  }),
  c({
    key: "mesh",
    name: "Mesh",
    kind: "pass",
    aliases: ["mesh concept", "drive"],
    summary: "Two shallow crossers meet under the linebackers; corner or sit route over the top.",
    routes: ["drag", "drag"],
    qb_drop: "3_step",
    presnap_read: "Man or zone? Man: the crossers run away from defenders. Zone: they sit in the windows.",
    progression: [
      { route: "drag", trigger: "Man coverage — throw the first crosser running away from his defender." },
      { route: "corner", trigger: "Zone and the underneath is sitting on the mesh — throw the route over the top." },
    ],
    vs_coverage: {
      cover_0: { route: "drag", why: "Pressure and man — the mesh creates picks; throw the first crosser." },
      cover_1: { route: "drag", why: "Man coverage: crossers run away from their defenders." },
      cover_3: { route: "drag", why: "Crossers sit in the windows between the hook defenders." },
    },
  }),
  c({
    key: "four_verts",
    name: "Four Verts",
    kind: "pass",
    aliases: ["4 verts", "four verticals", "all go", "verts"],
    summary: "Four receivers vertical. Read the middle safety.",
    routes: ["go", "seam", "go"],
    qb_drop: "5_step",
    presnap_read: "Count the high safeties. One high: work the seams away from the safety. Two high: hit the seam that splits them.",
    progression: [
      { route: "seam", trigger: "Safety leans one way — throw the seam away from him." },
      { route: "go", trigger: "Corner trails the go — throw it outside on the sideline." },
      { route: "drag", trigger: "Everyone is covered deep — check it down." },
    ],
    vs_coverage: {
      cover_1: { route: "go", why: "One safety cannot help both sides; throw the best one-on-one go." },
      cover_2: { route: "seam", why: "Two safeties split wide; the seam between them is open." },
      cover_3: { route: "seam", why: "Four verticals against three deep — the seam away from the middle safety." },
      cover_4: { route: "drag", why: "Four deep defenders match the verticals; take the check-down." },
    },
  }),
  c({
    key: "curl_flat",
    name: "Curl-Flat",
    kind: "pass",
    aliases: ["curl flat", "hook flat", "curl/flat"],
    summary: "Outside curl, inside flat. High-low the flat defender.",
    routes: ["curl", "flat"],
    qb_drop: "5_step",
    presnap_read: "Find the flat defender. Watch him at the snap.",
    progression: [
      { route: "curl", trigger: "Flat defender jumps the flat — throw the curl behind him." },
      { route: "flat", trigger: "Flat defender sinks under the curl — throw the flat." },
    ],
    vs_coverage: {
      cover_2: { route: "curl", why: "Corner squats on the flat; the curl sits in the hole behind him." },
      cover_3: { route: "flat", why: "Curl/flat defender has to carry the curl; the flat is open." },
      cover_4: { route: "flat", why: "Apex defender walls the curl; throw the flat." },
    },
  }),
  c({
    key: "levels",
    name: "Levels",
    kind: "pass",
    aliases: ["drive levels", "in levels"],
    summary: "Two in-breaking routes at different depths. Read the hook defender.",
    routes: ["in", "drag"],
    qb_drop: "3_step",
    presnap_read: "Find the hook (inside) linebacker on the levels side.",
    progression: [
      { route: "in", trigger: "Linebacker comes up on the shallow — throw the in behind him." },
      { route: "drag", trigger: "Linebacker drops under the in — throw the shallow." },
    ],
    vs_coverage: {
      cover_3: { route: "in", why: "The in sits between the hook and the curl defenders." },
      cover_4: { route: "drag", why: "Linebackers drop under the in; throw the shallow." },
    },
  }),
  c({
    key: "screen",
    name: "Screen",
    kind: "screen",
    aliases: ["bubble screen", "tunnel screen", "rb screen", "jailbreak"],
    summary: "Ball out behind the line with blockers in front.",
    routes: ["screen"],
    qb_drop: "shotgun_catch",
    presnap_read: "Count blockers versus defenders on the screen side. More blockers: throw it.",
    progression: [{ route: "screen", trigger: "Catch and throw on time to the screen." }],
  }),
  c({
    key: "inside_zone",
    name: "Inside Zone",
    kind: "run",
    aliases: ["iz", "zone", "inside zone run"],
    summary: "Line steps playside together; the back presses the A/B gap and cuts off the first down lineman past the center.",
    scheme: "inside zone",
    point_of_attack: "Playside A/B gap",
    ball_carrier: "RB",
    coaching_points: [
      "Back: aim for the playside guard's outside leg, read the first down lineman past the center.",
      "Line: step playside, double the down lineman, climb to the linebacker.",
    ],
  }),
  c({
    key: "outside_zone",
    name: "Outside Zone",
    kind: "run",
    aliases: ["stretch", "wide zone", "oz"],
    summary: "Everyone reaches playside; the back aims for the tight end's outside hip and cuts up.",
    scheme: "outside zone",
    point_of_attack: "Playside C gap / edge",
    ball_carrier: "RB",
    coaching_points: ["Back: aim at the outside hip of the end man, one cut and go."],
  }),
  c({
    key: "power",
    name: "Power",
    kind: "run",
    aliases: ["power o", "power run", "g power"],
    summary: "Down blocks playside, the fullback kicks out the end, the backside guard pulls and leads through the hole.",
    scheme: "power",
    point_of_attack: "Playside B/C gap",
    ball_carrier: "RB",
    coaching_points: ["Back: stay tight to the down blocks, follow the pulling guard up the hole."],
  }),
  c({
    key: "counter",
    name: "Counter",
    kind: "run",
    aliases: ["counter trey", "gt counter", "counter gt", "ctr"],
    summary: "Back takes a counter step away, then follows two pullers back to the play side.",
    scheme: "counter",
    point_of_attack: "Playside B/C gap",
    ball_carrier: "RB",
    coaching_points: ["Back: counter step, then follow the pullers — guard kicks out, tackle leads up."],
  }),
  c({
    key: "jet_sweep",
    name: "Jet Sweep",
    kind: "run",
    aliases: ["jet", "fly sweep", "speed sweep", "jet sweep run"],
    summary: "Receiver in full-speed motion takes the handoff at the mesh and races to the edge.",
    scheme: "sweep",
    point_of_attack: "Playside edge (D gap and outside)",
    ball_carrier: "jet motion player",
    coaching_points: ["Motion: full speed, take the ball at the QB, get to the edge before turning up."],
  }),
  c({
    key: "dive",
    name: "Dive",
    kind: "run",
    aliases: ["iso", "isolation", "dive play"],
    summary: "Quick hit straight ahead; fullback or lead back isolates the linebacker.",
    scheme: "dive",
    point_of_attack: "Playside A gap",
    ball_carrier: "RB",
  }),
  c({
    key: "zone_read",
    name: "Zone Read",
    kind: "option",
    aliases: ["read option", "zone read option", "give/keep", "read"],
    summary: "Inside zone with the backside end left unblocked. QB reads him.",
    option_type: "zone_read",
    read_key: "backside_de",
    give_rule: "Backside end stays home, sits wide, or comes at the QB — hand it off.",
    keep_rule: "Backside end crashes down the line chasing the back — pull it and keep it outside him.",
    decisions: [
      { reaction: "crashes", action: "keep" },
      { reaction: "stays_home", action: "give" },
      { reaction: "attacks_qb", action: "give" },
    ],
    ball_carrier: "RB",
    scheme: "inside zone",
    point_of_attack: "Playside A/B gap",
  }),
  c({
    key: "triple_option",
    name: "Triple Option",
    kind: "option",
    aliases: ["veer", "triple", "inside veer"],
    summary: "Dive, keep, or pitch. First key the dive read, then the pitch key.",
    option_type: "triple",
    read_key: "playside_dt",
    give_rule: "Dive key stays outside or sits — give the dive.",
    keep_rule: "Dive key closes on the dive — pull it and attack the pitch key.",
    pitch_rule: "Pitch key takes the QB — pitch. Pitch key widens with the pitch man — keep and get upfield.",
    decisions: [
      { reaction: "stays_home", action: "give" },
      { reaction: "tackles_dive", action: "keep" },
      { reaction: "attacks_qb", action: "pitch" },
      { reaction: "takes_pitch", action: "keep" },
    ],
  }),
  c({
    key: "speed_option",
    name: "Speed Option",
    kind: "option",
    aliases: ["speed", "speed op", "option pitch"],
    summary: "QB attacks the end man on the line with the pitch man trailing.",
    option_type: "speed",
    read_key: "playside_de",
    give_rule: "Pitch key comes at the QB — pitch it.",
    keep_rule: "Pitch key widens with the pitch man — keep it and get upfield inside him.",
    decisions: [
      { reaction: "attacks_qb", action: "pitch" },
      { reaction: "takes_pitch", action: "keep" },
      { reaction: "stays_home", action: "pitch" },
    ],
  }),
  c({
    key: "rpo_bubble",
    name: "RPO — Zone/Bubble",
    kind: "rpo",
    aliases: ["zone bubble", "bubble rpo", "rpo bubble"],
    summary: "Inside zone with a bubble to the slot. Read the apex defender.",
    option_type: "rpo",
    read_key: "playside_olb",
    routes: ["bubble"],
    presnap_read: "Count the box and find the apex defender over the slot. Numbers advantage outside means the bubble.",
    give_rule: "Apex stays out over the slot — hand it off.",
    keep_rule: "Apex fills the run — throw the bubble behind him.",
    decisions: [
      { reaction: "fits_run", action: "throw" },
      { reaction: "drops", action: "give" },
      { reaction: "stays_home", action: "give" },
    ],
    progression: [{ route: "bubble", trigger: "Apex fills the run — throw the bubble now." }],
  }),
  c({
    key: "rpo_glance",
    name: "RPO — Zone/Glance",
    kind: "rpo",
    aliases: ["glance rpo", "zone glance", "rpo slant", "zone slant"],
    summary: "Inside zone with a slant or glance behind the conflict linebacker.",
    option_type: "rpo",
    read_key: "playside_olb",
    routes: ["slant"],
    presnap_read: "Find the conflict linebacker. One-high safety helps the glance.",
    give_rule: "Linebacker drops into the window — hand it off.",
    keep_rule: "Linebacker steps up for the run — throw the slant behind him.",
    decisions: [
      { reaction: "fits_run", action: "throw" },
      { reaction: "drops", action: "give" },
    ],
    progression: [{ route: "slant", trigger: "Linebacker fills the run — throw the slant behind him." }],
  }),
];

export const LIBRARY_BY_KEY = new Map(CONCEPT_LIBRARY.map((x) => [x.key, x]));

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Merge team overrides over the library. */
export function teamConcepts(overrides: Record<string, Partial<Concept>>): Concept[] {
  const keys = new Set([...LIBRARY_BY_KEY.keys(), ...Object.keys(overrides)]);
  return [...keys].map((k) => ConceptSchema.parse({ ...(LIBRARY_BY_KEY.get(k) ?? {}), ...overrides[k], key: k }));
}

/** Find a concept by a name the AI or coach wrote. */
export function conceptByName(name: string | null | undefined, concepts: Concept[]): Concept | undefined {
  if (!name || name === UNKNOWN) return undefined;
  const n = norm(name);
  return concepts.find((c) => norm(c.name) === n || norm(c.key) === n || c.aliases.some((a) => norm(a) === n));
}

/** Recognize a pass concept from the routes in the play (one side must hold all signature routes). */
export function recognizeConcept(play: PlayData, concepts: Concept[]): Concept | undefined {
  const named = conceptByName(play.pass_details?.concept_name, concepts) ?? conceptByName(play.name, concepts);
  if (named) return named;
  // Words in the play call ("Trips Rt Smash") often name the concept.
  for (const word of play.name.split(/\s+/)) {
    const hit = conceptByName(word, concepts);
    if (hit) return hit;
  }
  const routesBySide: Record<string, string[]> = { left: [], right: [] };
  for (const p of play.players) {
    if (!p.route) continue;
    const side = p.x < 0 ? "left" : "right";
    routesBySide[side]!.push(normalizeRouteName(p.route.name));
  }
  for (const concept of concepts) {
    if (!concept.routes.length || concept.kind === "run") continue;
    for (const side of ["left", "right"]) {
      const have = [...routesBySide[side]!];
      const ok = concept.routes.every((r) => {
        const i = have.indexOf(r);
        if (i < 0) return false;
        have.splice(i, 1);
        return true;
      });
      if (ok) return concept;
    }
  }
  return undefined;
}

/** The player in this play who runs a given route (concept side first). */
export function playerRunning(play: PlayData, route: string): Player | undefined {
  const key = normalizeRouteName(route);
  return play.players.find((p) => p.route && normalizeRouteName(p.route.name) === key);
}

function resolveCarrier(play: PlayData, hint: string | null): string | null {
  if (!hint) return null;
  if (hint === "jet motion player") return play.motion?.player ?? null;
  const exact = play.players.find((p) => p.id === hint || p.position === hint);
  if (exact) return exact.id;
  const back = play.players.find((p) => /^(RB|TB|HB|F|B|R)$/.test(p.id) && p.y < -2);
  return back?.id ?? null;
}

/**
 * Fill a play's unknown fields from a concept. Only empty/unknown fields
 * are touched, unless `refresh` is set, in which case fields listed in
 * `from_concept` are rewritten too (a team edited the concept).
 */
export function applyConcept(play: PlayData, concept: Concept, opts: { refresh?: boolean; markSuggested?: boolean } = {}): PlayData {
  const markSuggested = opts.markSuggested ?? true;
  let out = structuredClone(play);
  out.concept_key = concept.key;
  const linked = new Set(out.from_concept);
  const suggested = new Set(out.suggested);
  const fill = (path: string, value: unknown) => {
    if (value == null) return;
    const cur = getPath(out, path);
    const empty = cur == null || isUnknown(cur) || (Array.isArray(cur) && cur.length === 0);
    if (!empty && !(opts.refresh && linked.has(path))) return;
    out = setPath(out, path, value);
    linked.add(path);
    if (markSuggested) suggested.add(path);
  };

  if (concept.kind === "pass" || concept.kind === "screen" || concept.kind === "rpo") {
    if (!out.pass_details) {
      out.pass_details = {
        concept_key: null,
        concept_name: UNKNOWN,
        protection: UNKNOWN,
        qb_drop: UNKNOWN,
        presnap_read: UNKNOWN,
        progression: [],
        hot_or_sight_adjustment: null,
        vs_coverage: { cover_0: null, cover_1: null, cover_2: null, cover_3: null, cover_4: null },
      };
    }
    out.pass_details.concept_key = concept.key;
    fill("pass_details.concept_name", concept.name);
    fill("pass_details.qb_drop", concept.qb_drop);
    fill("pass_details.presnap_read", concept.presnap_read);
    fill("pass_details.hot_or_sight_adjustment", concept.hot);
    const steps = concept.progression
      .map((s) => ({ player: playerRunning(out, s.route)?.id, trigger: s.trigger }))
      .filter((s): s is { player: string; trigger: string } => Boolean(s.player));
    if (steps.length) fill("pass_details.progression", steps);
    for (const cov of COVERAGES) {
      const a = concept.vs_coverage[cov];
      if (!a) continue;
      const target = a.route === "run" ? "run" : playerRunning(out, a.route)?.id;
      if (target) fill(`pass_details.vs_coverage.${cov}`, { target, why: a.why });
    }
  }
  if (concept.kind === "run" || concept.kind === "option" || concept.kind === "rpo") {
    if (concept.scheme || concept.ball_carrier) {
      if (!out.run_details) out.run_details = { point_of_attack: UNKNOWN, scheme: UNKNOWN, ball_carrier: UNKNOWN };
      fill("run_details.scheme", concept.scheme);
      fill("run_details.point_of_attack", concept.point_of_attack);
      fill("run_details.ball_carrier", resolveCarrier(out, concept.ball_carrier));
    }
  }
  if (concept.kind === "option" || concept.kind === "rpo") {
    if (!out.option_details) {
      out.option_details = {
        option_type: UNKNOWN,
        read_key: UNKNOWN,
        give_rule: UNKNOWN,
        keep_rule: UNKNOWN,
        pitch_or_pass_rule: null,
        decisions: [],
      };
    }
    fill("option_details.option_type", concept.option_type);
    fill("option_details.read_key", concept.read_key);
    fill("option_details.give_rule", concept.give_rule);
    fill("option_details.keep_rule", concept.keep_rule);
    fill("option_details.pitch_or_pass_rule", concept.pitch_rule);
    if (concept.decisions.length) fill("option_details.decisions", concept.decisions);
  }
  if (concept.coaching_points.length && out.coaching_points.length === 0) {
    out.coaching_points = [...concept.coaching_points];
    linked.add("coaching_points");
    if (markSuggested) suggested.add("coaching_points");
  }
  out.from_concept = [...linked];
  out.suggested = [...suggested];
  return out;
}

/** Concept key a play is linked to, if any. */
export function playConceptKey(play: PlayData): string | null {
  return play.concept_key ?? play.pass_details?.concept_key ?? null;
}

export type { Coverage };
