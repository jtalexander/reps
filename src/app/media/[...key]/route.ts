/**
 * Serves stored images (page renders, play crops). The first key segment is
 * the team id: coaches of that team and players signed in to it may read.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { teamCoaches } from "@/db/schema";
import { media } from "@/media/store";
import { currentPlayer } from "@/server/player-session";
import { getSessionUser } from "@/server/teams";

export async function GET(_req: Request, ctx: RouteContext<"/media/[...key]">) {
  const { key: parts } = await ctx.params;
  const key = parts.map(decodeURIComponent).join("/");
  const teamId = parts[0];
  if (!teamId || !/^[0-9a-f-]{36}$/i.test(teamId) || key.includes("..")) return new Response("Not found", { status: 404 });
  if (key.endsWith(".pdf")) return new Response("Not found", { status: 404 });

  let allowed = false;
  const user = await getSessionUser();
  if (user) {
    const [row] = await db
      .select()
      .from(teamCoaches)
      .where(and(eq(teamCoaches.teamId, teamId), eq(teamCoaches.userId, user.id)));
    allowed = Boolean(row);
  }
  if (!allowed) {
    const player = await currentPlayer();
    allowed = player?.team.id === teamId;
  }
  if (!allowed) return new Response("Not found", { status: 404 });

  const file = await media().get(key);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(file.bytes), {
    headers: { "content-type": file.contentType, "cache-control": "private, max-age=86400, immutable" },
  });
}
