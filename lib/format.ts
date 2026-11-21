import { splitSentences } from "@/lib/checks/text";

/**
 * Generic tidy-up for English or Hindi text: spacing, punctuation, capital letters and sentence endings.
 * It has nothing to do with the brand guidelines (the scan does that next) and it never changes a word.
 */
export type TextLang = "en" | "hi";

/** Share of letters that are Devanagari. */
export function hindiShare(t: string): number {
  const letters = t.match(/\p{L}/gu) ?? [];
  return letters.length ? letters.filter((c) => /\p{Script=Devanagari}/u.test(c)).length / letters.length : 0;
}
export const detectLang = (t: string): TextLang => (hindiShare(t) >= 0.3 ? "hi" : "en");

/** The words of a text, ignoring case, punctuation and number grouping: what must be identical before and after tidying. */
export function wordsOf(t: string): string[] {
  return t
    .normalize("NFC")
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, "$1")
    .replace(/(\d)\.(?=\d)/g, "$1")
    .replace(/[^\p{L}\p{M}\p{N}₹%]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function sameWords(a: string, b: string): boolean {
  const x = wordsOf(a);
  const y = wordsOf(b);
  return x.length === y.length && x.every((w, i) => w === y[i]);
}

export function codeFormat(text: string, lang: TextLang): string {
  let t = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  t = t.replace(/\s+([,.;:!?।])/g, "$1"); // no space before punctuation
  t = t.replace(/([,;:!?।])(?=\p{L})/gu, "$1 "); // a space after it, but never inside 1,499 or 4.6
  t = t.replace(/(\p{Ll})\.(?=\p{Lu})/gu, "$1. ");
  if (lang === "hi") {
    t = t.replace(/([\p{Script=Devanagari}\p{M}])\.(?=\s|$)/gu, "$1।"); // the Hindi full stop
  } else {
    t = t.replace(/\bi\b(?!\.)/g, "I"); // a lone "i" (speech-to-text and quick typing)
    for (const s of [...splitSentences(t)].reverse()) {
      const c = t[s.start];
      if (c && /\p{Ll}/u.test(c)) t = t.slice(0, s.start) + c.toUpperCase() + t.slice(s.start + 1);
    }
  }
  if (lang === "en") t = t.replace(/(^|\n)(\p{Ll})/gu, (_, p: string, c: string) => p + c.toUpperCase()); // each paragraph starts with a capital
  // Each paragraph that is more than a fragment ends with a full stop.
  t = t
    .split("\n")
    .map((line) => (line.length >= 12 && /[\p{L}\p{N}₹%\p{M}]$/u.test(line) ? line + (hindiShare(line) >= 0.3 ? "।" : ".") : line))
    .join("\n");
  return t.replace(/ {2,}/g, " ");
}

/** Strip the wrapping a model sometimes adds around plain text. */
export function cleanReply(r: string): string {
  return r
    .replace(/^\s*```[a-z]*\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .replace(/^\s*(?:here(?:'s| is)[^\n:]*:|formatted text:)\s*/i, "")
    .replace(/^["“]([\s\S]*)["”]$/, "$1")
    .trim();
}
