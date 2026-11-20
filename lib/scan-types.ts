import type { LedgerClaim } from "@/lib/schemas/claim";
import type { ClaimCandidate, Finding } from "@/lib/schemas/finding";

/** Shapes shared by the scan API and the browser. No server imports here. */

export interface ScannedImage {
  name: string;
  text: string;
  textSource: "nvidia" | "demo" | "none";
  modelId?: string;
  latencyMs?: number;
  note?: string;
}

/** What the AI half of the pipeline did — shown in the UI for AI disclosure (trust rule 04). */
export interface AiMeta {
  ran: boolean;
  /** Why AI review did not run, or failed (code findings are still returned). */
  error?: string;
  modelId?: string;
  latencyMs?: number;
  rulesConsidered?: string[];
  evidenceConsidered?: string[];
  /** The reviewer model failed; the rest of the AI half still ran. */
  reviewerError?: string;
  proposed?: number;
  verified?: number;
  needsReview?: number;
  dropped?: { rule: string; quote: string; reason: string }[];
  maskedItems?: number;
  safety?: { safe: boolean; categories: string[]; modelId: string } | null;
  /** AI-written fixes for code findings that had none (each checked by code before it is offered). */
  fixWriter?: { ran: boolean; modelId?: string; latencyMs?: number; written?: number; rejected?: number; rejectedReasons?: string[] };
  /** Intent Lock: suggested fixes tested against the Intent Card. */
  intent?: { ran: boolean; codeOnly: boolean; checked: number; flagged: number; modelId?: string; latencyMs?: number; error?: string };
  /** Image review: logo version and text contrast, read by the vision model and decided by code. */
  imageReview?: { ran: boolean; checked: number; flagged: number; modelId?: string; error?: string };
  /** The Claim Ledger's AI pass (implicit claims + "does this evidence support it?"). */
  ledger?: {
    ran: boolean;
    error?: string;
    modelId?: string;
    latencyMs?: number;
    /** Unchecked claims the model settled. */
    judged?: number;
    /** New claims it found in plain words. */
    added?: number;
    dropped?: { quote: string; reason: string }[];
  };
}

export interface ScanResponse {
  findings: Finding[];
  candidates: ClaimCandidate[];
  claims: LedgerClaim[];
  images: ScannedImage[];
  ai: AiMeta;
  timings: { totalMs: number; ocrMs: number };
}

export interface DemoImage {
  name: string;
  /** Public URL of the PNG. */
  src: string;
  alt: string | null;
  /** Known text in the image — fallback when OCR is unavailable. */
  demoText?: string;
}

export interface DemoDraft {
  id: string;
  title: string;
  channel: string;
  author: string;
  text: string;
  intent: { purpose: string; audience: string; mustKeep: string[] };
  images: DemoImage[];
  expectedCount: number;
  /** Showcase drafts: what this example demonstrates. */
  shows?: string[];
}

export interface RuleInfo {
  code: string;
  title: string;
  layer: string;
  checkType: string;
}

export interface EvidenceInfo {
  code: string;
  title: string;
  claim: string;
  source: string;
  expiresAt: string | null;
  expired: boolean;
  verifiedAt: string;
  owner: string;
}

/** What /api/fixall returns: the draft with every fix applied (and checked), plus alt text for images that had none. */
export interface FixAllResponse {
  text: string;
  /** "ai" = one verified rewrite of the whole draft; "plan" = the span-by-span fixes. */
  source: "ai" | "plan";
  modelId?: string;
  alts: { name: string; alt: string }[];
}
