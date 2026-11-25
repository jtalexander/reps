/** Dry run: what the builder's Formation pick lines up for a team (reads only when a drawing was never read). */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { getNaming } from "@/teach/naming";
import { lineupFor } from "@/teach/lineup";

const [team] = await db.select().from(teams).where(eq(teams.name, process.argv[2]!));
const { naming } = await getNaming(team!.id);
for (const f of naming?.formations ?? [])
  for (const tag of ["", ...(naming?.formation_tags ?? []).slice(0, 3).map((t) => t.word)]) {
    const r = await lineupFor(team!.id, { formation: f.word, dir: "RIGHT", tag }, null);
    console.log(`${f.word} RIGHT ${tag}`.padEnd(24), r.kind, r.kind === "lineup" ? `${r.from}${r.mirrored ? " (mirrored)" : ""} ${r.players.length}p` : r.kind === "none" ? r.why : r.from);
  }
process.exit(0);
