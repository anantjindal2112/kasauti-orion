import { z } from "zod";
import { evidenceCode, ruleCode, severity } from "@/lib/schemas/brand-pack";

export const findingLocation = z.enum(["text", "image", "alt"]);
export type FindingLocation = z.infer<typeof findingLocation>;

export const spanSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
});
export type Span = z.infer<typeof spanSchema>;

/** Intent Lock: did the suggested fix keep the creator's Intent Card? */
export const intentVerdictSchema = z.object({
  ok: z.boolean(),
  /** MUST KEEP items the fixed sentence still carries. */
  kept: z.array(z.string()),
  /** What the fix gives up besides the quoted words (e.g. a MUST KEEP phrase). */
  changed: z.array(z.string()),
  note: z.string().optional(),
  /** Who decided: a code check (a MUST KEEP phrase vanished) or the model. */
  by: z.enum(["code", "ai"]),
});
export type IntentVerdict = z.infer<typeof intentVerdictSchema>;

/**
 * One issue in a draft. Code checks and AI checks both produce this shape,
 * so the Verifier and the UI treat them the same way.
 */
export const findingSchema = z.object({
  id: z.string(),
  rule: ruleCode,
  evidence: evidenceCode.optional(),
  /** Exact text from the draft / image text / alt (for missing alt: the image file). */
  quote: z.string().min(1),
  location: findingLocation,
  /** Offsets of `quote` inside the text it came from. */
  span: spanSchema,
  imageFile: z.string().optional(),
  explanation: z.string(),
  /** Replacement for `quote`. null = no automatic fix, a human rewrites. "" = delete the quote. */
  suggestedFix: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  severity,
  /** rule = deterministic code check, ai = model output (passed through the Verifier). */
  source: z.enum(["rule", "ai"]),
  modelId: z.string().nullable(),
  /** AI findings only: passed every Verifier test, or kept for a person to judge. */
  review: z.enum(["verified", "needs_review"]).optional(),
  /** Why the Verifier sent it to human review (low confidence, fix removed…). */
  reviewNote: z.string().optional(),
  /** A code finding whose fix was written by this AI model and then checked by code. */
  fixBy: z.string().optional(),
  /** Intent Lock result for the suggested fix (only when the creator filled in the Intent Card). */
  intent: intentVerdictSchema.optional(),
});
export type Finding = z.infer<typeof findingSchema>;

/**
 * Something that *might* be a claim. Code can't decide it alone; it goes to
 * the Claim Ledger matcher / AI review with whatever evidence code found.
 */
export const claimCandidateSchema = z.object({
  text: z.string(),
  span: spanSchema,
  location: findingLocation,
  imageFile: z.string().optional(),
  type: z.enum(["price", "percent", "certification", "trigger"]),
  /** Evidence entries code already linked to this candidate. */
  evidence: z.array(evidenceCode),
  note: z.string(),
});
export type ClaimCandidate = z.infer<typeof claimCandidateSchema>;
