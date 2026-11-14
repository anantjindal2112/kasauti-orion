import type { BrandPack } from "@/lib/brand-pack";
import type { ClaimCandidate } from "@/lib/schemas/finding";
import type { Match } from "@/lib/checks/text";

export interface CheckContext {
  pack: BrandPack;
  /** ISO date used for expiry checks. */
  today: string;
}

/** What a single check returns before the runner adds location, severity and an id. */
export interface RawFinding {
  rule: string;
  match: Match;
  explanation: string;
  suggestedFix: string | null;
  evidence?: string;
  /** Defaults to 1 — code checks are deterministic. Heuristics set lower. */
  confidence?: number;
}

export type RawCandidate = Omit<ClaimCandidate, "location" | "imageFile" | "span" | "text"> & { match: Match };

export type TextCheck = (text: string, ctx: CheckContext) => RawFinding[];
