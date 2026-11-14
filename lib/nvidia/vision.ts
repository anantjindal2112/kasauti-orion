import type { z } from "zod";
import type { NvidiaClient, NvidiaResult } from "@/lib/nvidia/client";
import { chat, chatJson, type ChatMessage } from "@/lib/nvidia/chat";
import { MODELS, VISION_TIMEOUT_MS } from "@/lib/nvidia/config";

export type ImageMime = "image/png" | "image/jpeg" | "image/webp";

export function toDataUrl(bytes: Uint8Array, mime: ImageMime): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

/** `image` is a data URL (data:image/png;base64,…) or an https URL. SVG must be rasterised first. */
function imageMessage(image: string, prompt: string): ChatMessage[] {
  if (image.startsWith("data:image/svg")) throw new Error("Convert SVG to PNG before sending it to a vision model.");
  return [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: image } },
      ],
    },
  ];
}

const OCR_PROMPT =
  "Transcribe every piece of text visible in this image exactly as written — same spelling, symbols (₹, %, &) and capitalisation. " +
  "Put each separate block of text on its own line. Output only the text, nothing else. If there is no text, output nothing.";

/** OCR via the vision model (the standalone NVIDIA OCR endpoint is end-of-life). */
export async function imageToText(client: NvidiaClient, image: string): Promise<NvidiaResult<string>> {
  return chat(client, imageMessage(image, OCR_PROMPT), {
    model: MODELS.vision,
    maxTokens: 800,
    timeoutMs: VISION_TIMEOUT_MS,
    fallback: null,
  });
}

/** Free-form question about an image. */
export async function askImage(client: NvidiaClient, image: string, prompt: string): Promise<NvidiaResult<string>> {
  return chat(client, imageMessage(image, prompt), { model: MODELS.vision, timeoutMs: VISION_TIMEOUT_MS, fallback: null });
}

/** Structured question about an image (logo check, alt-text suggestion). */
export async function askImageJson<T>(
  client: NvidiaClient,
  image: string,
  prompt: string,
  schema: z.ZodType<T>,
  schemaName?: string,
): Promise<NvidiaResult<T>> {
  return chatJson(client, imageMessage(image, prompt), schema, {
    model: MODELS.vision,
    timeoutMs: VISION_TIMEOUT_MS,
    fallback: null,
    schemaName,
  });
}
