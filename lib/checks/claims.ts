import { isExpired } from "@/lib/brand-pack";
import type { Evidence } from "@/lib/schemas/brand-pack";
import { PRICE_RE, parseAmount } from "@/lib/checks/terminology";
import { dropOverlaps, findRegex, findTerm, formatInr, normalize } from "@/lib/checks/text";
import type { CheckContext, RawCandidate, RawFinding, TextCheck } from "@/lib/checks/types";

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
 * KSR-4.2 — superlatives need evidence. A superlative passes only where the draft repeats a
 * live ledger entry's own phrase ("Best D2C Home Brand" is backed by KLE-14; "the best bedsheet" is not).
 */
export const checkSuperlatives: TextCheck = (text, { pack, today }) => {
  const liveClaims = pack.evidence.filter((e) => !isExpired(e, today)).map((e) => normalize(e.claim).toLowerCase());
  const lowerText = normalize(text).toLowerCase();
  const hits = dropOverlaps(
    pack.terms.superlatives.flatMap((s) => {
      const phrases = approvedPhrases(s, liveClaims);
      return findTerm(text, s).filter((m) => !phrases.some((p) => lowerText.startsWith(p, m.start)));
    }),
  );
  return hits.map((m) => ({
    rule: "KSR-4.2",
    match: m,
    explanation: `"${m.text}" is a claim that needs proof, and the Claim Ledger has no evidence for it.`,
    suggestedFix: null,
  }));
};

/** KSR-4.4 — absolute promises are never allowed. */
export const checkAbsolutes: TextCheck = (text, { pack }) =>
  dropOverlaps(pack.terms.absoluteClaims.flatMap((a) => findTerm(text, a))).map((m) => ({
    rule: "KSR-4.4",
    match: m,
    explanation: `"${m.text}" is an absolute promise. No product can guarantee it, and it can't be backed by evidence.`,
    suggestedFix: null,
  }));

const amountEntries = (pack: CheckContext["pack"], amount: number) =>
  pack.evidence.filter(
    (e) => (e.value.kind === "price" || e.value.kind === "threshold") && e.value.amountInr === amount,
  );

const amountOf = (e: Evidence) =>
  e.value.kind === "price" || e.value.kind === "threshold" ? e.value.amountInr : null;

/**
 * KSR-4.1 — a price or threshold that only matches *expired* ledger entries is stale.
 * Prices that match a live entry pass; prices with no entry become candidates.
 */
export const checkLedgerPrices: TextCheck = (text, ctx) =>
  findRegex(text, PRICE_RE).flatMap((m): RawFinding[] => {
    const amount = parseAmount(m.text);
    if (amount === null) return [];
    const entries = amountEntries(ctx.pack, amount);
    if (entries.length === 0 || entries.some((e) => !isExpired(e, ctx.today))) return [];

    const stale = entries[0];
    const next = stale.supersededBy ? ctx.pack.evidence.find((e) => e.code === stale.supersededBy) : undefined;
    const nextAmount = next ? amountOf(next) : null;
    const explanation = next
      ? `Approved entry ${next.code} says "${next.claim}" (last verified ${formatDate(next.verifiedAt)}, source: ${next.source}). ` +
        `${stale.code} (${formatInr(amount)}) expired on ${formatDate(stale.expiresAt!)}.`
      : `The only proof for ${formatInr(amount)} is ${stale.code}, which expired on ${formatDate(stale.expiresAt!)}. Re-verify it or remove the price.`;

    return [
      {
        rule: "KSR-4.1",
        match: m,
        evidence: stale.code,
        explanation,
        suggestedFix: nextAmount !== null ? formatInr(nextAmount) : null,
      },
    ];
  });

/** Certificates in the ledger, keyed by the words a draft would use ("OEKO-TEX Standard 100", "OEKO-TEX"). */
function certificateNames(pack: CheckContext["pack"]) {
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

  for (const m of findRegex(text, PRICE_RE)) {
    const amount = parseAmount(m.text);
    if (amount === null) continue;
    const entries = amountEntries(ctx.pack, amount);
    const live = entries.filter((e) => !isExpired(e, ctx.today));
    if (entries.length && !live.length) continue; // already a KSR-4.1 finding
    out.push({
      match: m,
      type: "price",
      evidence: live.map((e) => e.code),
      note: live.length ? `Matches live entry ${live.map((e) => e.code).join(", ")}.` : "No ledger entry has this amount.",
    });
  }

  for (const m of findRegex(text, /\b\d{1,3}(?:\.\d+)?\s?%/g)) {
    const pct = Number(m.text.replace(/[^\d.]/g, ""));
    const live = ctx.pack.evidence.filter(
      (e) => e.value.kind === "percent" && e.value.percent === pct && !isExpired(e, ctx.today),
    );
    out.push({
      match: m,
      type: "percent",
      evidence: live.map((e) => e.code),
      note: live.length
        ? `Matches ${live.map((e) => e.code).join(", ")}.${live[0].conditions ? ` Conditions: ${live[0].conditions}` : ""}`
        : "No live ledger entry has this percentage.",
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
