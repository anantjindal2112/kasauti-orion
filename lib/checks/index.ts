import { DEMO_TODAY, type BrandPack } from "@/lib/brand-pack";
import { checkAltText, checkHashtags } from "@/lib/checks/accessibility";
import {
  checkAbsolutes,
  checkExpiredCertifications,
  checkLedgerPrices,
  checkSuperlatives,
  findClaimCandidates,
} from "@/lib/checks/claims";
import { checkReadability } from "@/lib/checks/readability";
import {
  checkBannedWords,
  checkBrandName,
  checkCompetitors,
  checkPriceFormat,
  checkProductNames,
  checkReplacements,
} from "@/lib/checks/terminology";
import { dropOverlaps } from "@/lib/checks/text";
import type { CheckContext, RawFinding, TextCheck } from "@/lib/checks/types";
import { checkEmoji, checkExclamations, checkPressure, checkShouting } from "@/lib/checks/voice";
import type { ClaimCandidate, Finding, FindingLocation } from "@/lib/schemas/finding";

/** Checks that run on the draft body. */
const BODY_CHECKS: TextCheck[] = [
  checkExclamations,
  checkShouting,
  checkEmoji,
  checkPressure,
  checkBrandName,
  checkProductNames,
  checkReplacements,
  checkBannedWords,
  checkCompetitors,
  checkPriceFormat,
  checkReadability,
  checkSuperlatives,
  checkAbsolutes,
  checkLedgerPrices,
  checkExpiredCertifications,
  checkHashtags,
];

/**
 * Checks that run on text found inside images (OCR). Only facts and claims:
 * a logo wordmark in capitals is a visual question, not a voice one.
 */
const IMAGE_TEXT_CHECKS: TextCheck[] = [checkSuperlatives, checkAbsolutes, checkLedgerPrices, checkExpiredCertifications];

export interface CheckImage {
  file: string;
  alt: string | null;
  /** Text inside the image, from OCR (Stage 11) or supplied by the test set. */
  text?: string;
}

export interface CheckInput {
  text: string;
  images?: CheckImage[];
}

export interface CodeCheckResult {
  findings: Finding[];
  candidates: ClaimCandidate[];
}

/** Run every deterministic check. No network, no AI — this is also the fallback when AI is down. */
export function runCodeChecks(input: CheckInput, pack: BrandPack, opts: { today?: string } = {}): CodeCheckResult {
  const ctx: CheckContext = { pack, today: opts.today ?? DEMO_TODAY };
  const severityOf = new Map(pack.rules.map((r) => [r.code, r.severity]));

  /** A rule switched off in a custom brand pack simply produces no findings. */
  const active = (raw: RawFinding) => severityOf.has(raw.rule);
  const toFinding = (raw: RawFinding, location: FindingLocation, imageFile?: string): Finding => {
    const severity = severityOf.get(raw.rule)!;
    return {
      id: `${raw.rule}:${location}:${imageFile ?? ""}:${raw.match.start}`,
      rule: raw.rule,
      ...(raw.evidence ? { evidence: raw.evidence } : {}),
      quote: raw.match.text,
      location,
      span: { start: raw.match.start, end: raw.match.end },
      ...(imageFile ? { imageFile } : {}),
      explanation: raw.explanation,
      suggestedFix: raw.suggestedFix,
      confidence: raw.confidence ?? 1,
      severity,
      source: "rule",
      modelId: null,
    };
  };

  const findings: Finding[] = [
    ...dedupe(BODY_CHECKS.flatMap((check) => check(input.text, ctx)))
      .filter(active)
      .map((r) => toFinding(r, "text")),
  ];
  const candidates: ClaimCandidate[] = findClaimCandidates(input.text, ctx).map(({ match, ...c }) => ({
    ...c,
    text: match.text,
    span: { start: match.start, end: match.end },
    location: "text",
  }));

  for (const img of input.images ?? []) {
    if (img.text) {
      const raws = dedupe(IMAGE_TEXT_CHECKS.flatMap((check) => check(img.text!, ctx)));
      findings.push(...raws.filter(active).map((r) => toFinding(r, "image", img.file)));
      candidates.push(
        ...findClaimCandidates(img.text, ctx).map(({ match, ...c }) => ({
          ...c,
          text: match.text,
          span: { start: match.start, end: match.end },
          location: "image" as const,
          imageFile: img.file,
        })),
      );
    }
  }

  for (const miss of severityOf.has("KSR-5.1") ? checkAltText(input.images ?? []) : []) {
    findings.push(
      toFinding(
        {
          rule: "KSR-5.1",
          match: { start: 0, end: miss.file.length, text: miss.file },
          explanation: miss.explanation,
          suggestedFix: null,
        },
        "alt",
        miss.file,
      ),
    );
  }

  return { findings, candidates };
}

/** Within one rule, keep the longest of overlapping matches. */
function dedupe(raws: RawFinding[]): RawFinding[] {
  const byRule = Map.groupBy(raws, (r) => r.rule);
  return [...byRule.values()]
    .flatMap((group) => dropOverlaps(group.map((r) => ({ ...r.match, raw: r }))).map((m) => m.raw))
    .sort((a, b) => a.match.start - b.match.start || a.rule.localeCompare(b.rule));
}
