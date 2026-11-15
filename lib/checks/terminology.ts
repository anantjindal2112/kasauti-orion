import { dropOverlaps, findRegex, findTerm, formatInr } from "@/lib/checks/text";
import type { RawFinding, TextCheck } from "@/lib/checks/types";

/** KSR-2.1 — the brand is always "Dhaaga & Co.". */
export const checkBrandName: TextCheck = (text, { pack }) => {
  const { correct, wrong } = pack.terms.brandName;
  const hits = dropOverlaps(wrong.flatMap((w) => findTerm(text, w, { caseSensitive: true })));

  // Correct spelling but missing the final full stop, e.g. "Dhaaga & Co sheets".
  const withoutDot = correct.replace(/\.$/, "");
  const missingDot = findTerm(text, withoutDot, { caseSensitive: true }).filter((m) => text[m.end] !== ".");

  return [...hits, ...missingDot].map((m) => ({
    rule: "KSR-2.1",
    match: m,
    explanation: `The brand name is written "${correct}".`,
    suggestedFix: correct,
  }));
};

/** KSR-2.6 — product lines written exactly as approved. */
export const checkProductNames: TextCheck = (text, { pack }) =>
  pack.terms.productNames.flatMap(({ correct, wrong }) =>
    dropOverlaps(wrong.flatMap((w) => findTerm(text, w, { caseSensitive: true })))
      // "#IndigoHours" is how the name is written as a hashtag (KSR-5.3), not a misspelling.
      .filter((m) => text[m.start - 1] !== "#")
      .map((m) => ({
      rule: "KSR-2.6",
      match: m,
      explanation: `The approved product name is "${correct}".`,
      suggestedFix: correct,
    })),
  );

/** KSR-2.2 / KSR-5.2 and other one-for-one replacements. Price formats are handled by checkPriceFormat. */
export const checkReplacements: TextCheck = (text, { pack }) =>
  pack.terms.replace
    .filter((r) => r.rule !== "KSR-2.5")
    .flatMap((r) =>
      findTerm(text, r.term).map((m): RawFinding => {
        const isLink = r.rule === "KSR-5.2";
        return {
          rule: r.rule,
          match: m,
          explanation: isLink
            ? `"${m.text}" doesn't say where the link goes. Screen-reader users hear link text on its own.`
            : `Use "${r.with}" instead of "${m.text}".`,
          suggestedFix: isLink ? null : matchCase(m.text, r.with),
        };
      }),
    );

/** KSR-2.3 — banned words. */
export const checkBannedWords: TextCheck = (text, { pack }) =>
  pack.terms.banned.flatMap((b) =>
    findTerm(text, b.term).map((m) => ({
      rule: b.rule,
      match: m,
      explanation: `"${m.text}" is on the banned list: ${b.reason}`,
      suggestedFix: null,
    })),
  );

/** KSR-6.3 — never name competitors. */
export const checkCompetitors: TextCheck = (text, { pack }) =>
  pack.terms.competitors.flatMap((c) =>
    findTerm(text, c).map((m) => ({
      rule: "KSR-6.3",
      match: m,
      explanation: `"${m.text}" is a competitor. Don't name competitors, even in comparisons.`,
      suggestedFix: null,
    })),
  );

/**
 * Matches ₹1,499 · ₹1499 · Rs. 1499/- · Rs 1,499 · INR 1499.
 * A comma only counts as part of the number when digits follow it ("₹1,499, shop now" → "₹1,499").
 */
export const PRICE_RE = /(?:₹\s?|\bRs\.?\s?|\bINR\s?)(\d+(?:,\d+)*(?:\.\d{1,2})?)(?:\s?\/-)?/g;

export function parseAmount(raw: string): number | null {
  const m = /(\d+(?:,\d+)*(?:\.\d{1,2})?)/.exec(raw);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** KSR-2.5 — prices as "₹1,499": rupee symbol, Indian grouping, no "Rs." or "/-". */
export const checkPriceFormat: TextCheck = (text) =>
  findRegex(text, PRICE_RE).flatMap((m): RawFinding[] => {
    const amount = parseAmount(m.text);
    if (amount === null) return [];
    const correct = formatInr(amount);
    if (m.text === correct) return [];
    return [
      {
        rule: "KSR-2.5",
        match: m,
        explanation: `Write prices as "${correct}" — rupee symbol, Indian digit grouping, no "Rs." or "/-".`,
        suggestedFix: correct,
      },
    ];
  });

/** Keep the capitalisation of the original word when replacing it. */
function matchCase(original: string, replacement: string): string {
  if (original === original.toUpperCase() && original !== original.toLowerCase()) return replacement.toUpperCase();
  if (original[0] === original[0]?.toUpperCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}
