/**
 * Matchups: what a play is good against. An offensive play is tagged with the
 * defenses it beats (Cover 2, man, blitz, an odd front...); a defensive call
 * with the offenses it stops (Trips, the run, Smash...). RepWon suggests tags
 * from the play's concept and from what the playbook says ("good vs Cover 3");
 * the coach keeps or drops each one, and can add his own.
 *
 * Tags are short keys: a shared word ("cover_2", "trips"), a concept
 * ("c:smash"), or the coach's own words ("x:Cover 6").
 */
import { COVERAGES, type PlayData } from "./play";
import type { Concept } from "./concepts";

export type Side = "offense" | "defense";

export interface Look {
  key: string;
  label: string;
  group: string;
}

/** What an offensive play can be good against. */
export const DEFENSE_LOOKS: Look[] = [
  ...COVERAGES.map((c) => ({ key: c, label: `Cover ${c.slice(-1)}`, group: "Coverage" })),
  { key: "man", label: "Man", group: "Coverage" },
  { key: "zone", label: "Zone", group: "Coverage" },
  { key: "blitz", label: "Blitz", group: "Pressure" },
  { key: "even", label: "Even front (4 down)", group: "Front" },
  { key: "odd", label: "Odd front (3 or 5 down)", group: "Front" },
  { key: "loaded_box", label: "Loaded box", group: "Front" },
  { key: "light_box", label: "Light box", group: "Front" },
];

/** What a defensive call can be good against. */
export const OFFENSE_LOOKS: Look[] = [
  { key: "run", label: "The run", group: "Plays" },
  { key: "pass", label: "The pass", group: "Plays" },
  { key: "option", label: "Option", group: "Plays" },
  { key: "screen", label: "Screens", group: "Plays" },
  { key: "play_action", label: "Play action", group: "Plays" },
  { key: "trips", label: "Trips (3x1)", group: "Formations" },
  { key: "2x2", label: "2x2", group: "Formations" },
  { key: "empty", label: "Empty", group: "Formations" },
  { key: "bunch", label: "Bunch or stack", group: "Formations" },
  { key: "heavy", label: "Heavy (2 TE, I-form, wing)", group: "Formations" },
  { key: "spread", label: "Spread", group: "Formations" },
  { key: "motion", label: "Motion", group: "Formations" },
];

export const looksFor = (side: Side) => (side === "offense" ? DEFENSE_LOOKS : OFFENSE_LOOKS);
const LOOK_BY_KEY = new Map([...DEFENSE_LOOKS, ...OFFENSE_LOOKS].map((l) => [l.key, l]));

/** How a tag reads: the shared label, the concept's name, or the coach's own words. */
export function lookLabel(key: string, concepts: Pick<Concept, "key" | "name">[] = []): string {
  if (key.startsWith("x:")) return key.slice(2);
  if (key.startsWith("c:")) return concepts.find((c) => c.key === key.slice(2))?.name ?? key.slice(2).replace(/_/g, " ");
  return LOOK_BY_KEY.get(key)?.label ?? key;
}

/** A coach's own tag from what he typed ("cover 6" -> "x:Cover 6"), or the shared one it matches. */
export function customLook(text: string, side: Side): string | null {
  const t = text.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!t) return null;
  const known = looksFor(side).find((l) => l.label.toLowerCase() === t.toLowerCase() || l.key === t.toLowerCase().replace(/ /g, "_"));
  if (known) return known.key;
  const read = readLooks(`good vs ${t}`, side);
  return read.length === 1 ? read[0]! : `x:${t.charAt(0).toUpperCase()}${t.slice(1)}`;
}

/**
 * What each concept is usually built to beat, as a starting point. Every
 * coach runs things his own way; these are only suggestions he keeps or drops.
 */
export const CONCEPT_BEATS: Record<string, string[]> = {
  smash: ["cover_2", "zone"],
  slant_flat: ["cover_3", "man"],
  stick: ["cover_3", "zone"],
  flood: ["cover_3"],
  mesh: ["man", "cover_1", "cover_0", "blitz"],
  four_verts: ["cover_3", "cover_1"],
  curl_flat: ["cover_3"],
  levels: ["cover_3", "cover_4", "zone"],
  screen: ["blitz", "man"],
  inside_zone: ["even", "light_box"],
  outside_zone: ["light_box"],
  power: ["odd"],
  counter: ["blitz"],
  jet_sweep: ["loaded_box"],
  dive: ["light_box"],
  zone_read: ["even", "light_box"],
  triple_option: ["man"],
  speed_option: ["loaded_box", "man"],
  rpo_bubble: ["loaded_box"],
  rpo_glance: ["cover_3", "loaded_box"],
};

/** What a defensive call is usually good against, from its coverage and pressure. */
const COVERAGE_STOPS: Record<string, string[]> = {
  cover_0: ["run"],
  cover_1: ["run", "play_action"],
  cover_2: ["pass"],
  cover_3: ["run", "pass"],
  cover_4: ["pass", "2x2"],
};

/** Sentences that say what a play is good against: "Good vs Cover 3", "Use it against Trips", "Beats man". */
const SAYS_GOOD = /\b(good|great|best|works?|use[sd]?|beats?|attacks?|effective|designed|built|strong|killer|money)\b[^.;\n]*?\b(vs\.?|versus|against|beats?|attacks?)\b([^.;\n]*)/i;

/** The tags a piece of text names, for one side. */
export function readLooks(text: string, side: Side): string[] {
  const out = new Set<string>();
  const t = ` ${text.toLowerCase()} `;
  const has = (re: RegExp) => re.test(t);
  if (side === "offense") {
    for (const m of t.matchAll(/cover(?:age)?[\s-]*([0-4])\b/g)) out.add(`cover_${m[1]}`);
    // "man" coverage, not the count in an "8-man box"
    if (has(/(?<![\w-]|\d\s)\b(man|man[- ]to[- ]man|press)\b(?![- ]?box)/)) out.add("man");
    if (has(/\bzone\b/)) out.add("zone");
    if (has(/\b(blitz\w*|pressure|all[- ]out)\b/)) out.add("blitz");
    if (has(/\b(4-3|4-4|4-2|6-2|even)\b/)) out.add("even");
    if (has(/\b(3-4|3-3|5-2|5-3|odd)\b/)) out.add("odd");
    if (has(/\b(8|eight|9|nine)[- ]man\b|\bloaded\b|\bstacked box\b|\bcrowded box\b/)) out.add("loaded_box");
    if (has(/\blight box\b|\b(5|five|6|six)[- ]man box\b/)) out.add("light_box");
  } else {
    if (has(/\b(trips|3x1|3 x 1)\b/)) out.add("trips");
    if (has(/\b(2x2|2 x 2|doubles|deuce)\b/)) out.add("2x2");
    if (has(/\bempty\b/)) out.add("empty");
    if (has(/\b(bunch|stack|cluster)\b/)) out.add("bunch");
    if (has(/\b(i[- ]form\w*|heavy|jumbo|wing[- ]?t|2 te|two tight)\b/)) out.add("heavy");
    if (has(/\b(spread|shotgun)\b/)) out.add("spread");
    if (has(/\bmotion\b/)) out.add("motion");
    if (has(/\b(run|runs|running game|sweep|power|dive)\b/)) out.add("run");
    if (has(/\b(pass|passing|drop[- ]back)\b/)) out.add("pass");
    if (has(/\b(option|veer|triple)\b/)) out.add("option");
    if (has(/\bscreens?\b/)) out.add("screen");
    if (has(/\bplay[- ]action\b/)) out.add("play_action");
  }
  return [...out];
}

/** Tags the playbook's own words give a play: only sentences that say it's good against something. */
export function looksFromText(lines: string[], side: Side): string[] {
  const out = new Set<string>();
  for (const line of lines) {
    const m = line.match(SAYS_GOOD);
    if (m) for (const k of readLooks(m[3] ?? "", side)) out.add(k);
  }
  return [...out];
}

export interface Suggestion {
  key: string;
  /** "concept" (RepWon's usual), "playbook" (the playbook says so) */
  from: "concept" | "playbook";
}

/** RepWon's suggestions for a play: from what the playbook says, then from its concept or coverage. */
export function suggestLooks(data: PlayData, side: Side, pageText: string[], conceptKey: string | null): Suggestion[] {
  const out = new Map<string, Suggestion>();
  for (const k of looksFromText([...pageText, ...data.coaching_points, data.name], side)) out.set(k, { key: k, from: "playbook" });
  if (side === "offense" && conceptKey) for (const k of CONCEPT_BEATS[conceptKey] ?? []) if (!out.has(k)) out.set(k, { key: k, from: "concept" });
  if (side === "defense") {
    const cov = data.defense?.coverage?.toLowerCase().match(/cover[\s-]*([0-4])/)?.[1];
    for (const k of cov ? (COVERAGE_STOPS[`cover_${cov}`] ?? []) : []) if (!out.has(k)) out.set(k, { key: k, from: "concept" });
  }
  return [...out.values()];
}

export interface GoodVs {
  /** tags the coach kept or added */
  yes: string[];
  /** suggestions the coach dropped (not suggested again) */
  no: string[];
}

export const EMPTY_GOOD_VS: GoodVs = { yes: [], no: [] };

/** Keep or drop one tag. */
export function setLook(g: GoodVs | null | undefined, key: string, on: boolean): GoodVs {
  const cur = g ?? EMPTY_GOOD_VS;
  return on ? { yes: [...new Set([...cur.yes, key])], no: cur.no.filter((k) => k !== key) } : { yes: cur.yes.filter((k) => k !== key), no: [...new Set([...cur.no, key])] };
}
