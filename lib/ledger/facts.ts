import { isExpired, type BrandPack } from "@/lib/brand-pack";
import { PRICE_RE, parseAmount } from "@/lib/checks/terminology";
import { HINDI_TOPIC_WORDS, withHindiTerms } from "@/lib/checks/hindi";
import { findRegex, findTerm, formatInr, splitSentences, type Match } from "@/lib/checks/text";
import { HINDI_SPELLINGS } from "@/lib/speech/glossary";
import type { Evidence } from "@/lib/schemas/brand-pack";
import type { ClaimKind } from "@/lib/schemas/claim";

/**
 * Stage 7 — numeric facts in a draft, checked against the Claim Ledger by code.
 *
 * A fact is matched to ledger entries of the same family (money, %, rating…). If the sentence names
 * a topic an entry covers ("shipping", "Monsoon Weave"), only entries on that topic count:
 *   supported by a live entry   → verified
 *   supported only by expired   → stale        (fix: the successor's value)
 *   a live entry on the topic says something else → contradicted (fix: the live value)
 *   nothing                      → no_evidence  (left to AI review / a person)
 */

export type FactStatus = "verified" | "stale" | "contradicted" | "no_evidence";

export interface Fact {
  kind: Extract<ClaimKind, "price" | "percent" | "rating" | "count" | "days" | "year">;
  /** The whole phrase ("₹999", "4.8 out of 5", "2,000 artisans") — what gets replaced. */
  match: Match;
  sentence: Match;
  status: FactStatus;
  evidence?: Evidence;
  /** Replacement for `match.text` using the ledger value, or null. */
  fix: string | null;
  note: string;
}

type Family = "money" | "percent" | "rating" | "reviews" | "count" | "days" | "year";

interface Raw {
  family: Family;
  kind: Fact["kind"];
  match: Match;
  /** The number inside `match` (raw text, so it can be swapped for the ledger value). */
  numberText: string;
  value: number;
  /** count only: the unit the phrase used. */
  unit?: string;
  /** percent only: the phrase is about a discount ("20% off"), not e.g. "100% cotton". */
  offer?: boolean;
}

const num = (s: string) => Number(s.replace(/,/g, ""));
const group = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Words a sentence uses when it talks about what an entry covers. Tags that say nothing about topic are skipped. */
const TAG_WORDS: Record<string, string[]> = {
  shipping: ["shipping", "delivery", ...HINDI_TOPIC_WORDS.shipping],
  sale: ["sale", "off", "discount", "sitewide", ...HINDI_TOPIC_WORDS.sale],
  returns: ["return", "returns", "refund", "exchange", ...HINDI_TOPIC_WORDS.returns],
  reviews: ["rated", "rating", "reviews", "customers", ...HINDI_TOPIC_WORDS.reviews],
  artisans: ["artisans", "weavers", ...HINDI_TOPIC_WORDS.artisans],
};
const GENERIC_TAGS = new Set([
  "offer", "price", "policy", "trust", "spec", "impact", "company", "history", "safety", "certification",
  "festive", "sustainability", "organic", "dyes", "sourcing", "award",
]);
const UNIT_SYNONYMS: Record<string, string[]> = { artisans: ["artisans", "weavers", "craftspeople", ...HINDI_TOPIC_WORDS.artisans] };

export function topicWords(e: Evidence): string[] {
  const words = e.tags.flatMap((t) => (GENERIC_TAGS.has(t) ? [] : (TAG_WORDS[t] ?? [t.replace(/-/g, " ")])));
  // A product named by its English tag ("monsoon weave") is also named by its Devanagari spellings.
  const spelled = Object.entries(HINDI_SPELLINGS).flatMap(([name, spellings]) => (words.includes(name.toLowerCase()) ? spellings : []));
  return [...words, ...spelled];
}

const FAMILY_OF: Record<Evidence["value"]["kind"], Family[]> = {
  price: ["money"],
  threshold: ["money"],
  percent: ["percent"],
  rating: ["rating", "reviews"],
  count: ["count"],
  days: ["days"],
  year: ["year"],
  certification: [],
  text: [],
};

/** Does entry `e` support the fact? */
function supports(e: Evidence, r: Raw): boolean {
  const v = e.value;
  switch (r.family) {
    case "money":
      return (v.kind === "price" || v.kind === "threshold") && v.amountInr === r.value;
    case "percent":
      return v.kind === "percent" && v.percent === r.value;
    case "rating":
      return v.kind === "rating" && r.value <= v.rating;
    case "reviews":
      return v.kind === "rating" && r.value <= v.reviews;
    case "count":
      return v.kind === "count" && r.value <= v.count;
    case "days":
      return v.kind === "days" && v.days === r.value;
    case "year":
      return v.kind === "year" && v.year === r.value;
  }
}

/** Is `e` the same kind of fact? (Counts must also share the unit.) */
function sameFamily(e: Evidence, r: Raw): boolean {
  if (!FAMILY_OF[e.value.kind].includes(r.family)) return false;
  if (r.family === "count" && e.value.kind === "count") {
    const unit = e.value.unit.toLowerCase();
    return (UNIT_SYNONYMS[unit] ?? [unit]).includes(r.unit!.toLowerCase());
  }
  return true;
}

/** The ledger's number, formatted to drop into the draft. */
function ledgerNumber(e: Evidence, family: Family): string | null {
  const v = e.value;
  if (family === "money" && (v.kind === "price" || v.kind === "threshold")) return formatInr(v.amountInr);
  if (family === "percent" && v.kind === "percent") return String(v.percent);
  if (family === "rating" && v.kind === "rating") return String(v.rating);
  // "more than 18,000 customers" — round down so the claim stays true.
  if (family === "reviews" && v.kind === "rating") return group(v.reviews >= 1000 ? Math.floor(v.reviews / 1000) * 1000 : v.reviews);
  if (family === "count" && v.kind === "count") return group(v.count);
  if (family === "days" && v.kind === "days") return String(v.days);
  if (family === "year" && v.kind === "year") return String(v.year);
  return null;
}

const fixWith = (r: Raw, e: Evidence): string | null => {
  const n = ledgerNumber(e, r.family);
  if (n === null) return null;
  // Money: the whole match is the price. Others: swap only the number inside the phrase.
  return r.family === "money" ? n : r.match.text.replace(r.numberText, n);
};

/** Pull every numeric fact out of `text`. */
function extract(text: string, pack: BrandPack): Raw[] {
  const out: Raw[] = [];

  for (const m of findRegex(text, PRICE_RE)) {
    const value = parseAmount(m.text);
    if (value !== null) out.push({ family: "money", kind: "price", match: m, numberText: m.text, value });
  }

  for (const m of text.matchAll(/\b(\d{1,3}(?:\.\d+)?)\s?(?:%|प्रतिशत|फ़ीसदी|फीसदी)/gu)) {
    const around = text.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20);
    out.push({
      family: "percent",
      kind: "percent",
      match: { start: m.index, end: m.index + m[0].length, text: m[0] },
      numberText: m[1],
      value: Number(m[1]),
      offer: /\b(off|discount|sale|cashback)\b|छूट|डिस्काउंट|ऑफर|सेल|कैशबैक/iu.test(around),
    });
  }

  for (const m of text.matchAll(/\b(\d(?:\.\d{1,2})?)\s*(?:\/|out of)\s*(5|10)\b/gi)) {
    out.push({
      family: "rating",
      kind: "rating",
      match: { start: m.index, end: m.index + m[0].length, text: m[0] },
      numberText: m[1],
      value: Number(m[1]),
    });
  }

  for (const m of text.matchAll(/\b(\d[\d,]*(?:\.\d+)?)(\s?(?:k|lakh))?\+?\s+(?:happy |verified |satisfied )?(customers|reviews|ratings|buyers|families|homes)\b/gi)) {
    const mult = !m[2] ? 1 : /k/i.test(m[2]) ? 1000 : 100_000;
    out.push({
      family: "reviews",
      kind: "count",
      match: { start: m.index, end: m.index + m[0].length, text: m[0] },
      numberText: m[1] + (m[2] ?? ""),
      value: num(m[1]) * mult,
    });
  }

  const units = new Set(
    pack.evidence.flatMap((e) => (e.value.kind === "count" ? (UNIT_SYNONYMS[e.value.unit.toLowerCase()] ?? [e.value.unit.toLowerCase()]) : [])),
  );
  for (const unit of units) {
    const re = new RegExp(`\\b(\\d[\\d,]*)\\+?\\s+(?:skilled |master |women |local )?(${unit.replace(/\s+/g, "\\s+")})\\b`, "gi");
    for (const m of text.matchAll(re)) {
      out.push({
        family: "count",
        kind: "count",
        match: { start: m.index, end: m.index + m[0].length, text: m[0] },
        numberText: m[1],
        value: num(m[1]),
        unit: m[2].toLowerCase().replace(/\s+/g, " "),
      });
    }
  }

  for (const m of text.matchAll(/\b(\d{1,3})(?:-|\s)days?\b/gi)) {
    out.push({ family: "days", kind: "days", match: { start: m.index, end: m.index + m[0].length, text: m[0] }, numberText: m[1], value: Number(m[1]) });
  }

  for (const m of text.matchAll(/\b(?:since|est\.?|established in|founded in)\s+((?:19|20)\d{2})\b/gi)) {
    out.push({ family: "year", kind: "year", match: { start: m.index, end: m.index + m[0].length, text: m[0] }, numberText: m[1], value: Number(m[1]) });
  }

  // Hindi phrasings of the same facts.
  for (const m of text.matchAll(/(5|10)\s*में\s*से\s*(\d(?:\.\d{1,2})?)/gu)) {
    out.push({ family: "rating", kind: "rating", match: { start: m.index, end: m.index + m[0].length, text: m[0] }, numberText: m[2], value: Number(m[2]) });
  }
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)(\s?(?:हज़ार|हजार|लाख))?\+?\s*(?:से\s*(?:अधिक|ज़्यादा|ज्यादा)\s*)?(?:खुश\s)?(ग्राहकों|ग्राहक|समीक्षाओं|रिव्यू)(?![\p{L}\p{M}])/gu)) {
    const mult = !m[2] ? 1 : /लाख/.test(m[2]) ? 100_000 : 1000;
    out.push({ family: "reviews", kind: "count", match: { start: m.index, end: m.index + m[0].length, text: m[0] }, numberText: m[1] + (m[2] ?? ""), value: num(m[1]) * mult });
  }
  for (const m of text.matchAll(/(\d[\d,]*)\+?\s*(कारीगरों|कारीगर|बुनकरों|बुनकर)(?![\p{L}\p{M}])/gu)) {
    out.push({ family: "count", kind: "count", match: { start: m.index, end: m.index + m[0].length, text: m[0] }, numberText: m[1], value: num(m[1]), unit: m[2] });
  }
  for (const m of text.matchAll(/(\d{1,3})\s?(?:-|\s)?(?:दिन|दिनों)(?![\p{L}\p{M}])/gu)) {
    out.push({ family: "days", kind: "days", match: { start: m.index, end: m.index + m[0].length, text: m[0] }, numberText: m[1], value: Number(m[1]) });
  }
  for (const m of text.matchAll(/((?:19|20)\d{2})\s?से(?=\s*(?:बुन|काम|स्थापित|शुरू|चल))/gu)) {
    out.push({ family: "year", kind: "year", match: { start: m.index, end: m.index + m[0].length, text: m[0] }, numberText: m[1], value: Number(m[1]) });
  }

  // Overlaps: "4.6 out of 5" must not also count as a "5 days"… keep the earliest-starting longest match.
  out.sort((a, b) => a.match.start - b.match.start || b.match.end - a.match.end);
  return out.filter((r, i) => !out.slice(0, i).some((p) => r.match.start < p.match.end && p.match.start < r.match.end));
}

/** How close (in characters) a topic word must be to a number to say what the number is about. */
const TOPIC_REACH = 45;

/**
 * Entries whose topic is named near the fact, nearest first. "Free shipping above ₹1,999" is about
 * shipping; in "Free shipping above ₹999, and the Indigo Hours set is ₹2,299" the second price isn't.
 */
function onTopic(entries: Evidence[], sentence: Match, fact: Match): Evidence[] {
  const scored = entries.flatMap((e) => {
    const gaps = topicWords(e)
      .flatMap((w) => findTerm(sentence.text, w))
      .map((h) => {
        const start = sentence.start + h.start;
        const end = sentence.start + h.end;
        return end <= fact.start ? fact.start - end : start >= fact.end ? start - fact.end : 0;
      })
      .filter((g) => g <= TOPIC_REACH);
    return gaps.length ? [{ e, dist: Math.min(...gaps) }] : [];
  });
  return scored.sort((a, b) => a.dist - b.dist).map((s) => s.e);
}

/** Facts a brand has only one of — any other value is wrong wherever it appears. */
const SINGLE_VALUED = new Set<Family>(["year", "rating", "reviews"]);

const describe = (e: Evidence) => `${e.code} "${e.claim}" (source: ${e.source})`;

/** Classify every numeric fact in `text` against the ledger. Pure code — no AI, no network. */
export function classifyFacts(text: string, basePack: BrandPack, today: string): Fact[] {
  const pack = withHindiTerms(basePack);
  const sentences = splitSentences(text);
  const sentenceAt = (i: number) => sentences.find((s) => i >= s.start && i < s.end) ?? { start: 0, end: text.length, text };

  return extract(text, pack).map((r): Fact => {
    const sentence = sentenceAt(r.match.start);
    const base = { kind: r.kind, match: r.match, sentence };
    const family = pack.evidence.filter((e) => sameFamily(e, r));
    const topical = onTopic(family, sentence, r.match);
    // On a known topic, only that topic's entries count. "₹1,999" next to "free shipping" is not the Monsoon Weave price.
    const pool = topical.length ? topical : family;
    const backing = pool.filter((e) => supports(e, r));
    const liveBacking = backing.find((e) => !isExpired(e, today));

    if (liveBacking) {
      const cond = liveBacking.conditions ? ` Condition to keep with it: ${liveBacking.conditions}` : "";
      return { ...base, status: "verified", evidence: liveBacking, fix: null, note: `Backed by ${describe(liveBacking)}, valid ${liveBacking.expiresAt ? `until ${formatDate(liveBacking.expiresAt)}` : "with no expiry"}.${cond}` };
    }

    if (backing.length) {
      const stale = backing[0];
      const next = stale.supersededBy ? pack.evidence.find((e) => e.code === stale.supersededBy && !isExpired(e, today)) : undefined;
      const replacement = next ?? topical.find((e) => !isExpired(e, today));
      return {
        ...base,
        status: "stale",
        evidence: stale,
        fix: replacement ? fixWith(r, replacement) : null,
        note:
          `${stale.code} backed "${r.match.text}" until it expired on ${formatDate(stale.expiresAt!)} (last verified ${formatDate(stale.verifiedAt)}).` +
          (replacement ? ` The live entry is ${describe(replacement)}.` : " Re-verify it or remove the claim."),
      };
    }

    // Percentages only contradict an offer when the draft is talking about an offer.
    // Brand-wide single facts (founding year, overall rating) are contradicted by any live entry, topic or not.
    const rivals = topical.length ? topical : SINGLE_VALUED.has(r.family) ? family : [];
    const live = rivals.filter((e) => !isExpired(e, today) && (r.family !== "percent" || r.offer));
    if (live.length) {
      const e = live[0];
      return {
        ...base,
        status: "contradicted",
        evidence: e,
        fix: fixWith(r, e),
        note: `The ledger says otherwise: ${describe(e)}, last verified ${formatDate(e.verifiedAt)}.`,
      };
    }

    return { ...base, status: "no_evidence", fix: null, note: `No ledger entry backs "${r.match.text}".` };
  });
}
