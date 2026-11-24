/**
 * Football basics: a built-in library of lessons and quizzes every team can
 * switch on (offense, defense and special teams; concepts and technique).
 * It's written here in code, reviewed like code, and copied into a team as
 * approved Teach topics when the coach adds it. No AI runs for it.
 */
import type { Level } from "@/domain/readiness";
import type { Audience } from "@/teach/types";

export type Side = "general" | "offense" | "defense" | "special";
export type Category = "concepts" | "technique" | "rules";

/**
 * A small field drawing. Coordinates are yards with the ball at (0, 0):
 * x to the right as the offense faces up the field, y downfield. Offense is
 * at y <= 0 (backfield negative), defense at y > 0.
 */
export interface Dot {
  label: string;
  x: number;
  y: number;
  side: "o" | "d";
  /** draw this player highlighted (the one the question is about) */
  hi?: boolean;
}
export interface Line {
  /** two or more points, in yards */
  pts: [number, number][];
  /** route/run = solid arrow, block = solid with a T end, motion/read = dashed */
  kind: "route" | "run" | "block" | "motion" | "read" | "path";
  side?: "o" | "d";
}
export interface Zone {
  label: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
}
export interface Note {
  text: string;
  x: number;
  y: number;
}
export interface Diagram {
  dots: Dot[];
  lines?: Line[];
  zones?: Zone[];
  notes?: Note[];
  /** draw the line of scrimmage (default true) */
  los?: boolean;
}

/** One place where coaches teach it differently; the coach picks an option per team. */
export interface LibStyle {
  key: string;
  /** what the coach is choosing, e.g. "How does your defensive end play a pulling guard?" */
  question: string;
  options: { key: string; label: string; summary: string }[];
}

interface Common {
  /** only for teams at or above this level (default: the topic's level) */
  minLevel?: Level;
  /** "styleKey:optionKey": include only when the team picked that option */
  style?: string;
  diagram?: Diagram;
}

export interface LibLesson extends Common {
  audience: Audience;
  title: string;
  /** plain text; lines starting with "- " are bullets; blank line = new paragraph */
  body: string;
}

export type LibQuestionData =
  | { kind: "choice"; choices: { id: string; text: string }[]; answer: string }
  | { kind: "order"; items: string[] }
  | { kind: "open"; modelAnswer: string; keyPoints: string[] };

export interface LibQuestion extends Common {
  audience: Audience[];
  prompt: string;
  data: LibQuestionData;
  explanation: string;
  /** a must-know question (core); the rest are extra practice */
  core?: boolean;
}

export interface LibTopic {
  /** stable id; never change it once published */
  key: string;
  /** bump when the content changes so teams can update */
  version: number;
  side: Side;
  category: Category;
  name: string;
  summary: string;
  /** youngest level this topic is for */
  level: Level;
  /** who it's mainly for (shown on the library page) */
  for: Audience[];
  styles?: LibStyle[];
  lessons: LibLesson[];
  questions: LibQuestion[];
}
