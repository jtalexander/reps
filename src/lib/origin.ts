import { headers } from "next/headers";

/** The site address this request came in on, so background calls reach the same deploy. */
export async function requestOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}
