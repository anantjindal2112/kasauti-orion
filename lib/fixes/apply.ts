/**
 * Apply replacements to a draft and tidy the seams, so fixes that sit next to each other
 * don't leave "Co.." or ", ." or a lowercase sentence start behind. Pure: safe in the browser.
 */

export interface TextFix {
  start: number;
  end: number;
  replacement: string;
}

/** Join two pieces of text, cleaning up what a replacement or deletion leaves at the seam. */
export function joinSeam(left: string, right: string): string {
  // "Co." + "." → "Co."  (but keep a real ellipsis)
  if (/[.!?]$/.test(left) && /^\.(?!\.)/.test(right)) right = right.slice(1);
  // A deletion before punctuation: "never fade, " + "." → "never fade."
  if (/,\s*$/.test(left) && /^\s*[.,!?;]/.test(right)) left = left.replace(/,\s*$/, "");
  // No space before punctuation, no double spaces.
  if (/\s$/.test(left) && /^[.,!?;]/.test(right)) left = left.replace(/\s+$/, "");
  if (/\s$/.test(left) && /^\s/.test(right)) {
    left = left.replace(/\s+$/, " ");
    right = right.replace(/^\s+/, "");
  }
  // At the start of a sentence: no leading comma, capital first letter.
  if (/(^|[.!?]\s+)$/.test(left)) {
    right = right.replace(/^[,;]\s*/, "");
    right = right.replace(/^\p{Ll}/u, (c) => c.toUpperCase());
  }
  return left + right;
}

/** Apply non-overlapping fixes (right to left, so offsets stay valid). */
export function applyFixes(text: string, fixes: TextFix[]): string {
  let out = text;
  for (const f of [...fixes].sort((a, b) => b.start - a.start)) {
    out = joinSeam(joinSeam(out.slice(0, f.start), f.replacement), out.slice(f.end));
  }
  return out;
}
