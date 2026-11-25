/**
 * Calling a play: what the coach says (or signals) for a call on the band.
 * "ALABAMA 37 BLUE BINGO": a code word for the formation, the band number,
 * and dummy words that mean nothing. Kept apart from wristband.ts so the
 * quizzes can use it (type-only imports from there).
 */
import type { Band, Calling, Wristband } from "./wristband";

/** The formation part and the play part of a call, "SPREAD RIGHT, SMASH" -> SPREAD RIGHT / SMASH. */
export function splitCall(name: string, formationHint?: string | null): { formation: string; play: string } {
  const call = name.replace(/\s+vs\.?\s+.*$/i, "").trim();
  if (call.includes(",")) {
    const i = call.lastIndexOf(",");
    return { formation: call.slice(0, i).trim().toUpperCase(), play: call.slice(i + 1).trim().toUpperCase() };
  }
  const hint = formationHint?.trim().toUpperCase() ?? "";
  const up = call.toUpperCase();
  if (hint && up.startsWith(hint + " ")) return { formation: hint, play: up.slice(hint.length).trim() };
  return { formation: hint, play: up };
}

/** The key a call's number is kept under: the play, or its concept (same number from any formation). */
export function callKey(playId: string, play: string, by: Wristband["numbersBy"]): string {
  return by === "concept" ? `c:${play.toUpperCase().replace(/\s+/g, " ").trim()}` : playId;
}

// ---------- grid and card styles ----------

/** A grid band's cell for a number: 1 is the first row's column 1, and on across. */
export function gridCell(n: string, band: Pick<Band, "gridRows" | "gridCols">): { row: string; col: number } | null {
  const v = Number(n);
  if (!/^\d+$/.test(n) || v < 1) return null;
  const r = Math.floor((v - 1) / band.gridCols);
  if (r >= band.gridRows.length) return null;
  return { row: band.gridRows[r]!, col: ((v - 1) % band.gridCols) + 1 };
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}
function hash(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const CARD_LETTERS = ["A", "B", "C"] as const;

/**
 * Cards A, B and C: the same calls under different numbers. Card A uses the
 * band numbers; B and C shuffle the same numbers (reshuffled by the band's seed).
 * Returns card letter -> (band number -> number on that card).
 */
export function cardNumbers(band: Pick<Band, "id" | "cards" | "cardSeed">, all: string[]): Record<string, Record<string, string>> {
  // in number order first, so the cards come out the same wherever they're worked out
  const numbers = [...new Set(all)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const out: Record<string, Record<string, string>> = {};
  for (const [i, letter] of CARD_LETTERS.slice(0, band.cards).entries()) {
    if (i === 0) {
      out[letter] = Object.fromEntries(numbers.map((n) => [n, n]));
      continue;
    }
    const rand = seeded(hash(band.id, band.cardSeed, letter));
    const shuffled = [...numbers];
    for (let k = shuffled.length - 1; k > 0; k--) {
      const j = Math.floor(rand() * (k + 1));
      [shuffled[k], shuffled[j]] = [shuffled[j]!, shuffled[k]!];
    }
    out[letter] = Object.fromEntries(numbers.map((n, k) => [n, shuffled[k]!]));
  }
  return out;
}

// ---------- saying a call ----------

export interface SaidPart {
  text: string;
  /** what it means to the players: "formation", "play", "dummy", "dead", "live" */
  kind: "formation" | "play" | "dummy" | "dead" | "live" | "card";
  means: string;
}

const pick = <T,>(a: readonly T[], rand: () => number): T | undefined => (a.length ? a[Math.floor(rand() * a.length)] : undefined);

/**
 * What the coach says for a call, part by part.
 * `number` is the band number; `word` the play's word (its play part or band name).
 */
export function sayCall(
  call: { formation: string; play: string; number: string | null; label?: string },
  band: Pick<Band, "style" | "gridRows" | "gridCols" | "id" | "cards" | "cardSeed" | "calling">,
  rand: () => number,
  opts: { allNumbers?: string[]; card?: string } = {},
): SaidPart[] | null {
  const c: Calling = band.calling;
  const parts: SaidPart[] = [];
  const what = call.label || call.play;
  if (c.formation !== "none" && call.formation) {
    const codes = c.codeWords[call.formation] ?? [];
    const text = c.formation === "code" && codes.length ? pick(codes, rand)! : call.formation;
    parts.push({ text: text.toUpperCase(), kind: "formation", means: text.toUpperCase() === call.formation ? "the formation" : `${call.formation} (the formation)` });
  }
  if (c.play === "word") {
    parts.push({ text: call.play, kind: "play", means: "the play" });
  } else {
    if (!call.number) return null;
    let num = call.number;
    if (band.style === "cards") {
      const letter = opts.card ?? "A";
      const map = cardNumbers(band, opts.allNumbers ?? [call.number]);
      num = map[letter]?.[call.number] ?? call.number;
      parts.push({ text: `CARD ${letter}`, kind: "card", means: `card ${letter} is live (usually signaled, not said)` });
    }
    if (band.style === "grid") {
      const cell = gridCell(call.number, band);
      if (!cell) return null;
      parts.push({ text: `${cell.row} ${cell.col}`, kind: "play", means: `row ${cell.row}, column ${cell.col}: ${what}` });
    } else {
      if (c.live.length) {
        // a dead word and a fake number first; only the number after the live word counts
        if (c.dead.length && rand() < 0.6) {
          parts.push({ text: `${pick(c.dead, rand)} ${10 + Math.floor(rand() * 89)}`, kind: "dead", means: "dead: doesn't count" });
        }
        parts.push({ text: pick(c.live, rand)!, kind: "live", means: "live: the next number counts" });
      }
      parts.push({ text: num, kind: "play", means: `${what} on ${band.style === "cards" ? `card ${opts.card ?? "A"}` : "the band"}` });
    }
  }
  // a dummy word never repeats a word that means something (a grid row, a live or dead word, a code word)
  const used = new Set([...parts.flatMap((p) => p.text.split(" ")), ...(band.style === "grid" ? band.gridRows : []), ...c.live, ...c.dead, ...Object.values(c.codeWords).flat()].map((x) => x.toUpperCase()));
  const pool = c.dummyWords.filter((w) => !used.has(w.toUpperCase()));
  for (let i = 0; i < c.dummies && pool.length; i++) {
    const w = pool.splice(Math.floor(rand() * pool.length), 1)[0]!;
    parts.push({ text: w.toUpperCase(), kind: "dummy", means: "a dummy word: means nothing" });
  }
  return parts;
}

/** The call as said: "ALABAMA 37 BLUE BINGO". Card letters are signaled, not said. */
export const saidText = (parts: SaidPart[]) =>
  parts
    .filter((p) => p.kind !== "card")
    .map((p) => p.text)
    .join(" ");

/** Why the call means what it means, for an answer's explanation. */
export function explainCall(parts: SaidPart[]): string {
  return parts.map((p) => `${p.text} = ${p.means}`).join(". ") + ".";
}

/** Signal keys a coach can fill in. */
export const signalKey = {
  formation: (f: string) => `f:${f.toUpperCase()}`,
  digit: (d: string) => `d:${d}`,
  word: (w: string) => `w:${w.toUpperCase()}`,
  card: (l: string) => `card:${l}`,
};
