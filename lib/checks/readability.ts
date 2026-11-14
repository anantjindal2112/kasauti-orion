import type { BrandPack } from "@/lib/brand-pack";
import { splitSentences, words } from "@/lib/checks/text";
import type { TextCheck } from "@/lib/checks/types";

/** Rough English syllable count — good enough for a reading-level signal. */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 1; // numbers and symbols
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, (m) => m[0]).replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

/** Hashtags, links and emoji aren't prose; leave them out of the score. */
export function proseOnly(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ");
}

/**
 * Brand words readers already know (product names, acronyms) count as one syllable,
 * so "Kesar Collection" doesn't make a sentence look harder than it is.
 */
export function brandVocabulary(pack: BrandPack): Set<string> {
  const phrases = [pack.brand.name, ...pack.brand.products, ...pack.terms.approvedAcronyms];
  return new Set(phrases.flatMap((p) => words(p)).map((w) => w.toLowerCase()));
}

/** Flesch–Kincaid grade level. */
export function fleschKincaidGrade(text: string, simple: Set<string> = new Set()): number {
  const prose = proseOnly(text);
  const sentences = Math.max(1, splitSentences(prose).length);
  const ws = words(prose);
  if (!ws.length) return 0;
  const syl = ws.reduce((n, w) => n + (simple.has(w.toLowerCase()) ? 1 : syllables(w)), 0);
  return 0.39 * (ws.length / sentences) + 11.8 * (syl / ws.length) - 15.59;
}

/** Flesch–Kincaid wobbles by a couple of grades on short marketing copy. */
const OVERALL_TOLERANCE = 2;
/** A single sentence this far above the limit is hard to read wherever it sits. */
const SENTENCE_MARGIN = 6;
/** Very short sentences give noisy scores. */
const MIN_SENTENCE_WORDS = 8;

/**
 * KSR-2.4 — reading level. Flags the hardest sentence when the whole piece is clearly above
 * the limit, and any single sentence that is far above it.
 */
export const checkReadability: TextCheck = (text, { pack }) => {
  const limit = pack.brand.limits.readabilityMaxGrade;
  const simple = brandVocabulary(pack);
  const overall = fleschKincaidGrade(text, simple);
  const scored = splitSentences(text)
    .filter((s) => words(proseOnly(s.text)).length >= MIN_SENTENCE_WORDS)
    .map((s) => ({ s, grade: fleschKincaidGrade(s.text, simple) }));

  const flagged = new Map<number, { s: (typeof scored)[number]["s"]; grade: number }>();
  for (const x of scored) if (x.grade > limit + SENTENCE_MARGIN) flagged.set(x.s.start, x);
  if (overall > limit + OVERALL_TOLERANCE && scored.length) {
    const hardest = scored.reduce((a, b) => (b.grade > a.grade ? b : a));
    flagged.set(hardest.s.start, hardest);
  }

  return [...flagged.values()].map(({ s, grade }) => ({
    rule: "KSR-2.4",
    match: s,
    explanation: `This sentence reads at about grade ${Math.round(grade)} (the piece overall: grade ${Math.round(overall)}). Aim for grade ${limit} or below — shorter sentences, everyday words.`,
    suggestedFix: null,
  }));
};
