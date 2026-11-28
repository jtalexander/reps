/**
 * Scoring the formation rules against a person's answers, one field at a
 * time (never one blended number), and finding how much position error the
 * rules can take before their answers change.
 */
import type { FieldSpec, PlayPoint } from "@/shared/field";
import { formationKey } from "@/shared/football";
import { readFormation, type FormationRead } from "../rules/formation";
import { matchFormation, type FormationMatch, type NamedLineup } from "../rules/match";
import { solveFrame, type Expected, type MarkedFrame } from "./types";

export const FIELDS = ["formation", "shape", "strength", "qb", "backs", "personnel"] as const;
export type Field = (typeof FIELDS)[number];
export const FIELD_LABEL: Record<Field, string> = {
  formation: "Formation name",
  shape: "Receivers (shape)",
  strength: "Strength",
  qb: "Quarterback",
  backs: "Backs",
  personnel: "Personnel",
};

export interface FrameRead {
  read: FormationRead;
  match: FormationMatch | null;
}

export function readPlayers(offense: PlayPoint[], formations: NamedLineup[]): FrameRead {
  const read = readFormation(offense);
  return { read, match: matchFormation(read.players, formations) };
}

/** What the rules said for each field, as the plain value a person's answer is compared with. */
export function answers(r: FrameRead): Record<Field, string | null> {
  return { formation: r.match?.name ?? null, shape: r.read.shape, strength: r.read.strength, qb: r.read.qb, backs: r.read.backs, personnel: r.read.personnel };
}

export function confidences(r: FrameRead): Record<Field, number> {
  return { formation: r.match?.confidence ?? 0, ...r.read.confidence };
}

/** Whether the rules' answer for a field is the person's answer (formation names compare without case or punctuation). */
export const same = (field: Field, got: string | null, want: string) => (field === "formation" ? formationKey(got ?? "") === formationKey(want) : (got ?? "").trim().toLowerCase() === want.trim().toLowerCase());

export interface Miss {
  frame: string;
  got: string | null;
  expected: string;
  confidence: number;
}
export interface FieldScore {
  field: Field;
  right: number;
  wrong: number;
  /** frames with no answer from a person for this field */
  unverified: number;
  misses: Miss[];
}
export interface Report {
  frames: number;
  /** frames that couldn't be put in yards, and why */
  unsolved: Array<{ frame: string; reason: string }>;
  fields: FieldScore[];
}

/** Per-field right and wrong counts over every frame a person answered. */
export function score(frames: MarkedFrame[], spec: FieldSpec, formations: NamedLineup[]): Report {
  const fields: FieldScore[] = FIELDS.map((field) => ({ field, right: 0, wrong: 0, unverified: 0, misses: [] }));
  const unsolved: Report["unsolved"] = [];
  frames.forEach((frame, i) => {
    const name = frame.label || `Frame ${i + 1}`;
    const solved = solveFrame(frame, spec);
    if (!solved.ok) return void unsolved.push({ frame: name, reason: solved.reason });
    const r = readPlayers(solved.offense, formations);
    const got = answers(r);
    const conf = confidences(r);
    for (const f of fields) {
      const want = frame.expected[f.field as keyof Expected];
      if (!want) f.unverified++;
      else if (same(f.field, got[f.field], want)) f.right++;
      else {
        f.wrong++;
        f.misses.push({ frame: name, got: got[f.field], expected: want, confidence: conf[f.field] });
      }
    }
  });
  return { frames: frames.length, unsolved, fields };
}

/** A repeatable random number source (so a noise run can be reproduced). */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface NoiseLevel {
  /** typical error added to each player, yards: side to side and along the field */
  sigmaX: number;
  sigmaY: number;
}
export interface NoiseResult extends NoiseLevel {
  /** share of noisy readings that gave the same answer as the clean reading, per field */
  held: Record<Field, number>;
}

/**
 * Shake every player's spot by a random error and read the formation again,
 * many times. The share of readings that still agree with the clean one says
 * how accurate player positions must be for each field. Sideline film is
 * expected to be worse side to side than along the field, so the two errors
 * are set separately.
 */
export function sensitivity(lineups: PlayPoint[][], formations: NamedLineup[], levels: NoiseLevel[], trials = 200, seed = 1): NoiseResult[] {
  const rand = seeded(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const clean = lineups.map((l) => answers(readPlayers(l, formations)));
  return levels.map((level) => {
    const agree = Object.fromEntries(FIELDS.map((f) => [f, 0])) as Record<Field, number>;
    let total = 0;
    lineups.forEach((lineup, i) => {
      for (let t = 0; t < trials; t++) {
        const noisy = lineup.map((p) => ({ x: p.x + gauss() * level.sigmaX, y: p.y + gauss() * level.sigmaY }));
        const got = answers(readPlayers(noisy, formations));
        for (const f of FIELDS) if (got[f] === clean[i]![f]) agree[f]++;
        total++;
      }
    });
    return { ...level, held: Object.fromEntries(FIELDS.map((f) => [f, total ? agree[f] / total : 0])) as Record<Field, number> };
  });
}
