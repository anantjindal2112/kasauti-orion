import type { NvidiaClient, NvidiaResult } from "@/lib/nvidia/client";
import { EMBED_DIMENSIONS, MODELS } from "@/lib/nvidia/config";

/** "passage" for things we store (rules, evidence), "query" for things we search with (draft sentences). */
export type InputType = "query" | "passage";

interface EmbedResponse {
  data: { index: number; embedding: number[] }[];
}

/** Embed many texts, batched, keeping input order. */
export async function embed(
  client: NvidiaClient,
  texts: string[],
  inputType: InputType,
  opts: { batchSize?: number; dimensions?: number } = {},
): Promise<NvidiaResult<number[][]>> {
  const batchSize = opts.batchSize ?? 32;
  const vectors: number[][] = [];
  const started = Date.now();
  let attempts = 0;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await client.post<EmbedResponse>("/embeddings", {
      model: MODELS.embed,
      input: batch,
      input_type: inputType,
      encoding_format: "float",
      dimensions: opts.dimensions ?? EMBED_DIMENSIONS,
    });
    attempts += res.attempts;
    vectors.push(...[...res.data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding));
  }
  return { data: vectors, modelId: MODELS.embed, latencyMs: Date.now() - started, attempts };
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`Vector sizes differ: ${a.length} vs ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface Ranked {
  index: number;
  score: number;
}

/** Rank passage vectors against a query vector, best first. */
export function rankVectors(query: number[], passages: number[][], topK = passages.length): Ranked[] {
  return passages
    .map((p, index) => ({ index, score: cosine(query, p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Our account has no live reranker (both NVIDIA rerankers are retired or unavailable), so
 * ranking is embedding similarity. Stage 5 adds an LLM pass on top of the top-k.
 */
export async function rankBySimilarity(
  client: NvidiaClient,
  query: string,
  passages: string[],
  topK = 5,
): Promise<NvidiaResult<Ranked[]>> {
  const [q, p] = await Promise.all([embed(client, [query], "query"), embed(client, passages, "passage")]);
  return {
    data: rankVectors(q.data[0], p.data, topK),
    modelId: MODELS.embed,
    latencyMs: Math.max(q.latencyMs, p.latencyMs),
    attempts: q.attempts + p.attempts,
  };
}
