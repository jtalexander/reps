/**
 * Quizzes built from the playbook library (concepts, formations, terms)
 * and the team's call system. Same rules as play quizzes: only approved
 * items, every answer comes from the coach's own data, every answer has an
 * explanation. Pure.
 */
import {
  composeCall,
  decodeCodeName,
  decodeWristband,
  flipCall,
  shuffledOrders,
  wristbandExamples,
  type CallSlot,
  type CallSystem,
} from "./calls";
import {
  RULE_SET_LABEL,
  TERM_CATEGORY_LABEL,
  formationAsPlay,
  spotOf,
  type ConceptItem,
  type FormationItem,
  type LibraryItem,
  type Rule,
  type TermItem,
} from "./library";
import { POSITION_GROUPS } from "./positions";
import { hashSeed, rng, type Choice, type Question, type QuizContext } from "./quiz";

export const LIBRARY_QUIZ_TYPES = [
  "concept_rule",
  "qb_read",
  "concept_signal",
  "tag_meaning",
  "formation_name",
  "formation_spot",
  "call_decode",
  "call_build",
  "cadence",
] as const;
export type LibraryQuizType = (typeof LIBRARY_QUIZ_TYPES)[number];

export const LIBRARY_QUIZ_LABEL: Record<LibraryQuizType, string> = {
  concept_rule: "My rules",
  qb_read: "QB reads",
  concept_signal: "Signals & code names",
  tag_meaning: "Tags & motions",
  formation_name: "Name the formation",
  formation_spot: "Where do I line up",
  call_decode: "Decode the call",
  call_build: "Build the call",
  cadence: "Cadence",
};

export interface LibEntry {
  id: string;
  item: LibraryItem;
}
export interface CallsEntry {
  id: string;
  system: CallSystem;
}
export interface LibContext extends QuizContext {
  library: LibEntry[];
  calls: CallsEntry | null;
}

// ---------- helpers ----------
function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
function choicesFrom(correct: string, pool: string[], rand: () => number, n = 4): { choices: Choice[]; answer: string } {
  const key = (s: string) => s.trim().toLowerCase();
  const distractors = shuffle([...new Map(pool.filter((p) => p && key(p) !== key(correct)).map((p) => [key(p), p])).values()], rand).slice(0, n - 1);
  const labels = shuffle([correct, ...distractors], rand);
  const choices = labels.map((label, i) => ({ id: `c${i}`, label }));
  return { choices, answer: choices.find((c) => c.label === correct)!.id };
}
/** First sentence, short enough for a button. */
function brief(s: string, max = 110): string {
  const first = s.split(/(?<=[.!?])\s+/)[0] ?? s;
  return first.length <= max ? first : first.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}
const concepts = (lib: LibEntry[]) => lib.filter((e) => e.item.kind === "concept") as Array<{ id: string; item: { kind: "concept"; data: ConceptItem } }>;
const formations = (lib: LibEntry[]) => lib.filter((e) => e.item.kind === "formation") as Array<{ id: string; item: { kind: "formation"; data: FormationItem } }>;
const terms = (lib: LibEntry[]) => lib.filter((e) => e.item.kind === "term") as Array<{ id: string; item: { kind: "term"; data: TermItem } }>;
const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());

const RECEIVERS = new Set([...POSITION_GROUPS.WR!, ...POSITION_GROUPS.TE!]);
const isQB = (ps: string[]) => ps.some((p) => p.toUpperCase() === "QB");

/** Rules in a concept that apply to a player who plays these positions. */
export function rulesFor(c: ConceptItem, positions: string[]): Rule[] {
  const ps = positions.map((p) => p.toUpperCase());
  const groups = Object.entries(POSITION_GROUPS)
    .filter(([, members]) => members.some((m) => ps.includes(m)))
    .map(([g]) => g);
  const receiver = ps.some((p) => RECEIVERS.has(p));
  const ol = groups.includes("OL");
  return c.rules.filter((r) => {
    const who = r.who.toUpperCase();
    if (ps.includes(who) || groups.includes(who)) return true;
    if (receiver && /^#\d$/.test(who)) return true;
    if (ol && /^(OL|LINE|OFFENSIVE LINE)$/.test(who)) return true;
    if (ps.some((p) => POSITION_GROUPS.RB!.includes(p)) && /^(RB|FB|TB|HB|F|B)$/.test(who)) return true;
    return false;
  });
}

function whoLabel(r: Rule): string {
  if (/^#\d$/.test(r.who)) return `${r.who}${r.set !== "all" ? ` on the ${RULE_SET_LABEL[r.set].toLowerCase()}` : ""}`;
  return r.who;
}

// ---------- generators ----------
type Gen = (entry: LibEntry | CallsEntry, ctx: LibContext, rand: () => number) => Question[];
const qid = (type: string, id: string, extra = "") => `${type}:${id}${extra ? ":" + extra : ""}`;

const conceptRule: Gen = (entry, ctx, rand) => {
  if (!("item" in entry) || entry.item.kind !== "concept") return [];
  const c = entry.item.data;
  const mine = rulesFor(c, ctx.positions);
  const all = concepts(ctx.library);
  return mine.slice(0, 4).map((r, i) => {
    const correct = brief(r.assignment);
    const pool = [
      ...c.rules.filter((x) => x !== r).map((x) => brief(x.assignment)),
      ...all.flatMap((o) => o.item.data.rules.filter((x) => x.who === r.who).map((x) => brief(x.assignment))),
    ];
    const { choices, answer } = choicesFrom(correct, pool, rand);
    return {
      id: qid("concept_rule", entry.id, String(i)),
      type: "concept_rule",
      playId: entry.id,
      prompt: `${title(c.name)}: you're ${whoLabel(r)}. What's your job?`,
      kind: "choice" as const,
      choices,
      answer,
      explanation: `${r.assignment}${r.coaching_points ? ` Coaching point: ${r.coaching_points}` : ""}`,
      diagram: null,
    };
  });
};

const qbRead: Gen = (entry, ctx, rand) => {
  if (!("item" in entry) || entry.item.kind !== "concept" || !isQB(ctx.positions)) return [];
  const c = entry.item.data;
  if (!c.qb_read.read) return [];
  const pool = concepts(ctx.library).map((o) => o.item.data.qb_read.read ?? "").concat(["Middle linebacker", "Free safety", "Playside corner", "Backside end"]);
  const { choices, answer } = choicesFrom(c.qb_read.read, pool, rand);
  return [
    {
      id: qid("qb_read", entry.id),
      type: "qb_read",
      playId: entry.id,
      prompt: `${title(c.name)}: who do you read?`,
      kind: "choice",
      choices,
      answer,
      explanation: `Read: ${c.qb_read.read}.${c.qb_read.danger ? ` Danger: ${c.qb_read.danger}.` : ""}`,
      diagram: null,
    },
  ];
};

const conceptSignal: Gen = (entry, ctx, rand) => {
  if (!("item" in entry) || entry.item.kind !== "concept") return [];
  const c = entry.item.data;
  const methods = ctx.calls?.system.methods ?? ["signals", "code_names"];
  const others = concepts(ctx.library).map((o) => title(o.item.data.name));
  const out: Question[] = [];
  if (c.signal && methods.includes("signals")) {
    const { choices, answer } = choicesFrom(title(c.name), others, rand);
    out.push({
      id: qid("concept_signal", entry.id, "signal"),
      type: "concept_signal",
      playId: entry.id,
      prompt: `The signal is: "${c.signal}". What's the play?`,
      kind: "choice",
      choices,
      answer,
      explanation: `"${c.signal}" = ${title(c.name)}.`,
      diagram: null,
    });
  }
  if (c.code_name && methods.includes("code_names")) {
    const { choices, answer } = choicesFrom(title(c.name), others, rand);
    out.push({
      id: qid("concept_signal", entry.id, "code"),
      type: "concept_signal",
      playId: entry.id,
      prompt: `Code name "${c.code_name}". What's the play?`,
      kind: "choice",
      choices,
      answer,
      explanation: `${c.code_name} = ${title(c.name)}.${c.signal ? ` Signal: ${c.signal}.` : ""}`,
      diagram: null,
    });
  }
  return out;
};

const tagMeaning: Gen = (entry, ctx, rand) => {
  if (!("item" in entry)) return [];
  const pool = [
    ...terms(ctx.library).map((t) => brief(t.item.data.meaning)),
    ...concepts(ctx.library).flatMap((c) => c.item.data.tags.map((t) => brief(t.meaning))),
  ];
  if (entry.item.kind === "term") {
    const t = entry.item.data;
    const { choices, answer } = choicesFrom(brief(t.meaning), pool, rand);
    return [
      {
        id: qid("tag_meaning", entry.id),
        type: "tag_meaning",
        playId: entry.id,
        prompt: `${TERM_CATEGORY_LABEL[t.category]} "${t.name}": what does it tell you?`,
        kind: "choice",
        choices,
        answer,
        explanation: `${t.name}: ${t.meaning}${t.example ? ` Example: ${t.example}.` : ""}`,
        diagram: null,
      },
    ];
  }
  if (entry.item.kind === "concept") {
    const c = entry.item.data;
    return c.tags.slice(0, 3).map((t, i) => {
      const call = c.example_calls.find((x) => x.toUpperCase().includes(t.name.toUpperCase()));
      const { choices, answer } = choicesFrom(brief(t.meaning), pool, rand);
      return {
        id: qid("tag_meaning", entry.id, String(i)),
        type: "tag_meaning",
        playId: entry.id,
        prompt: call ? `"${call}": what does ${t.name} tell you?` : `${title(c.name)} ${t.name}: what does ${t.name} tell you?`,
        kind: "choice" as const,
        choices,
        answer,
        explanation: `${t.name}: ${t.meaning}`,
        diagram: null,
      };
    });
  }
  return [];
};

const formationName: Gen = (entry, ctx, rand) => {
  if (!("item" in entry) || entry.item.kind !== "formation") return [];
  const f = entry.item.data;
  const pool = formations(ctx.library)
    .filter((o) => o.id !== entry.id)
    .sort((a, b) => Number(b.item.data.family === f.family) - Number(a.item.data.family === f.family))
    .map((o) => o.item.data.name)
    .slice(0, 10)
    .concat([flipCall(f.name)]);
  const { choices, answer } = choicesFrom(f.name, pool, rand);
  return [
    {
      id: qid("formation_name", entry.id),
      type: "formation_name",
      playId: entry.id,
      prompt: "Name this formation.",
      kind: "choice",
      choices,
      answer,
      explanation: `${f.name}${f.family ? ` (${f.family})` : ""}.`,
      diagram: { playId: entry.id, flip: false, hide: "all" },
    },
  ];
};

const formationSpot: Gen = (entry, ctx, rand) => {
  if (!("item" in entry) || entry.item.kind !== "formation") return [];
  const f = entry.item.data;
  const ps = ctx.positions.map((p) => p.toUpperCase());
  const me = f.players.filter((p) => ps.includes(p.id) && !/^(LT|LG|C|RG|RT)$/.test(p.id));
  return me.slice(0, 1).map((p) => {
    const correct = spotOf(p, f.players);
    const pool = [
      ...f.players.filter((o) => o !== p && !/^(LT|LG|C|RG|RT)$/.test(o.id)).map((o) => spotOf(o, f.players)),
      ...formations(ctx.library).flatMap((o) => o.item.data.players.filter((x) => x.id === p.id).map((x) => spotOf(x, o.item.data.players))),
    ];
    const { choices, answer } = choicesFrom(correct, pool, rand);
    return {
      id: qid("formation_spot", entry.id, p.id),
      type: "formation_spot",
      playId: entry.id,
      prompt: `${f.name}: where do you line up, ${p.id}?`,
      kind: "choice" as const,
      choices,
      answer,
      explanation: `${p.id} in ${f.name}: ${correct}.`,
      diagram: null,
    };
  });
};

// ---- call system (one entry per team, the approved "calls" row) ----
const callDecode: Gen = (entry, ctx, rand) => {
  if (!("system" in entry)) return [];
  const sys = entry.system;
  const out: Question[] = [];
  if (sys.methods.includes("wristband")) {
    for (const band of sys.wristbands) {
      const ex = shuffle(wristbandExamples(band), rand).slice(0, 3);
      const allCalls = wristbandExamples(band, 80).map((e) => e.decoded.call);
      for (const [i, e] of ex.entries()) {
        const pool = [...allCalls, flipCall(e.decoded.call)];
        const { choices, answer } = choicesFrom(e.decoded.call, pool, rand);
        out.push({
          id: qid("call_decode", entry.id, `${band.id}-${i}-${e.spoken}`),
          type: "call_decode",
          playId: entry.id,
          prompt: `${band.name} wristband: the call is "${e.spoken}". What do we run?`,
          kind: "choice",
          choices,
          answer,
          explanation: e.decoded.steps.join(". ") + ".",
          diagram: null,
        });
        if (e.decoded.snap && sys.methods.includes("cadence")) {
          const snaps = [...new Set(Object.values(band.snap_by_last_digit))];
          const { choices: sc, answer: sa } = choicesFrom(e.decoded.snap, snaps, rand);
          out.push({
            id: qid("call_decode", entry.id, `${band.id}-${i}-snap-${e.spoken}`),
            type: "call_decode",
            playId: entry.id,
            prompt: `"${e.spoken}": what's the snap count?`,
            kind: "choice",
            choices: sc,
            answer: sa,
            explanation: e.decoded.steps.filter((s) => /snap/i.test(s)).join(". ") + ".",
            diagram: null,
          });
        }
      }
    }
  }
  if (sys.methods.includes("code_names")) {
    const names = concepts(ctx.library)
      .filter((c) => c.item.data.code_name)
      .map((c) => ({ code: c.item.data.code_name!, concept: c.item.data.name }));
    for (const n of shuffle(names, rand).slice(0, 2)) {
      const dir = sys.direction_words.length ? sys.direction_words[Math.floor(rand() * sys.direction_words.length)]! : null;
      const spoken = `${sys.audible_word ? `${sys.audible_word}, ${sys.audible_word}… ` : ""}${n.code}${dir ? ` ${dir.word}` : ""}`;
      const d = decodeCodeName(`${n.code}${dir ? ` ${dir.word}` : ""}`, sys, names);
      if (!d) continue;
      const pool = [flipCall(d.call), ...names.map((x) => (dir ? `${x.concept.toUpperCase()} ${dir.side.toUpperCase()}` : x.concept.toUpperCase()))];
      const { choices, answer } = choicesFrom(d.call, pool, rand);
      out.push({
        id: qid("call_decode", entry.id, `code-${n.code}-${dir?.word ?? ""}`),
        type: "call_decode",
        playId: entry.id,
        prompt: `Audible: "${spoken}". What do we run?`,
        kind: "choice",
        choices,
        answer,
        explanation: d.steps.join(". ") + ".",
        diagram: null,
      });
    }
  }
  if (sys.methods.includes("direction_words") && sys.direction_words.length) {
    const w = sys.direction_words[Math.floor(rand() * sys.direction_words.length)]!;
    const choices = [
      { id: "left", label: "Left" },
      { id: "right", label: "Right" },
    ];
    out.push({
      id: qid("call_decode", entry.id, `dir-${w.word}`),
      type: "call_decode",
      playId: entry.id,
      prompt: `Direction word "${w.word}": which way?`,
      kind: "choice",
      choices,
      answer: w.side,
      explanation: `${w.word} = ${w.side}. ${sys.direction_words.filter((d) => d.side === w.side).map((d) => d.word).join(", ")} all mean ${w.side}.`,
      diagram: null,
    });
  }
  return out;
};

const callBuild: Gen = (entry, ctx, rand) => {
  if (!("system" in entry) || !entry.system.methods.includes("verbal")) return [];
  const sys = entry.system;
  const fs = formations(ctx.library);
  const cs = concepts(ctx.library);
  if (!fs.length || !cs.length) return [];
  const fTags = terms(ctx.library).filter((t) => t.item.data.category === "formation_tag");
  const out: Question[] = [];
  for (let i = 0; i < 2; i++) {
    const f = fs[Math.floor(rand() * fs.length)]!.item.data;
    const c = cs[Math.floor(rand() * cs.length)]!.item.data;
    const parts = {
      formation: f.name,
      formation_tag: sys.order.includes("formation_tag") && fTags.length && rand() < 0.5 ? fTags[Math.floor(rand() * fTags.length)]!.item.data.name : undefined,
      concept: c.name,
      direction: sys.order.includes("direction") && c.family === "run" ? (rand() < 0.5 ? "left" : "right") : undefined,
      concept_tag: sys.order.includes("concept_tag") && c.tags.length && rand() < 0.5 ? c.tags[0]!.name : undefined,
    } as const;
    const right = composeCall(parts, sys.order as CallSlot[]);
    const wrong = shuffledOrders(parts, sys.order as CallSlot[]);
    if (wrong.length < 1) continue;
    const { choices, answer } = choicesFrom(right, wrong, rand);
    const ask = [
      `formation ${title(f.name)}`,
      parts.formation_tag && `tag ${parts.formation_tag}`,
      `play ${title(c.name)}${parts.direction ? ` to the ${parts.direction}` : ""}`,
      parts.concept_tag && `with ${parts.concept_tag}`,
    ]
      .filter(Boolean)
      .join(", ");
    out.push({
      id: qid("call_build", entry.id, String(i) + right),
      type: "call_build",
      playId: entry.id,
      prompt: `Make the call: ${ask}.`,
      kind: "choice",
      choices,
      answer,
      explanation: `We call it in this order: ${sys.order.join(" → ").replace(/_/g, " ")}. So: ${right}.`,
      diagram: null,
    });
  }
  return out;
};

const cadence: Gen = (entry, _ctx, rand) => {
  if (!("system" in entry) || !entry.system.methods.includes("cadence")) return [];
  const cads = entry.system.cadences;
  if (cads.length < 2) return [];
  return shuffle(cads, rand)
    .slice(0, 2)
    .map((c) => {
      const { choices, answer } = choicesFrom(c.call, cads.map((x) => x.call), rand);
      return {
        id: qid("cadence", entry.id, c.name),
        type: "cadence",
        playId: entry.id,
        prompt: `What's the snap call for ${c.name}?`,
        kind: "choice" as const,
        choices,
        answer,
        explanation: `${c.name}: "${c.call}"${c.when ? ` — ${c.when}` : ""}.`,
        diagram: null,
      };
    });
};

const GENERATORS: Record<LibraryQuizType, Gen> = {
  concept_rule: conceptRule,
  qb_read: qbRead,
  concept_signal: conceptSignal,
  tag_meaning: tagMeaning,
  formation_name: formationName,
  formation_spot: formationSpot,
  call_decode: callDecode,
  call_build: callBuild,
  cadence,
};

export function libraryTypesForPositions(positions: string[]): LibraryQuizType[] {
  const types: LibraryQuizType[] = ["concept_rule", "concept_signal", "tag_meaning", "formation_name", "formation_spot", "call_decode", "call_build", "cadence"];
  if (isQB(positions)) types.push("qb_read");
  return types;
}

export function libraryQuestionsFor(type: LibraryQuizType, entry: LibEntry | CallsEntry, ctx: LibContext, seed: number): Question[] {
  return GENERATORS[type](entry, ctx, rng(hashSeed(seed, type, entry.id)));
}

/** Every (entry, type) pair this player can be quizzed on. */
export function libraryCandidates(ctx: LibContext, types = libraryTypesForPositions(ctx.positions)) {
  const out: Array<{ playId: string; type: LibraryQuizType }> = [];
  const entries: Array<LibEntry | CallsEntry> = [...ctx.library, ...(ctx.calls ? [ctx.calls] : [])];
  for (const e of entries)
    for (const t of types) if (libraryQuestionsFor(t, e, ctx, 1).length) out.push({ playId: e.id, type: t });
  return out;
}

/** Formation items render as plays for diagrams. */
export function libraryDiagram(item: LibraryItem) {
  return item.kind === "formation" ? formationAsPlay(item.data) : null;
}
