import { isExpired, type BrandPack } from "@/lib/brand-pack";
import { certificateNames, superlativeHits } from "@/lib/checks/claims";
import { withHindiTerms } from "@/lib/checks/hindi";
import type { CheckInput } from "@/lib/checks";
import { dropOverlaps, findTerm, splitSentences, type Match } from "@/lib/checks/text";
import { classifyFacts, topicWords } from "@/lib/ledger/facts";
import type { Evidence } from "@/lib/schemas/brand-pack";
import type { ClaimKind, ClaimStatus, LedgerClaim } from "@/lib/schemas/claim";
import type { Finding, FindingLocation } from "@/lib/schemas/finding";

/**
 * Stage 7 — the Claim Ledger for one draft: every checkable statement, and what the
 * ledger says about it. Code decides everything it can; what it can't is `unchecked`
 * until the AI ledger pass (lib/ledger/ai.ts) or a person decides.
 */

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

interface Draft {
  match: Match;
  kind: ClaimKind;
  status: ClaimStatus;
  evidence?: Evidence;
  fix?: string | null;
  note: string;
}

function sentenceOf(text: string, m: Match): string {
  return splitSentences(text).find((s) => m.start >= s.start && m.start < s.end)?.text ?? text;
}

/** Code-only claims in one piece of text (draft body or text read from an image). */
function codeClaims(text: string, pack: BrandPack, today: string): Draft[] {
  const ctx = { pack, today };
  const out: Draft[] = [];

  for (const m of dropOverlaps(pack.terms.absoluteClaims.flatMap((a) => findTerm(text, a)))) {
    out.push({ match: m, kind: "absolute", status: "no_evidence", note: `"${m.text}" is an absolute promise — no evidence can back it (KSR-4.4).` });
  }

  for (const m of superlativeHits(text, ctx)) {
    out.push(
      m.approvedBy
        ? { match: m, kind: "superlative", status: "verified", evidence: m.approvedBy, note: `Uses the approved wording of ${m.approvedBy.code}: "${m.approvedBy.claim}"` }
        : { match: m, kind: "superlative", status: "no_evidence", note: `No ledger entry proves "${m.text}". No evidence, no claim (KSR-4.2).` },
    );
  }

  for (const [name, entries] of certificateNames(pack)) {
    for (const m of findTerm(text, name)) {
      const live = entries.filter((e) => !isExpired(e, today));
      if (!live.length) {
        const e = entries[0];
        out.push({
          match: m,
          kind: "certification",
          status: "stale",
          evidence: e,
          note: `${e.code} expired on ${formatDate(e.expiresAt!)} (last verified ${formatDate(e.verifiedAt)}).${e.conditions ? ` ${e.conditions}` : ""}`,
        });
        continue;
      }
      // A certificate covers a product line. Verified only when the sentence names what it covers.
      const sentence = sentenceOf(text, m);
      const covered = live.find((e) => {
        const words = topicWords(e);
        return words.length === 0 || words.some((w) => findTerm(sentence, w).length > 0);
      });
      out.push(
        covered
          ? { match: m, kind: "certification", status: "verified", evidence: covered, note: `Backed by ${covered.code} "${covered.claim}", ${covered.expiresAt ? `valid until ${formatDate(covered.expiresAt)}` : "no expiry"}.` }
          : {
              match: m,
              kind: "certification",
              status: "unchecked",
              evidence: live[0],
              note: `${live[0].code} is live, but covers only: ${live.map((e) => e.conditions ?? e.claim).join(" ")} Check the draft doesn't stretch it.`,
            },
      );
    }
  }

  out.push(
    ...classifyFacts(text, pack, today).map((f) => ({
      match: f.match,
      kind: f.kind,
      status: f.status,
      evidence: f.evidence,
      fix: f.fix,
      note: f.note,
    })),
  );

  // Claim-ish words code can't judge ("award-winning", "eco-friendly") — unless another claim already covers them.
  // Only certificates and numbers "cover" nearby words; "eco-friendly" next to "never fade" is still its own claim.
  const decided = out.filter((d) => d.kind !== "absolute" && d.kind !== "superlative");
  const sentences = splitSentences(text);
  const sameSentence = (a: Match, b: Match) => sentences.some((s) => a.start >= s.start && a.start < s.end && b.start >= s.start && b.start < s.end);
  for (const term of pack.terms.claimCandidates) {
    for (const m of findTerm(text, term)) {
      // "GOTS-certified organic", "Rated 4.6 out of 5": the nearby claim already covers the word.
      if (/^favou?rite$/i.test(m.text) && /\byour\s+(?:new\s+)?$/i.test(text.slice(Math.max(0, m.start - 12), m.start))) continue; // the reader's choice, not a claim
      if (decided.some((d) => sameSentence(d.match, m) && Math.min(Math.abs(d.match.start - m.end), Math.abs(m.start - d.match.end)) <= 40)) continue;
      out.push({ match: m, kind: "trigger", status: "unchecked", note: `"${m.text}" may be a claim. AI review or a person must check it against the ledger.` });
    }
  }

  // One claim per stretch of text: the first-listed (most specific) wins.
  const kept: Draft[] = [];
  for (const d of out) if (!kept.some((k) => overlaps(k.match, d.match))) kept.push(d);
  return kept.sort((a, b) => a.match.start - b.match.start);
}

function toClaim(d: Draft, text: string, location: FindingLocation, imageFile?: string): LedgerClaim {
  return {
    id: `claim:${location}:${imageFile ?? ""}:${d.match.start}`,
    text: d.match.text,
    span: { start: d.match.start, end: d.match.end },
    location,
    ...(imageFile ? { imageFile } : {}),
    sentence: sentenceOf(text, d.match),
    kind: d.kind,
    status: d.status,
    ...(d.evidence ? { evidence: d.evidence.code } : {}),
    suggestedFix: d.fix ?? null,
    note: d.note,
    source: "rule",
    modelId: null,
    confidence: 1,
  };
}

/** Every claim code can find in the draft body and in text read from images. */
export function buildCodeLedger(input: CheckInput, basePack: BrandPack, today: string): LedgerClaim[] {
  const pack = withHindiTerms(basePack);
  const claims = codeClaims(input.text, pack, today).map((d) => toClaim(d, input.text, "text"));
  for (const img of input.images ?? []) {
    if (img.text) claims.push(...codeClaims(img.text, pack, today).map((d) => toClaim(d, img.text!, "image", img.file)));
  }
  return claims;
}

const CLAIM_RULES = /^KSR-4\./;

/**
 * Line the ledger up with the findings: link each claim to the finding on the same words, and
 * let a claims finding (KSR-4.x) settle a claim code couldn't — e.g. the reviewer's KSR-4.3 scope
 * finding on "Every product is GOTS-certified" turns that claim into "no evidence".
 */
export function reconcile(claims: LedgerClaim[], findings: Finding[]): LedgerClaim[] {
  return claims.map((c) => {
    const same = findings.filter(
      (f) => f.location === c.location && (f.imageFile ?? "") === (c.imageFile ?? "") && overlaps(f.span, c.span),
    );
    const claimFinding = same.find((f) => CLAIM_RULES.test(f.rule));
    const linked = claimFinding ?? same[0];
    if (!linked) return c;
    const out: LedgerClaim = { ...c, findingId: linked.id };
    const settles = claimFinding && claimFinding.review !== "needs_review";
    // A finding that passed the Verifier outranks an AI ledger verdict and a scope-unchecked certificate.
    if (settles && (c.status === "unchecked" || (c.status === "verified" && (c.kind === "certification" || c.source === "ai")))) {
      out.status = "no_evidence";
      out.note = claimFinding.explanation;
      if (claimFinding.evidence) out.evidence = claimFinding.evidence;
    }
    return out;
  });
}

/** Counts for the summary line. */
export function ledgerSummary(claims: LedgerClaim[]): Record<ClaimStatus, number> {
  const out: Record<ClaimStatus, number> = { verified: 0, stale: 0, contradicted: 0, no_evidence: 0, unchecked: 0 };
  for (const c of claims) out[c.status]++;
  return out;
}
