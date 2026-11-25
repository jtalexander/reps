/**
 * Smoke test: send a real 2-drawing batch with the same requests the background
 * reader sends, wait for it, and check the answers parse (saves nothing).
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/batch-smoke.mts "<team>"
 */
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { DrawingSchema, drawingBatchParams, drawingContent } from "@/teach/ai";
import { drawingInput } from "@/teach/convert";
import { playbookDrawings } from "@/teach/drawings";
import { BATCH_MODEL } from "@/teach/read-batch";

const [team] = await db.select().from(teams).where(eq(teams.name, process.argv[2]!));
const ds = (await playbookDrawings(team!.id)).filter((d) => /RIGHT/.test(d.label)).slice(0, 2);
const requests: Anthropic.Messages.BatchCreateParams.Request[] = [];
for (const [i, d] of ds.entries()) {
  const input = (await drawingInput(team!.id, d.key))!;
  requests.push({ custom_id: `d${i}`, params: drawingBatchParams(drawingContent(input.png, input.width, input.height, input.label, input.notes, input.naming), BATCH_MODEL) });
}
const client = new Anthropic();
const batch = await client.messages.batches.create({ requests });
console.log("batch", batch.id, ds.map((d) => d.label));
const t0 = Date.now();
for (;;) {
  const b = await client.messages.batches.retrieve(batch.id);
  if (b.processing_status === "ended") break;
  if (Date.now() - t0 > 40 * 60 * 1000) throw new Error("still processing after 40 min");
  await new Promise((r) => setTimeout(r, 30_000));
}
console.log("ended after", Math.round((Date.now() - t0) / 1000), "s");
for await (const r of await client.messages.batches.results(batch.id)) {
  if (r.result.type !== "succeeded") {
    console.log(r.custom_id, r.result.type, JSON.stringify(r.result).slice(0, 300));
    continue;
  }
  const text = r.result.message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  const p = DrawingSchema.safeParse(JSON.parse(text));
  console.log(r.custom_id, p.success ? `ok: ${p.data.players.map((x) => x.id).join(" ")}` : `PARSE FAIL ${p.error.message.slice(0, 200)}`, r.result.message.usage.input_tokens, r.result.message.usage.output_tokens);
}
process.exit(0);
