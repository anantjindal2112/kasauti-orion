import { z } from "zod";

/** ISO calendar date, e.g. "2026-09-30". */
const isoDate = z.iso.date();

export const ruleCode = z.string().regex(/^KSR-\d+\.\d+$/, "Rule codes look like KSR-1.2");
export const evidenceCode = z.string().regex(/^KLE-\d{2}$/, "Evidence codes look like KLE-12");

export const layer = z.enum(["voice", "terminology", "visual", "claims", "accessibility", "messaging"]);
export type Layer = z.infer<typeof layer>;

export const severity = z.enum(["low", "medium", "high"]);
export type Severity = z.infer<typeof severity>;

/** How a rule is checked: by deterministic code, by an AI model, or both. */
export const checkType = z.enum(["code", "ai", "hybrid"]);

export const brandSchema = z.object({
  id: z.string(),
  name: z.string(),
  fictional: z.literal(true),
  tagline: z.string(),
  description: z.string(),
  products: z.array(z.string()).min(1),
  audience: z.string(),
  voice: z.object({
    summary: z.string(),
    do: z.array(z.string()),
    dont: z.array(z.string()),
  }),
  limits: z.object({
    readabilityMaxGrade: z.number().positive(),
    maxExclamationMarks: z.number().int().nonnegative(),
    maxEmoji: z.number().int().nonnegative(),
  }),
});
export type Brand = z.infer<typeof brandSchema>;

export const ruleSchema = z.object({
  code: ruleCode,
  layer,
  title: z.string(),
  body: z.string(),
  severity,
  checkType,
  goodExamples: z.array(z.string()).min(1),
  badExamples: z.array(z.string()).min(1),
  tags: z.array(z.string()),
  version: z.number().int().positive(),
  /** Seeded as deliberately vague so the Guideline Debt Radar has something to find. */
  knownUnclear: z.boolean().optional(),
});
export type Rule = z.infer<typeof ruleSchema>;

export const evidenceValue = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("price"), amountInr: z.number().positive() }),
  z.object({ kind: z.literal("threshold"), amountInr: z.number().positive() }),
  z.object({ kind: z.literal("percent"), percent: z.number().positive().max(100) }),
  z.object({ kind: z.literal("count"), count: z.number().nonnegative(), unit: z.string() }),
  z.object({ kind: z.literal("rating"), rating: z.number().positive(), outOf: z.number().positive(), reviews: z.number().int() }),
  z.object({ kind: z.literal("certification"), certificate: z.string(), number: z.string() }),
  z.object({ kind: z.literal("days"), days: z.number().int().positive() }),
  z.object({ kind: z.literal("year"), year: z.number().int() }),
  z.object({ kind: z.literal("text"), text: z.string() }),
]);
export type EvidenceValue = z.infer<typeof evidenceValue>;

export const evidenceSchema = z.object({
  code: evidenceCode,
  title: z.string(),
  /** The approved wording of the claim this entry supports. */
  claim: z.string(),
  value: evidenceValue,
  source: z.string(),
  owner: z.object({ name: z.string(), role: z.string() }),
  verifiedAt: isoDate,
  /** null = does not expire (e.g. founding year). */
  expiresAt: isoDate.nullable(),
  supersededBy: evidenceCode.optional(),
  /** Conditions that must travel with the claim, e.g. sale end date. */
  conditions: z.string().optional(),
  tags: z.array(z.string()),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const termsSchema = z.object({
  brandName: z.object({ correct: z.string(), wrong: z.array(z.string()) }),
  productNames: z.array(z.object({ correct: z.string(), wrong: z.array(z.string()) })),
  banned: z.array(z.object({ term: z.string(), rule: ruleCode, reason: z.string() })),
  replace: z.array(z.object({ term: z.string(), with: z.string(), rule: ruleCode })),
  competitors: z.array(z.string()),
  approvedAcronyms: z.array(z.string()),
  /** Superlatives that always need evidence (KSR-4.2). Code flags them unless a live ledger entry uses the same words. */
  superlatives: z.array(z.string()),
  /** Words that *may* be claims (certified, organic, eco-friendly…). Code passes them on as candidates; AI decides. */
  claimCandidates: z.array(z.string()),
  /** Absolute promises that are never allowed (KSR-4.4). */
  absoluteClaims: z.array(z.string()),
  pressurePhrases: z.array(z.string()),
});
export type Terms = z.infer<typeof termsSchema>;

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const assetsSchema = z.object({
  logos: z.array(
    z.object({
      id: z.string(),
      version: z.string(),
      status: z.enum(["current", "retired"]),
      file: z.string(),
      description: z.string(),
      retiredOn: isoDate.optional(),
    }),
  ),
  palette: z.array(z.object({ name: z.string(), hex: hexColor, use: z.string() })),
  fonts: z.array(z.object({ name: z.string(), use: z.string() })),
  contrast: z.object({ normalText: z.number(), largeText: z.number() }),
});
export type Assets = z.infer<typeof assetsSchema>;

/* ---------- Test set ---------- */

/** The four ways content goes wrong (deck slide 3), plus supporting categories. */
export const failureKind = z.enum([
  "unsupported_claim",
  "stale_fact",
  "voice_drift",
  "off_brand_visual",
  "terminology",
  "accessibility",
  "messaging",
]);
export type FailureKind = z.infer<typeof failureKind>;

export const expectedFindingSchema = z.object({
  rule: ruleCode,
  evidence: evidenceCode.optional(),
  /** Exact text from the draft (or image text / alt text) that should be flagged. */
  quote: z.string().min(1),
  /** Where the quote lives. Defaults to the draft body. */
  location: z.enum(["text", "image", "alt"]).default("text"),
  kind: failureKind,
  /** Which part of the pipeline is expected to catch it. */
  detectedBy: z.enum(["code", "ai"]),
  note: z.string().optional(),
});
export type ExpectedFinding = z.infer<typeof expectedFindingSchema>;

export const draftSchema = z.object({
  id: z.string().regex(/^D\d{2}$/),
  title: z.string(),
  channel: z.enum(["instagram", "email", "web-banner", "product-page", "whatsapp", "x"]),
  author: z.string(),
  intent: z.object({ purpose: z.string(), audience: z.string(), mustKeep: z.array(z.string()) }),
  text: z.string().min(1),
  images: z
    .array(z.object({ file: z.string(), alt: z.string().nullable(), textInImage: z.string().optional() }))
    .default([]),
  expected: z.array(expectedFindingSchema),
});
export type Draft = z.infer<typeof draftSchema>;
