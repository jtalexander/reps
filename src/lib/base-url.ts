/** The public origin of this deployment (BETTER_AUTH_URL, else Netlify's URL). */
export function appBaseUrl(): string {
  const netlify = process.env.CONTEXT === "production" ? process.env.URL : process.env.DEPLOY_PRIME_URL;
  return (process.env.BETTER_AUTH_URL ?? netlify ?? process.env.URL ?? "http://localhost:3500").replace(/\/$/, "");
}
