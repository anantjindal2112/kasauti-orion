import { findRegex, findTerm, mergeAdjacent, type Match } from "@/lib/checks/text";
import type { RawFinding, TextCheck } from "@/lib/checks/types";

/** KSR-1.3 — at most N exclamation marks, never stacked. */
export const checkExclamations: TextCheck = (text, { pack }) => {
  const max = pack.brand.limits.maxExclamationMarks;
  const stacked = findRegex(text, /!{2,}/g);
  if (stacked.length) {
    return stacked.map((m) => ({
      rule: "KSR-1.3",
      match: m,
      explanation: `Stacked exclamation marks ("${m.text}"). Use at most ${max} in a piece, and never more than one in a row.`,
      suggestedFix: ".",
    }));
  }
  const all = findRegex(text, /!/g);
  return all.slice(max).map((m) => ({
    rule: "KSR-1.3",
    match: m,
    explanation: `${all.length} exclamation marks in one piece; the limit is ${max}.`,
    suggestedFix: ".",
  }));
};

/** KSR-1.4 — no ALL-CAPS words except approved acronyms. */
export const checkShouting: TextCheck = (text, { pack }) => {
  const approved = new Set(pack.terms.approvedAcronyms);
  const tokens = findRegex(text, /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  const shouty = tokens.filter((t) => {
    if (text[t.start - 1] === "#" || approved.has(t.text)) return false;
    const letters = t.text.replace(/[^\p{L}]/gu, "");
    return letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  });
  return mergeAdjacent(text, shouty).map((m) => {
    const lower = m.text.toLowerCase();
    return {
      rule: "KSR-1.4",
      match: m,
      explanation: `"${m.text}" is written in capitals, which reads as shouting.`,
      suggestedFix: lower.charAt(0).toUpperCase() + lower.slice(1),
    };
  });
};

const EMOJI = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/gu;

/** KSR-1.5 — at most N emoji. Flags each run of emoji that goes past the limit. */
export const checkEmoji: TextCheck = (text, { pack }) => {
  const max = pack.brand.limits.maxEmoji;
  const emoji = findRegex(text, EMOJI);
  if (emoji.length <= max) return [];

  // Group directly adjacent emoji into runs, remembering each emoji's overall index.
  const runs: { match: Match; first: number; count: number }[] = [];
  emoji.forEach((e, i) => {
    const run = runs.at(-1);
    if (run && run.match.end === e.start) {
      run.match = { start: run.match.start, end: e.end, text: text.slice(run.match.start, e.end) };
      run.count++;
    } else {
      runs.push({ match: e, first: i, count: 1 });
    }
  });

  return runs
    .filter((r) => r.first + r.count > max)
    .map((r): RawFinding => {
      const keep = Math.max(0, max - r.first);
      const kept = emoji.slice(r.first, r.first + keep).map((e) => e.text).join("");
      return {
        rule: "KSR-1.5",
        match: r.match,
        explanation: `${emoji.length} emoji in one piece; the limit is ${max}.`,
        suggestedFix: kept,
      };
    });
};

/** KSR-1.6 — fear and pressure phrases. */
export const checkPressure: TextCheck = (text, { pack }) => {
  const hits = pack.terms.pressurePhrases.flatMap((p) => findTerm(text, p));
  return mergeAdjacent(text, hits).map((m) => ({
    rule: "KSR-1.6",
    match: m,
    explanation: `"${m.text}" pressures the reader. Urgency is fine when it's true (a real end date); fear and guilt are not.`,
    suggestedFix: null,
  }));
};
