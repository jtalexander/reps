import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

/** Only same-site relative paths are allowed as post-sign-in destinations. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/coach";
  return next;
}
