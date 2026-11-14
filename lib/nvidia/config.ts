/**
 * Model IDs by job. Tested on our account on 13 Nov 2026 — see docs/nvidia-models.md.
 * Swap a model here and re-run `npm run smoke:nvidia`; nothing else should change.
 */
export const MODELS = {
  /** Findings, fixes, Intent Check, rule drafts. */
  reasoning: "nvidia/nemotron-3-ultra-550b-a55b",
  /** Fast general model; fallback when `reasoning` fails. */
  fast: "nvidia/nemotron-3.5-lightning-30b-a3b",
  /** Cheapest triage. */
  tiny: "nvidia/nemotron-3.5-bolt-e4b",
  embed: "nvidia/nemotron-3.5-embed-1b",
  /** OCR and image understanding. */
  vision: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  safety: "nvidia/llama-3.1-nemotron-safety-guard-8b-v3",
  safetyBackup: "meta/llama-guard-4-12b",
  translate: "nvidia/riva-translate-4b-instruct-v2",
} as const;

export type ModelRole = keyof typeof MODELS;

/** 1024 fits a pgvector HNSW index (max 2000); the model's default is 2048. */
export const EMBED_DIMENSIONS = 1024;

export const DEFAULT_TIMEOUT_MS = 45_000;
export const VISION_TIMEOUT_MS = 90_000;

export function resolveModel(model: ModelRole | string): string {
  return model in MODELS ? MODELS[model as ModelRole] : model;
}
