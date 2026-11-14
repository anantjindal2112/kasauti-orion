import { z } from "zod";
import { evidenceCode, ruleCode, severity } from "@/lib/schemas/brand-pack";

export const findingLocation = z.enum(["text", "image", "alt"]);
export type FindingLocation = z.infer<typeof findingLocation>;

export const spanSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
});
export type Span = z.infer<typeof spanSchema>;

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
