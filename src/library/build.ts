/**
 * Helpers for writing library content by hand: lessons and the three
 * question kinds. Choices are put in a fixed, scrambled order (from the
 * prompt), so the right answer isn't always first.
 */
import type { Audience } from "@/teach/types";
import type { Diagram, LibLesson, LibQuestion } from "./types";
import type { Level } from "@/domain/readiness";

type Opts = { minLevel?: Level; style?: string; diagram?: Diagram; core?: boolean };

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** A lesson. Body: plain text; "- " lines are bullets; a blank line starts a new paragraph. */
export function lesson(audience: Audience, title: string, body: string, opts: Omit<Opts, "core"> = {}): LibLesson {
  return { audience, title, body: body.trim(), ...opts };
}

/** Multiple choice: the right answer, then 2-3 wrong ones. */
export function choice(audience: Audience | Audience[], prompt: string, right: string, wrong: string[], explanation: string, opts: Opts = {}): LibQuestion {
  const all = [right, ...wrong].map((text, i) => ({ id: `c${i}`, text }));
  let seed = hash(prompt);
  for (let i = all.length - 1; i > 0; i--) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
    const j = seed % (i + 1);
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return { audience: list(audience), prompt, data: { kind: "choice", choices: all, answer: "c0" }, explanation, ...opts };
}

/** True or false, as a two-choice question. */
export function trueFalse(audience: Audience | Audience[], statement: string, isTrue: boolean, explanation: string, opts: Opts = {}): LibQuestion {
  return {
    audience: list(audience),
    prompt: `True or false: ${statement}`,
    data: { kind: "choice", choices: [{ id: "t", text: "True" }, { id: "f", text: "False" }], answer: isTrue ? "t" : "f" },
    explanation,
    ...opts,
  };
}

/** Put these in order (items given in the right order; players see them shuffled). */
export function order(audience: Audience | Audience[], prompt: string, items: string[], explanation: string, opts: Opts = {}): LibQuestion {
  return { audience: list(audience), prompt, data: { kind: "order", items }, explanation, ...opts };
}

/** In your own words; graded against the key points. Keep key points short and concrete. */
export function open(audience: Audience | Audience[], prompt: string, modelAnswer: string, keyPoints: string[], explanation: string, opts: Opts = {}): LibQuestion {
  return { audience: list(audience), prompt, data: { kind: "open", modelAnswer, keyPoints }, explanation, ...opts };
}

const list = (a: Audience | Audience[]) => (Array.isArray(a) ? a : [a]);
