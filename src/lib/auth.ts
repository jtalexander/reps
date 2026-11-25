import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import { authAccounts, sessions, users, verifications } from "@/db/schema";

/** The public origin of this deployment (BETTER_AUTH_URL, else Netlify's URL). */
export function appBaseUrl(): string {
  const netlify = process.env.CONTEXT === "production" ? process.env.URL : process.env.DEPLOY_PRIME_URL;
  return (process.env.BETTER_AUTH_URL ?? netlify ?? process.env.URL ?? "http://localhost:3500").replace(/\/$/, "");
}

const trustedOrigins = [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL].filter(
  (v): v is string => Boolean(v),
);

export const auth = betterAuth({
  appName: "RepWon Install",
  baseURL: appBaseUrl(),
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session: sessions, account: authAccounts, verification: verifications },
  }),
  account: { fields: { accountId: "providerAccountId" } },
  emailAndPassword: { enabled: true, minPasswordLength: 10, autoSignIn: true },
  advanced: {
    database: { generateId: "uuid" },
    cookiePrefix: "reps",
  },
  plugins: [nextCookies()],
});
