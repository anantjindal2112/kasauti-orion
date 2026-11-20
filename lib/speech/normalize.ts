/**
 * Speech models write numbers as words ("one thousand four hundred ninety nine rupees").
 * Prices and percentages must be digits for the Claim Ledger to check them, and this is
 * plain arithmetic, so it is done in code rather than asked of a model. English only.
 */
const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { thousand: 1_000, lakh: 100_000, lakhs: 100_000, million: 1_000_000, crore: 10_000_000, crores: 10_000_000 };
const WORD = new RegExp(`^(?:${[...Object.keys(UNITS), ...Object.keys(TENS), ...Object.keys(SCALES), "hundred", "and"].join("|")})$`, "i");

/** Value of a run of number words, or null if it isn't a number. */
function parseNumber(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let seen = false;
  for (const raw of words) {
    const w = raw.toLowerCase();
    if (w === "and") continue;
    seen = true;
    if (w in UNITS) current += UNITS[w];
    else if (w in TENS) current += TENS[w];
    else if (w === "hundred") current = (current || 1) * 100;
    else if (w in SCALES) {
      total += (current || 1) * SCALES[w];
      current = 0;
    } else return null;
  }
  return seen ? total + current : null;
}

const group = (n: number) => n.toLocaleString("en-IN");

export function normalizeSpokenEnglish(text: string): string {
  const tokens = text.split(/(\s+)/);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const core = t.replace(/[^\p{L}]/gu, "");
    if (!core || !WORD.test(core) || core.toLowerCase() === "and") {
      out.push(t);
      continue;
    }
    // Collect the run of number words (spaces between them included).
    let j = i;
    let end = i + 1; // just past the last number word
    const run: string[] = [];
    const trailing = (s: string) => s.match(/[^\p{L}\s]+$/u)?.[0] ?? "";
    let tail = "";
    while (j < tokens.length) {
      const w = tokens[j].replace(/[^\p{L}]/gu, "");
      if (tokens[j].trim() === "") {
        j++;
        continue;
      }
      if (!w || !WORD.test(w)) break;
      run.push(w);
      tail = trailing(tokens[j]);
      j++;
      end = j;
      if (tail) break; // punctuation ends the number
    }
    j = end;
    while (run.length && run[run.length - 1].toLowerCase() === "and") run.pop();
    const value = parseNumber(run);
    // A lone "one" or "two" is usually just a word ("one of our"); only convert when it's clearly a quantity.
    const next = tokens.slice(j).find((x) => x.trim())?.replace(/[^\p{L}]/gu, "").toLowerCase() ?? "";
    const isMoney = /^(rupees?|rs)$/.test(next);
    const isPercent = /^(percent|per)$/.test(next);
    const big = run.length > 1 || (value !== null && value >= 10);
    if (value === null || (!big && !isMoney && !isPercent)) {
      out.push(t);
      continue;
    }
    let consumed = j;
    let rendered = group(value);
    if (isMoney) {
      rendered = `₹${rendered}`;
      consumed = tokens.findIndex((x, k) => k >= j && x.trim()) + 1;
    } else if (isPercent) {
      rendered = `${rendered}%`;
      let k = tokens.findIndex((x, n) => n >= j && x.trim());
      if (tokens[k].replace(/[^\p{L}]/gu, "").toLowerCase() === "per" && /^cent/i.test((tokens[k + 2] ?? "").replace(/[^\p{L}]/gu, ""))) k += 2;
      consumed = k + 1;
    }
    out.push(rendered + (tail && !isMoney && !isPercent ? tail : tokens[consumed - 1]?.match(/[^\p{L}\s]+$/u)?.[0] ?? ""));
    i = consumed - 1;
  }
  return out.join("");
}
