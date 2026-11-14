import { isExpired, type BrandPack } from "@/lib/brand-pack";
import { cosine, type InputType } from "@/lib/nvidia/embed";
import type { Evidence, Rule } from "@/lib/schemas/brand-pack";

/**
 * Stage 5 — retrieval over the rulebook and the Claim Ledger.
 *
 * Every rule and evidence entry is embedded once ("passage"), each draft sentence is
 * embedded as a "query", and the closest passages are kept. Our NVIDIA account has no live
 * reranker, so ranking is cosine similarity; the AI reviewer is the judgement layer on top.
 * Until Supabase/pgvector is set up (Stage 2) the index lives in memory.
 */

export type EmbedFn = (texts: string[], type: InputType) => Promise<number[][]>;

export interface Passage {
  kind: "rule" | "evidence";
  code: string;
  text: string;
}

export interface Retrieved {
  rules: Rule[];
  evidence: Evidence[];
  /** Best similarity per retrieved code — for debugging and the eval. */
  scores: Record<string, number>;
}

export function rulePassage(r: Rule): string {
  return `${r.code} ${r.title}. ${r.body} Good: ${r.goodExamples.join(" / ")}. Bad: ${r.badExamples.join(" / ")}.`;
}

export function evidencePassage(e: Evidence): string {
  return `${e.code} ${e.title}. Approved claim: ${e.claim}${e.conditions ? ` Condition: ${e.conditions}` : ""} Tags: ${e.tags.join(", ")}.`;
}

export function passagesFor(pack: BrandPack): Passage[] {
  return [
    ...pack.rules.map((r) => ({ kind: "rule" as const, code: r.code, text: rulePassage(r) })),
    ...pack.evidence.map((e) => ({ kind: "evidence" as const, code: e.code, text: evidencePassage(e) })),
  ];
}

interface Index {
  key: string;
  passages: Passage[];
  vectors: number[][];
}

let cached: Index | undefined;

/** Embeds the brand pack once per process; re-embeds only if the pack text changes. */
async function getIndex(pack: BrandPack, embedFn: EmbedFn): Promise<Index> {
  const passages = passagesFor(pack);
  const key = passages.map((p) => p.text).join("\n");
  if (cached?.key === key) return cached;
  const vectors = await embedFn(
    passages.map((p) => p.text),
    "passage",
  );
  cached = { key, passages, vectors };
  return cached;
}

/** Test hook. */
export function resetRetrievalIndex() {
  cached = undefined;
}

/**
 * Retrieve the rules and evidence closest to any of the query sentences.
 * `perQuery` passages are kept for each sentence; the union is returned, best first.
 */
export async function retrieve(
  queries: string[],
  pack: BrandPack,
  embedFn: EmbedFn,
  opts: { perQuery?: number; minScore?: number; today?: string } = {},
): Promise<Retrieved> {
  const perQuery = opts.perQuery ?? 6;
  const minScore = opts.minScore ?? 0;
  const clean = queries.map((q) => q.trim()).filter(Boolean);
  if (!clean.length) return { rules: [], evidence: [], scores: {} };

  const index = await getIndex(pack, embedFn);
  const qv = await embedFn(clean, "query");

  const scores: Record<string, number> = {};
  for (const q of qv) {
    index.vectors
      .map((v, i) => ({ i, s: cosine(q, v) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, perQuery)
      .filter((x) => x.s >= minScore)
      .forEach(({ i, s }) => {
        const code = index.passages[i].code;
        scores[code] = Math.max(scores[code] ?? -1, s);
      });
  }

  const byScore = (a: { code: string }, b: { code: string }) => (scores[b.code] ?? 0) - (scores[a.code] ?? 0);
  return {
    rules: pack.rules.filter((r) => r.code in scores).sort(byScore),
    // Expired entries stay in: the reviewer needs them to call a claim stale.
    evidence: pack.evidence.filter((e) => e.code in scores).sort(byScore),
    scores,
  };
}

/** Evidence entries whose superseding entry should travel with them (stale → current). */
export function withSuccessors(evidence: Evidence[], pack: BrandPack, today?: string): Evidence[] {
  const out = new Map(evidence.map((e) => [e.code, e]));
  for (const e of evidence) {
    if (e.supersededBy && isExpired(e, today)) {
      const next = pack.evidence.find((x) => x.code === e.supersededBy);
      if (next) out.set(next.code, next);
    }
  }
  return [...out.values()];
}
