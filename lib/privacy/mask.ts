/**
 * Mask personal data before any model call (trust rule 03: confidential by default).
 * Code-based: our NVIDIA account has no PII model, and regexes can't hallucinate.
 */

export type PiiType = "EMAIL" | "PHONE" | "AADHAAR" | "PAN" | "CARD" | "UPI" | "MARKED";

export interface MaskToken {
  token: string;
  original: string;
  type: PiiType;
}

export interface MaskResult {
  masked: string;
  tokens: MaskToken[];
}

/**
 * Order matters: earlier patterns win where matches overlap.
 * `[[like this]]` lets a creator mark any span as confidential.
 */
const PATTERNS: [PiiType, RegExp][] = [
  ["MARKED", /\[\[([\s\S]+?)\]\]/g],
  ["EMAIL", /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g],
  ["UPI", /\b[A-Za-z0-9._-]{2,}@(?:ok\w+|ybl|ibl|axl|upi|paytm|apl|icici|sbi|hdfcbank)\b/gi],
  ["PAN", /\b[A-Z]{5}\d{4}[A-Z]\b/g],
  // Cards before Aadhaar: a 16-digit card would otherwise lose its first 12 digits to the Aadhaar pattern.
  ["CARD", /\b(?:\d[ -]?){13,19}\b/g],
  ["AADHAAR", /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g],
  ["PHONE", /(?:\+91[\s-]?|\b0)?\b[6-9]\d{4}[\s-]?\d{5}\b/g],
];

export function maskPII(text: string): MaskResult {
  const found: { start: number; end: number; type: PiiType; original: string }[] = [];
  for (const [type, re] of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      if (found.some((f) => start < f.end && f.start < end)) continue;
      found.push({ start, end, type, original: type === "MARKED" ? m[1] : m[0] });
    }
  }
  found.sort((a, b) => a.start - b.start);

  const counters = new Map<PiiType, number>();
  const tokens: MaskToken[] = [];
  let masked = "";
  let last = 0;
  for (const f of found) {
    const n = (counters.get(f.type) ?? 0) + 1;
    counters.set(f.type, n);
    const token = `⟦${f.type}_${n}⟧`;
    tokens.push({ token, original: f.original, type: f.type });
    masked += text.slice(last, f.start) + token;
    last = f.end;
  }
  masked += text.slice(last);
  return { masked, tokens };
}

/** Put the originals back into model output (e.g. a suggested fix that kept a token). */
export function unmaskPII(text: string, tokens: MaskToken[]): string {
  return tokens.reduce((out, t) => out.split(t.token).join(t.original), text);
}
