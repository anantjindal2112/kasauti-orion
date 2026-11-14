import type { Draft, ExpectedFinding } from "@/lib/schemas/brand-pack";
import type { Finding } from "@/lib/schemas/finding";

/**
 * A finding matches an expected one when the rule and location agree and one
 * quote contains the other (e.g. expected "Free shipping on all orders above ₹999",
 * found "₹999").
 */
export function matches(expected: ExpectedFinding, actual: Finding): boolean {
  return (
    expected.rule === actual.rule &&
    expected.location === actual.location &&
    (expected.quote.includes(actual.quote) || actual.quote.includes(expected.quote))
  );
}

export interface DraftScore {
  draftId: string;
  hits: ExpectedFinding[];
  misses: ExpectedFinding[];
  /** Findings that match no expected item — false positives, or gaps in the answer key. */
  extras: Finding[];
}

export function scoreDraft(draft: Draft, findings: Finding[]): DraftScore {
  const hit = new Set<ExpectedFinding>();
  const extras: Finding[] = [];
  for (const f of findings) {
    const exp = draft.expected.filter((e) => matches(e, f));
    if (exp.length) exp.forEach((e) => hit.add(e));
    else extras.push(f);
  }
  return {
    draftId: draft.id,
    hits: draft.expected.filter((e) => hit.has(e)),
    misses: draft.expected.filter((e) => !hit.has(e)),
    extras,
  };
}

/** Expected findings that need image pixels (contrast, logo, palette) — Stage 11, not text code checks. */
export const needsImageAnalysis = (e: ExpectedFinding) => e.rule.startsWith("KSR-3.");

/** Expected findings that the code checks in Stage 4 are responsible for. */
export const codeResponsibility = (e: ExpectedFinding) => e.detectedBy === "code" && !needsImageAnalysis(e);
