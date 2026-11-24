/**
 * Football basics in a team: adding a library topic copies its lessons and
 * questions in as an approved Teach topic (for the team's level and style
 * picks), so players study and get quizzed on it like any other topic.
 * Removing archives it; changing a style or a newer library version rewrites
 * it (old questions are kept as rejected so players' answers stay on record).
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, type Db } from "@/db";
import { teams } from "@/db/schema";
import { lessons, questions, topics } from "@/db/teach-schema";
import { LEVELS, type Level } from "@/domain/readiness";
import { topicKey } from "@/teach/service";
import { LIBRARY, LIBRARY_BY_KEY } from "./index";
import type { LibLesson, LibQuestion, LibStyle, LibTopic } from "./types";

const levelIdx = (l: Level) => LEVELS.indexOf(l);

/** Library topics a team at this level can use. */
export const topicsFor = (level: Level) => LIBRARY.filter((t) => levelIdx(t.level) <= levelIdx(level));

/** The option a team uses for a style (its pick, or the first option). */
export const styleChoice = (style: LibStyle, picks: Record<string, string>) => (style.options.some((o) => o.key === picks[style.key]) ? picks[style.key]! : style.options[0]!.key);

/** Every style in the library, once (the same key can appear in several topics). */
export function allStyles(): LibStyle[] {
  const seen = new Map<string, LibStyle>();
  for (const t of LIBRARY) for (const s of t.styles ?? []) if (!seen.has(s.key)) seen.set(s.key, s);
  return [...seen.values()];
}

/** The lessons and questions of a topic for a team's level and style picks. */
export function contentFor(t: LibTopic, level: Level, picks: Record<string, string>): { lessons: LibLesson[]; questions: LibQuestion[] } {
  const styles = new Map((t.styles ?? []).map((s) => [s.key, styleChoice(s, picks)]));
  const ok = (x: { minLevel?: Level; style?: string }) => {
    if (levelIdx(x.minLevel ?? t.level) > levelIdx(level)) return false;
    if (!x.style) return true;
    const [k, o] = x.style.split(":");
    return styles.get(k!) === o;
  };
  return { lessons: t.lessons.filter(ok), questions: t.questions.filter(ok) };
}

async function teamInfo(teamId: string, database: Db) {
  const [team] = await database.select({ level: teams.level, picks: teams.libraryStyles }).from(teams).where(eq(teams.id, teamId));
  if (!team) throw new Error("Team not found.");
  return team;
}

/** The team's library topics, by library key. */
export async function libraryState(teamId: string, database: Db = db) {
  const rows = await database
    .select({ id: topics.id, key: topics.libraryKey, version: topics.libraryVersion, archived: topics.archived })
    .from(topics)
    .where(and(eq(topics.teamId, teamId), isNotNull(topics.libraryKey)));
  return new Map(rows.map((r) => [r.key!, r]));
}

/** Replace a library topic's lessons and questions with the current library content. */
async function writeContent(teamId: string, topicId: string, t: LibTopic, userId: string | null, database: Db) {
  const team = await teamInfo(teamId, database);
  const content = contentFor(t, team.level, team.picks);
  const now = new Date();
  await database.transaction(async (tx) => {
    // lessons carry no answers: replace them; questions may have answers: retire them
    await tx.delete(lessons).where(and(eq(lessons.teamId, teamId), eq(lessons.topicId, topicId)));
    await tx
      .update(questions)
      .set({ status: "rejected" })
      .where(and(eq(questions.teamId, teamId), eq(questions.topicId, topicId)));
    if (content.lessons.length)
      await tx.insert(lessons).values(
        content.lessons.map((l, i) => ({
          teamId,
          topicId,
          audience: l.audience,
          title: l.title,
          body: l.body,
          diagram: l.diagram ?? null,
          status: "approved" as const,
          approvedBy: userId,
          approvedAt: now,
          sort: i,
        })),
      );
    if (content.questions.length)
      await tx.insert(questions).values(
        content.questions.map((q, i) => ({
          teamId,
          topicId,
          audience: q.audience,
          format: q.data.kind,
          prompt: q.prompt,
          data: q.data,
          explanation: q.explanation,
          diagram: q.diagram ?? null,
          status: "approved" as const,
          tier: q.core ? ("core" as const) : ("reserve" as const),
          approvedBy: userId,
          approvedAt: now,
          sort: i,
        })),
      );
    await tx.update(topics).set({ libraryVersion: t.version, archived: false, summary: t.summary }).where(and(eq(topics.teamId, teamId), eq(topics.id, topicId)));
  });
}

/** Add library topics to a team (or bring back removed ones, or update old versions). */
export async function addLibraryTopics(teamId: string, keys: string[], userId: string | null, database: Db = db): Promise<number> {
  const team = await teamInfo(teamId, database);
  const state = await libraryState(teamId, database);
  const usable = new Set(topicsFor(team.level).map((t) => t.key));
  let added = 0;
  for (const key of keys) {
    const t = LIBRARY_BY_KEY.get(key);
    if (!t || !usable.has(key)) continue;
    const have = state.get(key);
    if (have) {
      if (have.archived || (have.version ?? 0) < t.version) await writeContent(teamId, have.id, t, userId, database);
      added++;
      continue;
    }
    // a playbook topic may already use the name
    const taken = new Set(
      (await database.select({ k: topics.nameKey }).from(topics).where(and(eq(topics.teamId, teamId), inArray(topics.nameKey, [topicKey(t.name), topicKey(`${t.name} (basics)`)])))).map((r) => r.k),
    );
    const name = taken.has(topicKey(t.name)) ? `${t.name} (basics)` : t.name;
    if (taken.has(topicKey(name))) continue;
    const now = new Date();
    const [row] = await database
      .insert(topics)
      .values({
        teamId,
        name,
        nameKey: topicKey(name),
        summary: t.summary,
        sort: 10_000 + LIBRARY.indexOf(t),
        // nothing for Reps' playbook reading to do here: no gaps to find, nothing to write
        gapsFoundAt: now,
        generatedAt: now,
        libraryKey: t.key,
        libraryVersion: t.version,
      })
      .returning({ id: topics.id });
    await writeContent(teamId, row!.id, t, userId, database);
    added++;
  }
  return added;
}

/** Take a library topic away from players (kept, so adding it back is one tap). */
export async function removeLibraryTopic(teamId: string, key: string, database: Db = db) {
  const have = (await libraryState(teamId, database)).get(key);
  if (!have) return;
  await database.transaction(async (tx) => {
    await tx.update(topics).set({ archived: true, inInstall: false }).where(and(eq(topics.teamId, teamId), eq(topics.id, have.id)));
    await tx.update(lessons).set({ status: "rejected" }).where(and(eq(lessons.teamId, teamId), eq(lessons.topicId, have.id)));
    await tx.update(questions).set({ status: "rejected" }).where(and(eq(questions.teamId, teamId), eq(questions.topicId, have.id)));
  });
}

/** Set how the team teaches something coaches differ on; the topics it touches are rewritten. */
export async function setLibraryStyle(teamId: string, styleKey: string, optionKey: string, userId: string | null, database: Db = db) {
  const style = allStyles().find((s) => s.key === styleKey);
  if (!style || !style.options.some((o) => o.key === optionKey)) throw new Error("That choice isn't in the library.");
  const team = await teamInfo(teamId, database);
  await database
    .update(teams)
    .set({ libraryStyles: { ...team.picks, [styleKey]: optionKey } })
    .where(eq(teams.id, teamId));
  const state = await libraryState(teamId, database);
  for (const t of LIBRARY) {
    const have = state.get(t.key);
    if (have && !have.archived && (t.styles ?? []).some((s) => s.key === styleKey)) await writeContent(teamId, have.id, t, userId, database);
  }
}
