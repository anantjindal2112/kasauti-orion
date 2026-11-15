import type { BrandPack } from "@/lib/brand-pack";
import { runCodeChecks } from "@/lib/checks";
import { applyFixes, type TextFix } from "@/lib/fixes/apply";
import { inventedFacts } from "@/lib/pipeline/verifier";
import type { Finding } from "@/lib/schemas/finding";

/**
 * "Accept all fixes" must converge: after one click, a re-check should find nothing new.
 * So every fix is tried inside the whole draft and re-checked by code before it is offered,
 * overlapping fixes are merged instead of skipped, and code-fixable leftovers are cleaned up
 * in the same pass.
 */

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;
const key = (f: Pick<Finding, "rule" | "quote">) => `${f.rule}|${f.quote}`;
const asFix = (f: Finding): TextFix => ({ start: f.span.start, end: f.span.end, replacement: f.suggestedFix ?? f.quote });

function textFindings(text: string, pack: BrandPack, today: string) {
  return runCodeChecks({ text }, pack, { today }).findings.filter((f) => f.location === "text");
}

/**
 * Is `fix` safe for `finding`? Applied to the draft, the finding's rule must be gone from that
 * spot, no code rule may newly break there, and no price or % may be invented.
 * `resolves` lists other findings the fix must also clear (when it covers them).
 */
export function fixHolds(
  draft: string,
  finding: Pick<Finding, "span" | "rule" | "location">,
  fix: string,
  pack: BrandPack,
  today: string,
  resolves: Pick<Finding, "rule" | "location">[] = [],
): { ok: true } | { ok: false; reason: string } {
  const invented = inventedFacts(fix, draft, pack);
  if (invented.length) return { ok: false, reason: `uses ${invented.join(", ")}, which isn't in the draft or the Claim Ledger` };
  const before = new Set(textFindings(draft, pack, today).map(key));
  const fixed = applyFixes(draft, [{ start: finding.span.start, end: finding.span.end, replacement: fix }]);
  // The seam tidy can shift text by a character or two: look a little wider than the fix itself.
  const region = { start: Math.max(0, finding.span.start - 2), end: finding.span.start + fix.length + 2 };
  const after = textFindings(fixed, pack, today).filter((f) => overlaps(f.span, region));
  const broke = after.filter((f) => !before.has(key(f)));
  if (broke.length) return { ok: false, reason: `would break ${[...new Set(broke.map((b) => b.rule))].join(", ")}` };
  const codeRules = new Set([finding, ...resolves].filter((f) => f.location === "text").map((f) => f.rule));
  const left = after.filter((f) => codeRules.has(f.rule));
  if (left.length) return { ok: false, reason: `doesn't clear ${[...new Set(left.map((l) => l.rule))].join(", ")}` };
  return { ok: true };
}

export interface FixAllPlan {
  /** The draft with every safe fix applied. */
  text: string;
  /** Findings this resolves (applied directly, or covered by a larger fix). */
  applied: string[];
}

const SEVERITY = { high: 0, medium: 1, low: 2 } as const;

export function planFixAll(draft: string, findings: Finding[], pack: BrandPack, today: string): FixAllPlan {
  // Only confident fixes: findings sent to a person stay with the person.
  const candidates = findings.filter((f) => f.location === "text" && f.suggestedFix !== null && f.review !== "needs_review");
  // Larger spans first, so a fix that covers smaller ones ("30% off everything" → "20% off … until 16 November")
  // is tried before them; ties go to the more severe.
  const order = [...candidates].sort(
    (a, b) => b.span.end - b.span.start - (a.span.end - a.span.start) || SEVERITY[a.severity] - SEVERITY[b.severity] || a.span.start - b.span.start,
  );

  const chosen: Finding[] = [];
  const applied = new Set<string>();
  for (const f of order) {
    if (applied.has(f.id) || chosen.some((c) => overlaps(c.span, f.span))) continue;
    const inner = candidates.filter((o) => o !== f && overlaps(o.span, f.span) && !applied.has(o.id));
    const covers = inner.every((o) => o.span.start >= f.span.start && o.span.end <= f.span.end);
    if (inner.length) {
      // Take the larger fix only if it really clears what it covers; otherwise let the smaller fixes go first.
      if (!covers || !fixHolds(draft, f, f.suggestedFix!, pack, today, inner).ok) continue;
      inner.forEach((o) => applied.add(o.id));
    }
    chosen.push(f);
    applied.add(f.id);
  }

  let text = applyFixes(draft, chosen.map(asFix));

  // Code fixes are deterministic: apply whatever code still finds a fix for, until the draft settles.
  for (let round = 0; round < 3; round++) {
    const leftovers = textFindings(text, pack, today).filter((f) => f.suggestedFix !== null);
    const batch: Finding[] = [];
    for (const f of leftovers) if (!batch.some((b) => overlaps(b.span, f.span))) batch.push(f);
    if (!batch.length) break;
    const next = applyFixes(text, batch.map(asFix));
    if (next === text) break;
    text = next;
  }

  return { text, applied: [...applied] };
}
