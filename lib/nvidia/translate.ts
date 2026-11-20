import { chat, type NvidiaClient } from "@/lib/nvidia";
import { LANGUAGE_NAME, MODELS, type Lang } from "@/lib/nvidia/config";
import { HINDI_SPELLINGS } from "@/lib/speech/glossary";

const letters = (s: string) => s.match(/\p{L}/gu) ?? [];
const COMMON_ENGLISH = /\b(?:the|and|is|are|for|to|on|of|in|with|now|at|a|an|our|your|you|we|it|this|that|from|by)\b/gi;

/** Hindi must come back in Devanagari, English as English: this model has answered in Czech when asked badly. */
export function isLanguage(text: string, lang: Lang): boolean {
  const l = letters(text);
  if (!l.length) return false;
  if (lang === "hi") return l.filter((c) => /\p{Script=Devanagari}/u.test(c)).length / l.length >= 0.5;
  const latin = l.filter((c) => /\p{Script=Latin}/u.test(c)).length / l.length;
  const plain = (text.match(/[A-Za-z]+/g) ?? []).length ? (text.match(/\b[A-Za-z]+\b/g) ?? []).length / Math.max(1, text.split(/\s+/).length) : 0;
  return latin >= 0.9 && plain >= 0.6 && (text.match(COMMON_ENGLISH)?.length ?? 0) >= 1;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface Translation {
  text: string;
  modelId: string;
  latencyMs: number;
}

/**
 * English <-> Hindi with NVIDIA's translation model. Brand and product names listed in `protect` are wrapped in
 * [[double brackets]] so the model leaves them alone, then the brackets are removed.
 */
export async function translateText(client: NvidiaClient, text: string, from: Lang, to: Lang, protect: string[] = []): Promise<Translation> {
  if (from === to) throw new Error("Nothing to translate: same language.");
  let source = text;
  if (from === "hi") {
    // Brand and product names spelled in Devanagari go in as their English names, protected.
    for (const [english, spellings] of Object.entries(HINDI_SPELLINGS)) {
      for (const sp of [...spellings].sort((a, b) => b.length - a.length)) source = source.split(sp).join(`[[${english}]]`);
    }
  }
  const terms = [...new Set(protect.filter(Boolean))].sort((a, b) => b.length - a.length);
  for (const t of terms) source = source.replace(new RegExp(`(?<!\\[\\[)${escapeRe(t)}(?!\\]\\])`, "gi"), (m) => `[[${m}]]`);

  const system = [
    `You are a translator. Translate the user's ${LANGUAGE_NAME[from]} text into ${LANGUAGE_NAME[to]}${to === "hi" ? " (Devanagari script)" : ""}.`,
    "Keep any text inside [[double square brackets]] exactly as written. Keep numbers, prices and percentages unchanged.",
    "Output only the translation, nothing else.",
  ].join(" ");
  const res = await chat(client, [{ role: "system", content: system }, { role: "user", content: source }], {
    model: MODELS.translate,
    temperature: 0,
    maxTokens: Math.min(900, Math.max(120, text.length * 4)),
    fallback: null,
    timeoutMs: 20_000,
  });
  const out = res.data.replace(/\[\[|\]\]/g, "").replace(/\s+/g, " ").trim();
  if (!isLanguage(out, to)) throw new Error(`The translation did not come back in ${LANGUAGE_NAME[to]}.`);
  return { text: out, modelId: res.modelId, latencyMs: res.latencyMs };
}
