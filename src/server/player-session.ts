/**
 * Player access: no account. A player enters the team's join code, picks
 * their name from the roster, and gets a signed cookie naming that player.
 * Resetting the team's join code bumps its version and ends every cookie.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { players, teams } from "@/db/schema";

const COOKIE = "reps_player";
const MAX_AGE = 60 * 60 * 24 * 180;

function secret(): string {
  const s = process.env.PLAYER_COOKIE_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("PLAYER_COOKIE_SECRET is not set.");
  return s;
}

export interface PlayerClaim {
  playerId: string;
  teamId: string;
  v: number;
  /** position the player chose to study this session */
  position: string;
}

export function signClaim(claim: PlayerClaim): string {
  const body = Buffer.from(JSON.stringify(claim)).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyClaim(token: string | undefined): PlayerClaim | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as PlayerClaim;
  } catch {
    return null;
  }
}

export async function setPlayerCookie(claim: PlayerClaim) {
  (await cookies()).set(COOKIE, signClaim(claim), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function clearPlayerCookie() {
  (await cookies()).delete(COOKIE);
}

export type CurrentPlayer = {
  player: typeof players.$inferSelect;
  team: typeof teams.$inferSelect;
  position: string;
};

export async function currentPlayer(): Promise<CurrentPlayer | null> {
  const claim = verifyClaim((await cookies()).get(COOKIE)?.value);
  if (!claim) return null;
  const row = await db
    .select({ player: players, team: teams })
    .from(players)
    .innerJoin(teams, eq(teams.id, players.teamId))
    .where(and(eq(players.id, claim.playerId), eq(players.teamId, claim.teamId), eq(players.active, true)))
    .limit(1);
  const r = row[0];
  if (!r || r.team.joinCodeVersion !== claim.v) return null;
  return { ...r, position: claim.position };
}

export async function requirePlayer(): Promise<CurrentPlayer> {
  const p = await currentPlayer();
  if (!p) redirect("/join");
  return p;
}
