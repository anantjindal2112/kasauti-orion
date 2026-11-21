import { isExpired, type BrandPack } from "@/lib/brand-pack";
import { runCodeChecks } from "@/lib/checks";
import type { ChatMessage } from "@/lib/nvidia/chat";

/** Valid (not expired) proof entries a sample phrase may talk about, with their wording. */
export function usableFacts(pack: BrandPack, today?: string): string[] {
  return pack.evidence.filter((e) => !isExpired(e, today)).map((e) => `${e.claim}${e.conditions ? ` (${e.conditions})` : ""}`);
}

const numbersIn = (s: string) => new Set((s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "")));

/**
 * Why a generated phrase is not good enough to read aloud, or [] when it is. Our own rules judge it, not the model:
 * it must pass every code check (names, words, tone, punctuation), name a real product, and use only numbers that
 * appear in the facts it was given. A phrase like that comes back from speech-to-text needing next to no fixing.
 */
export function phraseProblems(phrase: string, pack: BrandPack, facts: string[], today?: string): string[] {
  const out: string[] = [];
  const text = phrase.trim();
  if (text.length < 20 || text.length > 260) out.push("It must be one or two short sentences (under 40 words).");
  if (/[\n\r]/.test(text)) out.push("Use one paragraph, no line breaks.");
  if (!pack.brand.products.some((p) => text.includes(p))) out.push(`Name one product exactly: ${pack.brand.products.join(", ")}.`);
  const allowed = numbersIn(facts.join(" "));
  const stray = [...numbersIn(text)].filter((n) => !allowed.has(n));
  if (stray.length) out.push(`These numbers are not in the facts, remove them: ${stray.join(", ")}.`);
  for (const f of runCodeChecks({ text }, pack, { today }).findings.filter((x) => x.location === "text")) {
    out.push(`Rule ${f.rule} fails on “${f.quote}”: ${f.explanation}`);
  }
  return out;
}

export function phraseMessages(args: { pack: BrandPack; facts: string[]; purpose?: string; mustKeep?: string; tried?: { phrase: string; problems: string[] } }): ChatMessage[] {
  const { pack, facts, purpose, mustKeep, tried } = args;
  const system = [
    `You write a short sample line for ${pack.brand.name} that someone will read aloud into a microphone, so speech-to-text hears it cleanly.`,
    `Brand voice: ${pack.brand.voice.summary}`,
    "Write ONE or TWO plain sentences, under 35 words in total. Say the full product name exactly. Use only facts from the FACTS list, with their exact numbers. Normal sentence case, normal punctuation, a single full stop or comma between ideas.",
    "Do not use exclamation marks, capital-letter shouting, emoji, hashtags, 'best', 'most', 'cheap', 'guaranteed', competitor names, or more than one call to action. No quotes around the line.",
    'Reply with JSON only: {"phrase": "..."}',
  ].join("\n");
  const user = [
    `PRODUCTS: ${pack.brand.products.join(", ")}`,
    `FACTS (use at least one, nothing else): ${facts.map((f) => `\n- ${f}`).join("")}`,
    purpose || mustKeep ? `THE CREATOR WANTS: purpose: ${purpose || "—"}; must keep: ${mustKeep || "—"}` : "",
    tried ? `\nYour last try was: "${tried.phrase}"\nIt failed:\n${tried.problems.map((p) => `- ${p}`).join("\n")}\nWrite a different line that fixes all of this.` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
