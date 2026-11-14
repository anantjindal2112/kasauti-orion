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
  proposed?: number;
  verified?: number;
  needsReview?: number;
  dropped?: { rule: string; quote: string; reason: string }[];
  maskedItems?: number;
  safety?: { safe: boolean; categories: string[]; modelId: string } | null;
}

export interface ScanResponse {
  findings: Finding[];
  candidates: ClaimCandidate[];
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
}
