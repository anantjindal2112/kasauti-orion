import { z } from "zod";
import { evidenceCode } from "@/lib/schemas/brand-pack";
import { findingLocation, spanSchema } from "@/lib/schemas/finding";

/**
 * Claim Ledger statuses (Stage 7).
 *  verified      — a live ledger entry supports it
 *  stale         — the only supporting entry has expired
 *  contradicted  — a live entry on the same topic says something different (₹999 vs ₹1,499)
 *  no_evidence   — nothing in the ledger supports it
 *  unchecked     — code can't decide and AI review didn't run; a person must look
 */
export const claimStatus = z.enum(["verified", "stale", "contradicted", "no_evidence", "unchecked"]);
export type ClaimStatus = z.infer<typeof claimStatus>;

export const claimKind = z.enum([
  "price",
  "percent",
  "rating",
  "count",
  "days",
  "year",
  "certification",
  "superlative",
  "absolute",
  "trigger",
  "implicit",
]);
export type ClaimKind = z.infer<typeof claimKind>;

/** One checkable statement in a draft, and what the Claim Ledger says about it. */
export const ledgerClaimSchema = z.object({
  id: z.string(),
  /** Exact words from the draft (or image text). */
  text: z.string().min(1),
  span: spanSchema,
  location: findingLocation,
  imageFile: z.string().optional(),
  /** The whole sentence the claim sits in — what a reviewer would add to the ledger. */
  sentence: z.string(),
  kind: claimKind,
  status: claimStatus,
  /** The ledger entry that decided the status (supporting, expired or contradicting). */
  evidence: evidenceCode.optional(),
  /** Replacement for `text` built from the ledger value, e.g. "₹1,499". */
  suggestedFix: z.string().nullable(),
  note: z.string(),
  source: z.enum(["rule", "ai"]),
  modelId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  /** AI claims below the confidence floor are shown for a person to judge. */
  review: z.enum(["verified", "needs_review"]).optional(),
  /** A finding raised on the same words, if any. */
  findingId: z.string().optional(),
});
export type LedgerClaim = z.infer<typeof ledgerClaimSchema>;
