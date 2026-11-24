/**
 * What's in this week's install, as ids: picked plays, whole topics, and the
 * topics of picked plays. Kept apart from install.ts (the filters and tags)
 * because the background worker loads this through service.ts, and it must
 * not pull in anything that only runs inside Next.js ("server-only").
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { plays, teams } from "@/db/schema";
import { topics } from "@/db/teach-schema";
import { playbookDrawings } from "./drawings";

/** The plays in this week's install: picked ones and the plays of install topics. */
export async function installPlayIds(teamId: string, database: Db = db): Promise<Set<string>> {
  const rows = await database
    .select({ id: plays.id, picked: plays.inInstall, key: sql<string | null>`${plays.aiRaw}->>'drawingKey'` })
    .from(plays)
    .where(and(eq(plays.teamId, teamId), eq(plays.archived, false)));
  const ids = new Set(rows.filter((r) => r.picked).map((r) => r.id));
  const [whole] = await database
    .select({ n: sql<number>`count(*)::int` })
    .from(topics)
    .where(and(eq(topics.teamId, teamId), eq(topics.inInstall, true), eq(topics.archived, false)));
  if (whole?.n) {
    const inTopic = new Set((await playbookDrawings(teamId, database)).filter((d) => d.inInstall).map((d) => d.key));
    for (const r of rows) if (r.key && inTopic.has(r.key)) ids.add(r.id);
  }
  return ids;
}

/** Install topics: the ones added whole, and the topics of plays picked one by one. */
export async function installTopicIds(teamId: string, database: Db = db): Promise<Set<string>> {
  const whole = await database
    .select({ id: topics.id })
    .from(topics)
    .where(and(eq(topics.teamId, teamId), eq(topics.inInstall, true), eq(topics.archived, false)));
  const ids = new Set(whole.map((t) => t.id));
  const keys = (
    await database
      .select({ key: sql<string | null>`${plays.aiRaw}->>'drawingKey'` })
      .from(plays)
      .where(and(eq(plays.teamId, teamId), eq(plays.inInstall, true), eq(plays.archived, false)))
  ).flatMap((r) => (r.key ? [r.key] : []));
  if (keys.length) {
    const want = new Set(keys);
    for (const d of await playbookDrawings(teamId, database)) if (want.has(d.key) && d.topicId) ids.add(d.topicId);
  }
  return ids;
}

/** Put plays in or out of the install, one by one. */
export async function setPlaysInstall(teamId: string, ids: string[], on: boolean, database: Db = db) {
  if (!ids.length) return 0;
  const done = await database
    .update(plays)
    .set({ inInstall: on })
    .where(and(eq(plays.teamId, teamId), inArray(plays.id, ids)))
    .returning({ id: plays.id });
  return done.length;
}

/** Name this week's install ("Week 7: Eagles"); blank clears it. */
export async function setInstallName(teamId: string, name: string, database: Db = db) {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 60);
  await database.update(teams).set({ installName: clean || null }).where(eq(teams.id, teamId));
  return clean || null;
}
