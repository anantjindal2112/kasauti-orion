import { z } from "zod";
import assetsJson from "@/supabase/seed/brand-pack/assets.json";
import brandJson from "@/supabase/seed/brand-pack/brand.json";
import evidenceJson from "@/supabase/seed/brand-pack/evidence.json";
import rulesJson from "@/supabase/seed/brand-pack/rules.json";
import termsJson from "@/supabase/seed/brand-pack/terms.json";
import draftsJson from "@/testset/drafts.json";
import {
  assetsSchema,
  brandSchema,
  draftSchema,
  evidenceSchema,
  ruleSchema,
  termsSchema,
  type Evidence,
} from "@/lib/schemas/brand-pack";

/**
 * The date the demo brand pack is written against. Expiry checks in tests and
 * demos use this instead of the real clock, so the seeded "stale" and "valid"
 * entries stay stale and valid no matter when the demo runs.
 */
export const DEMO_TODAY = "2026-11-13";

export function loadBrandPack() {
  return {
    brand: brandSchema.parse(brandJson),
    rules: z.array(ruleSchema).parse(rulesJson),
    evidence: z.array(evidenceSchema).parse(evidenceJson),
    terms: termsSchema.parse(termsJson),
    assets: assetsSchema.parse(assetsJson),
  };
}

export type BrandPack = ReturnType<typeof loadBrandPack>;

export function loadTestSet() {
  return z.array(draftSchema).parse(draftsJson);
}

/** An evidence entry is expired when its expiry date is before `today` (ISO date strings compare correctly). */
export function isExpired(entry: Pick<Evidence, "expiresAt">, today: string = DEMO_TODAY): boolean {
  return entry.expiresAt !== null && entry.expiresAt < today;
}
