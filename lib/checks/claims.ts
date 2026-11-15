import { isExpired } from "@/lib/brand-pack";
import type { Evidence } from "@/lib/schemas/brand-pack";
import { dropOverlaps, findTerm, normalize } from "@/lib/checks/text";
import type { CheckContext, RawCandidate, RawFinding, TextCheck } from "@/lib/checks/types";
import { classifyFacts, type Fact } from "@/lib/ledger/facts";

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * The approved phrase a live ledger entry uses for a superlative: the superlative plus the
 * next three words, e.g. "best" in KLE-14 → "best d2c home brand".
 */
function approvedPhrases(term: string, claims: string[]): string[] {
  const t = normalize(term).toLowerCase();
  return claims.flatMap((c) => {
    const i = c.indexOf(t);
    if (i < 0) return [];
    return [c.slice(i).split(/\s+/).slice(0, t.split(/\s+/).length + 3).join(" ").replace(/[.,;:]+$/, "")];
  });
}

/**
 * Every superlative in the text, with the live ledger entry that approves it (if any).
 * A superlative is approved only where the draft repeats a live entry's own phrase
 * ("Best D2C Home Brand" is backed by KLE-14; "the best bedsheet" is not).
 */
export function superlativeHits(text: string, { pack, today }: CheckContext) {
  const live = pack.evidence.filter((e) => !isExpired(e, today));
  const liveClaims = live.map((e) => normalize(e.claim).toLowerCase());
  const lowerText = normalize(text).toLowerCase();
  return dropOverlaps(
    pack.terms.superlatives.flatMap((s) => {
      const phrases = approvedPhrases(s, liveClaims);
      return findTerm(text, s).map((m) => {
        const ok = phrases.find((p) => lowerText.startsWith(p, m.start));
        return { ...m, approvedBy: ok ? live.find((_, i) => liveClaims[i].includes(ok)) : undefined };
      });
    }),
  );
}

/** KSR-4.2 — superlatives need evidence. */
export const checkSuperlatives: TextCheck = (text, ctx) =>
  superlativeHits(text, ctx)
    .filter((m) => !m.approvedBy)
    .map((m) => ({
      rule: "KSR-4.2",
      match: { start: m.start, end: m.end, text: m.text },
      explanation: `"${m.text}" is a claim that needs proof, and the Claim Ledger has no evidence for it.`,
      suggestedFix: null,
    }));

/** KSR-4.4 — absolute promises are never allowed. */
export const checkAbsolutes: TextCheck = (text, { pack }) =>
  dropOverlaps(pack.terms.absoluteClaims.flatMap((a) => findTerm(text, a))).map((m) => ({
    rule: "KSR-4.4",
    match: m,
    explanation: `"${m.text}" is an absolute promise. No product can guarantee it, and it can't be backed by evidence.`,
    suggestedFix: null,
  }));

/** Rule a wrong number breaks: prices and offers have their own rule; other facts are claims needing proof. */
const FACT_RULE = (f: Fact) => (f.kind === "price" || f.kind === "percent" ? "KSR-4.1" : "KSR-4.2");

/**
 * KSR-4.1 / KSR-4.2 — numbers checked against the Claim Ledger (lib/ledger/facts.ts):
 * a price, %, rating, count, return window or year that is stale (only expired proof) or
 * contradicted (a live entry on the same topic says something else). Verified facts pass;
 * unproven prices and percentages become candidates for AI review.
 */
export const checkLedgerFacts: TextCheck = (text, ctx) =>
  classifyFacts(text, ctx.pack, ctx.today).flatMap((f): RawFinding[] =>
    f.status === "stale" || f.status === "contradicted"
      ? [
          {
            rule: FACT_RULE(f),
            match: f.match,
            evidence: f.evidence!.code,
            explanation: f.status === "stale" ? `Stale: ${f.note}` : `Contradicted: ${f.note}`,
            suggestedFix: f.fix,
          },
        ]
      : [],
  );

/** Certificates in the ledger, keyed by the words a draft would use ("OEKO-TEX Standard 100", "OEKO-TEX"). */
export function certificateNames(pack: CheckContext["pack"]) {
  const names = new Map<string, Evidence[]>();
  for (const e of pack.evidence) {
    if (e.value.kind !== "certification") continue;
    const full = e.value.certificate;
    for (const name of new Set([full, full.split(/\s+/)[0]])) {
      names.set(name, [...(names.get(name) ?? []), e]);
    }
  }
  return names;
}

/** KSR-4.3 — a certification whose every ledger entry has expired. (Scope checks are AI's job.) */
export const checkExpiredCertifications: TextCheck = (text, ctx) => {
  const hits = dropOverlaps(
    [...certificateNames(ctx.pack)].flatMap(([name, entries]) => findTerm(text, name).map((m) => ({ ...m, entries }))),
  );
  return hits.flatMap(({ entries, ...m }): RawFinding[] => {
    if (entries.some((e) => !isExpired(e, ctx.today))) return [];
    const e = entries[0];
    const cert = e.value.kind === "certification" ? e.value : null;
    return [
      {
        rule: "KSR-4.3",
        match: m,
        evidence: e.code,
        explanation:
          `${e.code}: the ${cert?.certificate} certificate (${cert?.number}) expired on ${formatDate(e.expiresAt!)}.` +
          (e.conditions ? ` ${e.conditions}` : "") +
          " Remove the claim until it is renewed.",
        suggestedFix: null,
      },
    ];
  });
};

/**
 * Things code can't decide alone — handed to the Claim Ledger matcher / AI:
 * unknown prices, percentages, live certifications (scope must be checked), and claim-ish words.
 */
export function findClaimCandidates(text: string, ctx: CheckContext): RawCandidate[] {
  const out: RawCandidate[] = [];

  for (const f of classifyFacts(text, ctx.pack, ctx.today)) {
    if (f.kind !== "price" && f.kind !== "percent") continue;
    if (f.status === "stale" || f.status === "contradicted") continue; // already a finding
    out.push({
      match: f.match,
      type: f.kind,
      evidence: f.status === "verified" ? [f.evidence!.code] : [],
      note: f.status === "verified" ? f.note : f.kind === "price" ? "No ledger entry has this amount." : "No live ledger entry has this percentage.",
    });
  }

  for (const [name, entries] of certificateNames(ctx.pack)) {
    const live = entries.filter((e) => !isExpired(e, ctx.today));
    if (!live.length) continue;
    for (const m of findTerm(text, name)) {
      out.push({
        match: m,
        type: "certification",
        evidence: live.map((e) => e.code),
        note: `Certificate is live. Check scope: ${live.map((e) => e.conditions ?? e.claim).join(" ")}`,
      });
    }
  }

  for (const term of ctx.pack.terms.claimCandidates) {
    for (const m of findTerm(text, term)) {
      out.push({ match: m, type: "trigger", evidence: [], note: `"${m.text}" may be a claim that needs evidence.` });
    }
  }

  return out;
}
