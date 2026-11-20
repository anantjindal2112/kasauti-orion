import { z } from "zod";
import { loadBrandPack } from "@/lib/brand-pack";
import { getNvidiaClient } from "@/lib/nvidia";
import { translateText } from "@/lib/nvidia/translate";
import { normalizeSpokenEnglish } from "@/lib/speech/normalize";
import { normalizeSpokenHindi } from "@/lib/speech/normalize-hindi";

const body = z.object({ text: z.string().refine((s) => s.trim().length > 0, "Nothing to translate.").pipe(z.string().max(4000, "Keep it under 4,000 characters.")) });
export const maxDuration = 40;

/** Hindi copy to English, so the English rule checks can review it. Hindi to English only. */
export async function POST(request: Request) {
  let text: string;
  try {
    text = body.parse(await request.json()).text;
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message ?? "Bad request." : "Request body must be JSON.";
    return Response.json({ error: message }, { status: 400 });
  }
  try {
    const brand = loadBrandPack().brand;
    // Number words become digits first: the translation model misreads words like निन्यानवे (99).
    const tr = await translateText(getNvidiaClient(), normalizeSpokenHindi(text), "hi", "en", [brand.name, ...brand.products]);
    return Response.json({ text: normalizeSpokenEnglish(tr.text), modelId: tr.modelId, latencyMs: tr.latencyMs });
  } catch (e) {
    return Response.json({ error: `Couldn't translate: ${e instanceof Error ? e.message.slice(0, 140) : "error"}` }, { status: 502 });
  }
}
