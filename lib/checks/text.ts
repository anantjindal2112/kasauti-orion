/** Text helpers shared by every code check. Spans always refer to the original string. */

export interface Match {
  start: number;
  end: number;
  text: string;
}

/**
 * Same-length normalisation, so offsets stay valid: curly quotes become straight.
 * (Each replacement is one UTF-16 code unit for one code unit.)
 */
export function normalize(s: string): string {
  return s.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;
export const isWordChar = (c: string | undefined): boolean => c !== undefined && WORD_CHAR.test(c);

/**
 * Find every occurrence of `term` in `text`. Word boundaries are enforced only on
 * sides where the term itself starts/ends with a word character, so "#1" and
 * "Rs." match naturally while "best" does not match inside "bestseller".
 */
export function findTerm(text: string, term: string, opts: { caseSensitive?: boolean } = {}): Match[] {
  const hay = normalize(text);
  const needle = normalize(term);
  if (!needle) return [];
  const re = new RegExp(escapeRegExp(needle), opts.caseSensitive ? "gu" : "giu");
  const out: Match[] = [];
  for (const m of hay.matchAll(re)) {
    const start = m.index;
    const end = start + m[0].length;
    if (isWordChar(needle[0]) && isWordChar(hay[start - 1])) continue;
    if (isWordChar(needle.at(-1)) && isWordChar(hay[end])) continue;
    out.push({ start, end, text: text.slice(start, end) });
  }
  return out;
}

/** Run a global regex and return matches with offsets. */
export function findRegex(text: string, re: RegExp): Match[] {
  if (!re.global) throw new Error("findRegex needs a global regex");
  return [...text.matchAll(re)].map((m) => ({ start: m.index, end: m.index + m[0].length, text: m[0] }));
}

/** Abbreviations whose full stop does not end a sentence. */
const ABBREVIATIONS = ["Co.", "Rs.", "No.", "no.", "e.g.", "i.e.", "St.", "Mr.", "Ms.", "Dr.", "vs."];

export function splitSentences(text: string): Match[] {
  const out: Match[] = [];
  let start = 0;
  const push = (from: number, to: number) => {
    const raw = text.slice(from, to);
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed) out.push({ start: from + lead, end: from + lead + trimmed.length, text: trimmed });
  };
  for (const m of text.matchAll(/[.!?]+(?=\s|$)/g)) {
    const end = m.index + m[0].length;
    if (m[0] === "." && ABBREVIATIONS.some((a) => text.slice(end - a.length, end) === a)) continue;
    push(start, end);
    start = end;
  }
  push(start, text.length);
  return out;
}

/** Words for readability: tokens containing a letter or digit. */
export function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
}

/** Indian digit grouping: 1499 → "₹1,499", 150000 → "₹1,50,000". */
export function formatInr(amount: number): string {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(amount)}`;
}

/** Merge matches separated only by whitespace (e.g. "HUGE" + "NEWS" → "HUGE NEWS"). */
export function mergeAdjacent(text: string, matches: Match[]): Match[] {
  const sorted = [...matches].sort((a, b) => a.start - b.start);
  const out: Match[] = [];
  for (const m of sorted) {
    const prev = out.at(-1);
    if (prev && m.start >= prev.end && /^\s*$/.test(text.slice(prev.end, m.start))) {
      prev.end = m.end;
      prev.text = text.slice(prev.start, prev.end);
    } else {
      out.push({ ...m });
    }
  }
  return out;
}

/** Keep the longest of overlapping matches. */
export function dropOverlaps<T extends Match>(matches: T[]): T[] {
  const byLength = [...matches].sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: T[] = [];
  for (const m of byLength) {
    if (!kept.some((k) => m.start < k.end && k.start < m.end)) kept.push(m);
  }
  return kept.sort((a, b) => a.start - b.start);
}
