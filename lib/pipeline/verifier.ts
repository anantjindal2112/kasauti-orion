import type { BrandPack } from "@/lib/brand-pack";
import { runCodeChecks } from "@/lib/checks";
import { PRICE_RE, parseAmount } from "@/lib/checks/terminology";
import { findRegex, normalize, splitSentences } from "@/lib/checks/text";
import type { AiFinding } from "@/lib/pipeline/ai-review";
import { unmaskPII, type MaskToken } from "@/lib/privacy/mask";
import type { Finding } from "@/lib/schemas/finding";

/** Below this, a finding goes to a person instead of being shown as verified. */
export const CONFIDENCE_FLOOR = 0.6;
/** Quotes longer than this are too broad to count as a pinned-down finding. */
export const MAX_QUOTE_WORDS = 18;

export interface Dropped {
  finding: AiFinding;
  reason: string;
}

export interface VerifierResult {
  kept: Finding[];
  dropped: Dropped[];
}

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

/** Strip quote marks a model sometimes wraps around the quote. */
const tidyQuote = (q: string) => q.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, "").trim();

/**
 * Find the quote in the draft. Exact match first; then allow only curly-vs-straight quote
 * differences (normalize() keeps lengths, so offsets stay valid). Prefers an occurrence no other
 * kept finding has claimed; falls back to the first one so duplicates are caught downstream.
 */
function locate(draft: string, quote: string, taken: { start: number; end: number }[]): { start: number; end: number } | null {
  const attempts: [string, string][] = [
    [draft, quote],
    [normalize(draft), normalize(quote)],
  ];
  for (const [hay, needle] of attempts) {
    const hits: number[] = [];
    for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) hits.push(i);
    if (!hits.length) continue;
    const free = hits.find((i) => !taken.some((s) => s.start === i));
    const at = free ?? hits[0];
    return { start: at, end: at + quote.length };
  }
  return null;
}

const CTA_VERBS = /\b(shop|buy|order|follow|refer|download|subscribe|sign up|join|visit|share|tag|click|book|call|install|register)\b/gi;

/**
 * Test 2b — the quote must contain what the rule is about. Catches the deck's "known limit":
 * a real rule and a real quote that don't belong together (e.g. "soft, breathable" cited as a certification claim).
 */
export const RULE_GUARDS: Record<string, { test: (quote: string) => boolean; about: string }> = {
  "KSR-4.1": { test: (q) => /\d/.test(q), about: "a price, number or date" },
  "KSR-4.2": {
    test: (q) => /(#\s?1|best|most|top|leading|favou?rite|award|number one|no\.\s?1|trusted|loved|biggest|lowest|only brand|unbeatable)/i.test(q),
    about: "a superlative or comparative claim",
  },
  "KSR-4.3": { test: (q) => /(gots|oeko|certif|azo|organic|lab[- ]tested|accredit)/i.test(q), about: "a certification" },
  "KSR-4.5": {
    test: (q) => /(eco|green|sustainab|planet|earth|natural|environment|carbon|conscious|ethical)/i.test(q),
    about: "a green or sustainability claim",
  },
  "KSR-6.1": { test: (q) => new Set((q.match(CTA_VERBS) ?? []).map((v) => v.toLowerCase())).size >= 2, about: "two or more different calls to action" },
  "KSR-6.2": { test: (q) => /(%|\boff\b|sale|free|discount|offer|deal|price|₹|today only|limited)/i.test(q), about: "an offer" },
  "KSR-1.6": { test: (q) => /(only|last|hurry|now|miss|regret|before|ends?\b|limited|quick|fast|today)/i.test(q), about: "pressure or urgency" },
};

/** Every ₹ amount and percentage in the fix must already exist in the draft or the Claim Ledger. */
function inventedFacts(fix: string, draft: string, pack: BrandPack): string[] {
  const known = new Set<number>();
  for (const m of findRegex(draft, PRICE_RE)) known.add(parseAmount(m.text) ?? -1);
  for (const e of pack.evidence) {
    if (e.value.kind === "price" || e.value.kind === "threshold") known.add(e.value.amountInr);
    if (e.value.kind === "percent") known.add(e.value.percent);
  }
  const draftPercents = new Set(findRegex(draft, /\d+(?:\.\d+)?\s?%/g).map((m) => Number(m.text.replace(/[^\d.]/g, ""))));
  const bad: string[] = [];
  for (const m of findRegex(fix, PRICE_RE)) if (!known.has(parseAmount(m.text) ?? -1)) bad.push(m.text);
  for (const m of findRegex(fix, /\d+(?:\.\d+)?\s?%/g)) {
    const n = Number(m.text.replace(/[^\d.]/g, ""));
    if (!known.has(n) && !draftPercents.has(n)) bad.push(m.text);
  }
  return bad;
}

/**
 * The Verifier. Nothing an AI says reaches a person until it passes:
 *   1. the cited rule (and evidence) exists in this brand's library, and is an AI-judged rule;
 *   2. the quote appears in the draft, character for character;
 *   3. the suggested fix passes the code checks again and invents no prices or percentages.
 * Fail 1 or 2 → dropped. Fail 3, or confidence below the floor → kept, marked "needs human review".
 * (Test 3 gains the Intent Check in Stage 10.)
 */
export function verify(args: {
  draft: string;
  aiFindings: AiFinding[];
  codeFindings: Finding[];
  pack: BrandPack;
  modelId: string;
  tokens?: MaskToken[];
  today?: string;
}): VerifierResult {
  const { draft, aiFindings, codeFindings, pack, modelId, tokens = [], today } = args;
  const rules = new Map(pack.rules.map((r) => [r.code, r]));
  const evidence = new Set(pack.evidence.map((e) => e.code));
  const kept: Finding[] = [];
  const dropped: Dropped[] = [];
  const baseline = new Set(runCodeChecks({ text: draft }, pack, { today }).findings.map((f) => `${f.rule}|${f.quote}`));

  for (const raw of aiFindings) {
    const quote = tidyQuote(unmaskPII(raw.quote, tokens));
    const fixIn = raw.suggestedFix === null ? null : unmaskPII(raw.suggestedFix, tokens);
    const explanation = unmaskPII(raw.explanation, tokens).trim();
    const drop = (reason: string) => dropped.push({ finding: raw, reason });

    // Test 1 — the citation is real.
    const rule = rules.get(raw.rule.trim());
    if (!rule) {
      drop(`unknown rule ${raw.rule}`);
      continue;
    }
    if (rule.checkType === "code") {
      drop(`${rule.code} is a code-only rule`);
      continue;
    }
    // Evidence is optional. Models sometimes write prose here ("KLE-10: 20% off…"):
    // keep the first real code, ignore the rest. A code that is not in the ledger fails the test.
    const evRaw = raw.evidence?.trim() ?? "";
    const evCode = /KLE-\d{2}/.exec(evRaw)?.[0];
    if (evCode && !evidence.has(evCode)) {
      drop(`unknown evidence ${evCode}`);
      continue;
    }
    const ev = evCode;

    // Test 2 — the quote is really in the draft.
    if (!quote) {
      drop("empty quote");
      continue;
    }
    const span = locate(draft, quote, kept.map((k) => k.span));
    if (!span) {
      drop(`quote not found in draft: "${quote.slice(0, 60)}"`);
      continue;
    }
    const guard = RULE_GUARDS[rule.code];
    if (guard && !guard.test(quote)) {
      drop(`quote does not contain ${guard.about}, so it can't break ${rule.code}`);
      continue;
    }
    const sameAsCode = codeFindings.some((c) => c.location === "text" && c.rule === rule.code && overlaps(c.span, span));
    const sameAsAi = kept.some((k) => k.rule === rule.code && overlaps(k.span, span));
    if (sameAsCode || sameAsAi) {
      drop(sameAsCode ? "duplicate of a code check" : "duplicate finding");
      continue;
    }

    // Test 3 — the fix is safe to offer.
    let suggestedFix = fixIn;
    const notes: string[] = [];
    if (suggestedFix !== null) {
      const invented = inventedFacts(suggestedFix, draft, pack);
      if (invented.length) {
        notes.push(`Fix removed: it used ${invented.join(", ")}, which is not in the draft or the Claim Ledger.`);
        suggestedFix = null;
      } else {
        const fixed = draft.slice(0, span.start) + suggestedFix + draft.slice(span.end);
        const region = { start: span.start, end: span.start + suggestedFix.length };
        const broken = runCodeChecks({ text: fixed }, pack, { today }).findings.filter(
          (f) => f.location === "text" && overlaps(f.span, region) && !baseline.has(`${f.rule}|${f.quote}`),
        );
        if (broken.length) {
          notes.push(`Fix removed: it broke ${[...new Set(broken.map((b) => b.rule))].join(", ")}.`);
          suggestedFix = null;
        }
      }
    }
    if (raw.confidence < CONFIDENCE_FLOOR) notes.unshift(`Low confidence (${Math.round(raw.confidence * 100)}%).`);
    // Vague rules and tone are judgement calls by design — a person decides, and the Radar learns from it.
    if (rule.knownUnclear) notes.push(`${rule.code} is a vague rule, so a person makes the call.`);
    else if (rule.layer === "voice") notes.push("Tone is a judgement call, so a person makes the final decision.");
    // A finding that quotes most of the draft hasn't pinned down the problem.
    const quoteWords = quote.split(/\s+/).length;
    const multiSentence = splitSentences(quote).length > 1; // knows "Co." and "Rs." aren't sentence ends
    if (quoteWords > MAX_QUOTE_WORDS || multiSentence) {
      notes.push("The quote spans more than one sentence, so the exact problem isn't pinned down.");
    }

    kept.push({
      id: `ai:${rule.code}:${span.start}`,
      rule: rule.code,
      ...(ev ? { evidence: ev } : {}),
      quote: draft.slice(span.start, span.end),
      location: "text",
      span,
      explanation,
      suggestedFix,
      confidence: Math.max(0, Math.min(1, raw.confidence)),
      severity: rule.severity,
      source: "ai",
      modelId,
      review: notes.length ? "needs_review" : "verified",
      ...(notes.length ? { reviewNote: notes.join(" ") } : {}),
    });
  }

  return { kept, dropped };
}
