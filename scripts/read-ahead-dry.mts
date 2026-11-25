/** Dry run: which drawings read-ahead would queue for a team (queues nothing). */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { plays, teams } from "@/db/schema";
import { jobs } from "@/db/teach-schema";
import { playbookDrawings } from "@/teach/drawings";
import { getNaming } from "@/teach/naming";
import { formationCall, readAheadList } from "@/teach/read-ahead";

const [team] = await db.select().from(teams).where(eq(teams.name, process.argv[2]!));
const reads = await db.select({ ref: jobs.ref }).from(jobs).where(and(eq(jobs.teamId, team!.id), eq(jobs.kind, "convert_drawing")));
const made = await db.select({ name: plays.name }).from(plays).where(and(eq(plays.teamId, team!.id), eq(plays.archived, false)));
const { naming } = await getNaming(team!.id);
const have = new Set(made.flatMap((p) => formationCall(p.name, naming) ?? []));
const list = readAheadList(await playbookDrawings(team!.id), naming, new Set(reads.map((r) => r.ref)), have);
console.log("already have:", [...have].join(", "));
console.log(list.length, "to read");
for (const d of list) console.log(`${d.inInstall ? "install" : "form   "}  ${formationCall(d.label, naming) ?? ""}  <-  ${d.label} (p${d.pageNo})`);
process.exit(0);
