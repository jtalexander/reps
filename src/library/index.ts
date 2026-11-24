/** The whole Football basics library, in the order the library page shows it. */
import { GENERAL } from "./general";
import { OFFENSE } from "./offense";
import { DEFENSE } from "./defense";
import { SPECIAL } from "./special";
import type { LibTopic } from "./types";

export const LIBRARY: LibTopic[] = [...GENERAL, ...OFFENSE, ...DEFENSE, ...SPECIAL];
export const LIBRARY_BY_KEY = new Map(LIBRARY.map((t) => [t.key, t]));

export const SIDE_LABEL = { general: "Everyone", offense: "Offense", defense: "Defense", special: "Special teams" } as const;
export const CATEGORY_LABEL = { concepts: "Concepts", technique: "Technique", rules: "Rules" } as const;
