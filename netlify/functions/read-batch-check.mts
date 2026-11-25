/**
 * Every 10 minutes: see whether any team's background playbook read has come
 * back, and start turning it into plays (or restart a step that stalled).
 * See src/teach/read-batch.ts.
 */
import { checkBatches } from "../../src/teach/read-batch";

const handler = async () => {
  const moved = await checkBatches(null);
  if (moved) console.log("read batches moved on:", moved);
};

export default handler;

export const config = { schedule: "*/10 * * * *" };
