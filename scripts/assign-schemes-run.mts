/** Give a team's runs their blocking schemes by name (same as the "Give them their schemes" button). */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { assignSchemes, schemeMatches } from "@/teach/assign-schemes";

const [team] = await db.select().from(teams).where(eq(teams.name, process.argv[2]!));
console.log("would match:", await schemeMatches(team!.id));
if (process.argv[3] === "--apply") console.log("matched:", await assignSchemes(team!.id));
process.exit(0);
