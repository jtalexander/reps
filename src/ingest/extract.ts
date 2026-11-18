/**
 * One crop -> Claude (vision) -> validated data. The model first decides
 * what kind of page it is (a drawn play, a concept page, a formation sheet,
 * definitions, reading, or not playbook content) and fills that section.
 * Structured output is enforced with zod; invalid or empty answers are
 * retried; a refusal becomes a failure the coach can fill in by hand.
 *
 * Runs in a Netlify background function in production (long reads would
 * outlive a normal request), inline in development and tests.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { toPlayData, type Extracted } from "@/domain/extraction";
import { ExtractedPageSchema, PAGE_SYSTEM, toPageItems, type ExtractedPage, type PageItems } from "@/domain/page-extraction";
import type { PlayData } from "@/domain/play";
import { calibrate, scaleFor } from "./calibrate";

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export type PageReader = (png: Uint8Array, width: number, height: number, text: string) => Promise<ExtractedPage>;

export const askPage: PageReader = async (png, width, height, text) => {
  const client = new Anthropic({ timeout: 10 * 60 * 1000, maxRetries: 2 });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: 20000,
        system: PAGE_SYSTEM,
        output_config: { effort: "high", format: zodOutputFormat(ExtractedPageSchema) },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: Buffer.from(png).toString("base64") } },
              {
                type: "text",
                text: `The image is ${width} by ${height} pixels.${
                  text ? `\nText found on this page (from the PDF text layer, may be out of order):\n${text}` : "\nThe PDF had no text layer here; read any text from the image."
                }\nDecide the page type and return its contents as data.`,
              },
            ],
          },
        ],
      });
      if (response.stop_reason === "refusal") throw new Error("The model declined to read this page.");
      if (response.stop_reason === "max_tokens") throw new Error("The page had more on it than the model could return at once. Split the box into smaller boxes.");
      if (!response.parsed_output) throw new Error("The model returned nothing usable.");
      return response.parsed_output;
    } catch (err) {
      lastError = err;
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.BadRequestError || err instanceof Anthropic.PermissionDeniedError) break;
      if (err instanceof Error && /Split the box/.test(err.message)) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

export type PageResult =
  | { type: "play"; data: PlayData; raw: ExtractedPage }
  | { type: "library"; items: PageItems; raw: ExtractedPage }
  | { type: "none"; raw: ExtractedPage };

/** Read a crop and convert what the model found. */
export async function extractPage(png: Uint8Array, width: number, height: number, text: string, reader: PageReader = askPage): Promise<PageResult> {
  const raw = await reader(png, width, height, text);
  if (raw.page_type === "play") {
    if (!raw.play || !raw.play.is_play) return { type: "none", raw };
    return { type: "play", data: await playFromPixels(png, raw.play), raw };
  }
  if (raw.page_type === "not_playbook") return { type: "none", raw };
  const items = toPageItems(raw);
  const any = items.concept || items.formations.length || items.terms.length || items.reading;
  return any ? { type: "library", items, raw } : { type: "none", raw };
}

async function playFromPixels(png: Uint8Array, play: Extracted): Promise<PlayData> {
  const cal = await calibrate(png);
  const { toYards } = scaleFor(cal, play.players, play.ball);
  return toPlayData(play, toYards);
}
