/**
 * One play crop -> Claude (vision) -> validated PlayData. Structured output
 * is enforced with a zod schema; an invalid or empty answer is retried, and
 * a refusal is reported as a failure the coach can fill in by hand.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { EXTRACTION_SYSTEM, ExtractedSchema, toPlayData, type Extracted } from "@/domain/extraction";
import type { PlayData } from "@/domain/play";
import { calibrate, scaleFor } from "./calibrate";

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export interface ExtractResult {
  isPlay: boolean;
  data: PlayData | null;
  raw: Extracted;
}

export async function askModel(png: Uint8Array, width: number, height: number, text: string, client = new Anthropic()): Promise<Extracted> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        system: EXTRACTION_SYSTEM,
        output_config: { effort: "high", format: zodOutputFormat(ExtractedSchema) },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: Buffer.from(png).toString("base64") },
              },
              {
                type: "text",
                text: `The image is ${width} by ${height} pixels.${
                  text ? `\nText found on the card (from the PDF text layer):\n${text}` : "\nThe PDF had no text layer for this card; read any text from the image."
                }\nReturn the play as data.`,
              },
            ],
          },
        ],
      });
      if (response.stop_reason === "refusal") throw new Error("The model declined to read this card.");
      if (response.stop_reason === "max_tokens") throw new Error("The model ran out of room on this card.");
      if (!response.parsed_output) throw new Error("The model returned nothing usable.");
      return response.parsed_output;
    } catch (err) {
      lastError = err;
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.BadRequestError) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Read a crop into PlayData (null data when the crop is not a play). */
export async function extractPlay(png: Uint8Array, width: number, height: number, text: string, model = askModel): Promise<ExtractResult> {
  const raw = await model(png, width, height, text);
  if (!raw.is_play) return { isPlay: false, data: null, raw };
  const cal = await calibrate(png);
  const { toYards } = scaleFor(cal, raw.players, raw.ball);
  return { isPlay: true, data: toPlayData(raw, toYards), raw };
}
