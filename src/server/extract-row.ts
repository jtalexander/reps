/**
 * Read one box with the model and store the result: a drawn play (data on
 * the row), library items (children of the row, which becomes kind "page"),
 * or nothing (not playbook content).
 *
 * Production runs this inside the Netlify background function
 * `netlify/functions/read-box-background.mts` (reads can outlast a normal
 * request); development and tests call it directly. No "server-only" here.
 */
import { and, eq } from "drizzle-orm";
import { db, type Db } from "@/db";
import { plays, teams } from "@/db/schema";
import { extractPage, hasApiKey, type PageReader } from "@/ingest/extract";
import { media } from "@/media/store";
import { pageItemsList, upsertItems } from "./library";
import { conceptsForTeam, statusFor, withConcept } from "./plays";

export async function extractPlayRow(teamId: string, playId: string, opts: { database?: Db; reader?: PageReader } = {}) {
  const database = opts.database ?? db;
  const [row] = await database.select().from(plays).where(and(eq(plays.teamId, teamId), eq(plays.id, playId)));
  if (!row || !row.cropKey) throw new Error("Box not found.");
  if (row.status === "approved" && row.kind === "play") return row;
  const [team] = await database.select().from(teams).where(eq(teams.id, teamId));
  if (!opts.reader && !hasApiKey()) {
    await database
      .update(plays)
      .set({ extraction: "failed", extractionError: "No ANTHROPIC_API_KEY on the server — fill this in by hand." })
      .where(eq(plays.id, playId));
    return null;
  }
  await database.update(plays).set({ extraction: "running", extractionError: null }).where(eq(plays.id, playId));
  try {
    const crop = await media().get(row.cropKey);
    if (!crop) throw new Error("Crop image missing.");
    const result = await extractPage(crop.bytes, row.cropWidth ?? 0, row.cropHeight ?? 0, row.sourceText, opts.reader);

    if (result.type === "none") {
      await database.update(plays).set({ extraction: "not_a_play", aiRaw: result.raw, archived: true }).where(eq(plays.id, playId));
      return null;
    }

    if (result.type === "library") {
      const ids = await upsertItems(
        teamId,
        { id: row.id, uploadId: row.uploadId, sourcePage: row.sourcePage, cropKey: row.cropKey },
        pageItemsList(result.items),
        database,
      );
      const [saved] = await database
        .update(plays)
        .set({ kind: "page", extraction: "done", aiRaw: result.raw, name: `Page ${row.sourcePage ?? ""}: ${ids.length} items`.trim(), data: null })
        .where(eq(plays.id, playId))
        .returning();
      return saved!;
    }

    const data = withConcept(result.data, await conceptsForTeam(teamId, database));
    const { status, qbReady } = statusFor(data, team!.level, false);
    const [saved] = await database
      .update(plays)
      .set({
        kind: "play",
        data,
        aiRaw: result.raw,
        name: data.name,
        playType: String(data.play_type),
        conceptKey: data.concept_key,
        extraction: "done",
        status,
        qbReady,
      })
      .where(eq(plays.id, playId))
      .returning();
    return saved!;
  } catch (err) {
    await database
      .update(plays)
      .set({ extraction: "failed", extractionError: err instanceof Error ? err.message.slice(0, 300) : String(err) })
      .where(eq(plays.id, playId));
    return null;
  }
}
