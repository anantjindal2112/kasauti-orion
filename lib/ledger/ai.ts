import { z } from "zod";
import { isExpired, type BrandPack } from "@/lib/brand-pack";
import { normalize, splitSentences } from "@/lib/checks/text";
import { overlaps } from "@/lib/ledger";
import { chatJson, type ChatMessage } from "@/lib/nvidia/chat";
import type { NvidiaClient } from "@/lib/nvidia/client";
import { withDeadline } from "@/lib/pipeline/ai-review";
import { CONFIDENCE_FLOOR } from "@/lib/pipeline/verifier";
import { unmaskPII, type MaskToken } from "@/lib/privacy/mask";
import type { Evidence } from "@/lib/schemas/brand-pack";
import type { LedgerClaim } from "@/lib/schemas/claim";

/**
 * Stage 7 — the AI half of the Claim Ledger. Code finds numbers, certificates and superlatives;
 * the model finds the claims hiding in plain words ("woven by hand in Varanasi", "gets softer
 * with every wash") and says which ledger entry, if any, supports each one.
 *
 * The model only proposes. Code decides the status: a claim needs a real entry to be verified,
 * an expired entry makes it stale whatever the model says, and quotes must exist in the draft.
 */

export const aiClaimSchema = z.object({
  quote: z.string().describe("The claim, copied exactly from the DRAFT — the shortest span that states it"),
  evidence: z.string().nullable().describe("The one EVIDENCE code that this claim relies on, or null if none does"),
  verdict: z
    .enum(["supported", "not_supported", "contradicted", "not_a_claim"])
    .describe("supported = the evidence says the same thing; contradicted = the evidence says something different; not_supported = no evidence covers it; not_a_claim = opinion, invitation or description"),
  reason: z.string().describe("One short sentence"),
  confidence: z.number().min(0).max(1),
});
export const aiLedgerSchema = z.object({ claims: z.array(aiClaimSchema).max(15) });
export type AiClaim = z.infer<typeof aiClaimSchema>;

const MAX_QUOTE_WORDS = 25;
const CTA_START = /^(shop|find|treat|visit|grab|discover|explore|buy|order|click|tap|follow|download|refer|sign up|join|settle in)\b/i;

function isJustAName(text: string, pack: BrandPack): boolean {
  const t = normalize(text).replace(/[.!,]+$/, "").trim().toLowerCase();
  const names = [pack.brand.name, pack.terms.brandName.correct, ...pack.brand.products, ...pack.terms.productNames.map((p) => p.correct)];
  return names.some((n) => normalize(n).toLowerCase() === t);
}

const describeEvidence = (e: Evidence, today: string) => {
  const state = e.expiresAt === null ? "valid" : isExpired(e, today) ? `EXPIRED ${e.expiresAt}` : `valid until ${e.expiresAt}`;
  return `${e.code} (${state}) "${e.claim}"${e.conditions ? ` — covers only: ${e.conditions}` : ""}`;
};

export function buildLedgerMessages(args: {
  pack: BrandPack;
  draft: string;
  evidence: Evidence[];
  open: LedgerClaim[];
  decided: LedgerClaim[];
  today: string;
}): ChatMessage[] {
  const { pack, draft, evidence, open, decided, today } = args;
  const system = [
    `You keep the Claim Ledger for ${pack.brand.name}. Today is ${today}.`,
    "List the factual claims in the DRAFT — statements a customer could check: origin, process, materials, certifications,",
    "awards, ratings, performance ('gets softer with every wash'), sustainability, comparisons.",
    "Skip opinions, moods, invitations, product names on their own and calls to action ('Treat your home', 'Shop the sale before 16 November', 'Find your new favourite set').",
    "'Award-winning' is supported only if the draft itself names the award and the year.",
    "Skip anything under ALREADY DECIDED. Judge every item under TO JUDGE (use not_a_claim if it isn't one).",
    "For each claim pick the one EVIDENCE entry it relies on, using ONLY the EVIDENCE list:",
    "- supported: the entry says the same thing, and the draft does not stretch it beyond what the entry covers;",
    "- contradicted: the entry says something different (another number, place, product or scope);",
    "- not_supported: no entry covers it.",
    "Quote words copied exactly from the DRAFT. Reply with JSON only.",
  ].join("\n");
  const user = [
    "EVIDENCE (Claim Ledger):",
    ...evidence.map((e) => describeEvidence(e, today)),
    "",
    "TO JUDGE:",
    ...(open.length ? open.map((c) => `- "${c.text}" in: ${c.sentence}`) : ["(none)"]),
    "",
    "ALREADY DECIDED (skip):",
    ...(decided.length ? decided.map((c) => `- "${c.text}"`) : ["(none)"]),
    "",
    "DRAFT:",
    '"""',
    draft,
    '"""',
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function locate(draft: string, quote: string): { start: number; end: number } | null {
  const q = quote.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, "").trim();
  if (!q) return null;
  let i = draft.indexOf(q);
  if (i < 0) i = normalize(draft).indexOf(normalize(q));
  return i < 0 ? null : { start: i, end: i + q.length };
}

export interface LedgerAiResult {
  claims: LedgerClaim[];
  judged: number;
  added: number;
  dropped: { quote: string; reason: string }[];
}

/**
 * Ground the model's claims and merge them into the code ledger.
 * Code-decided claims always win; the model can settle `unchecked` ones and add new ones.
 */
export function groundAiClaims(args: {
  draft: string;
  aiClaims: AiClaim[];
  codeClaims: LedgerClaim[];
  pack: BrandPack;
  today: string;
  modelId: string;
  tokens: MaskToken[];
}): LedgerAiResult {
  const { draft, aiClaims, pack, today, modelId, tokens } = args;
  let claims = [...args.codeClaims];
  const dropped: LedgerAiResult["dropped"] = [];
  let judged = 0;
  let added = 0;
  const sentences = splitSentences(draft);

  for (const a of aiClaims) {
    const quote = unmaskPII(a.quote, tokens);
    const span = locate(draft, quote);
    if (!span) {
      dropped.push({ quote, reason: "quote not found in the draft" });
      continue;
    }
    const text = draft.slice(span.start, span.end);
    if (text.split(/\s+/).length > MAX_QUOTE_WORDS) {
      dropped.push({ quote, reason: "too long to be one claim" });
      continue;
    }

    // Calls to action and bare names aren't claims, whatever the model thinks.
    if (CTA_START.test(text) || isJustAName(text, pack)) {
      dropped.push({ quote: text, reason: "a call to action or a name, not a claim" });
      continue;
    }

    const textClaims = claims.filter((c) => c.location === "text");
    const hit = textClaims.filter((c) => overlaps(c.span, span));
    if (hit.some((c) => c.status !== "unchecked")) continue; // code already decided these words
    const replacing = hit.filter((c) => c.status === "unchecked");

    if (a.verdict === "not_a_claim") {
      if (replacing.length) {
        claims = claims.filter((c) => !replacing.includes(c));
        judged += replacing.length;
      }
      continue;
    }

    // No citation, no verification: the status comes from the cited entry, not the model's word.
    const cited = a.evidence ? pack.evidence.find((e) => e.code === a.evidence!.trim().match(/KLE-\d{2}/)?.[0]) : undefined;
    let status: LedgerClaim["status"];
    let note = a.reason;
    if (a.verdict === "supported" && cited) {
      status = isExpired(cited, today) ? "stale" : "verified";
      if (status === "stale") note = `${cited.code} expired on ${cited.expiresAt}. ${a.reason}`;
    } else if (a.verdict === "contradicted" && cited) {
      status = "contradicted";
    } else {
      status = "no_evidence";
      if (a.verdict !== "not_supported") note = `${a.reason} (No ledger entry was cited, so it can't count as proof.)`;
    }

    const sentence = sentences.find((s) => span.start >= s.start && span.start < s.end)?.text ?? draft;
    const claim: LedgerClaim = {
      id: `claim:text::ai:${span.start}`,
      text,
      span,
      location: "text",
      sentence,
      kind: replacing[0]?.kind ?? "implicit",
      status,
      ...(cited ? { evidence: cited.code } : {}),
      suggestedFix: null,
      note,
      source: "ai",
      modelId,
      confidence: a.confidence,
      review: a.confidence < CONFIDENCE_FLOOR ? "needs_review" : "verified",
    };
    if (textClaims.some((c) => c.source === "ai" && overlaps(c.span, span))) continue; // the model repeated itself
    claims = [...claims.filter((c) => !replacing.includes(c)), claim];
    if (replacing.length) judged += replacing.length;
    else added++;
  }

  claims.sort((a, b) => Number(a.location !== "text") - Number(b.location !== "text") || a.span.start - b.span.start);
  return { claims, judged, added, dropped };
}

/** Ask the fast model (15 s). Throws on failure; the caller keeps the code ledger. */
export async function askLedger(client: NvidiaClient, messages: ChatMessage[]) {
  const res = await withDeadline(
    chatJson(client, messages, aiLedgerSchema, { model: "fast", fallback: null, schemaName: "kasauti_claims", maxTokens: 1500, timeoutMs: 15_000 }),
    18_000,
    "ledger",
  );
  return { ...res, data: res.data.claims };
}
