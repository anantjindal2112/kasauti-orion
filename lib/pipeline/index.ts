import { DEMO_TODAY, type BrandPack } from "@/lib/brand-pack";
import { runCodeChecks, type CheckInput } from "@/lib/checks";
import { splitSentences } from "@/lib/checks/text";
import { embed } from "@/lib/nvidia/embed";
import type { NvidiaClient } from "@/lib/nvidia/client";
import { safetyCheck } from "@/lib/nvidia/safety";
import { askReviewer, buildReviewMessages, type AiFinding, type Intent } from "@/lib/pipeline/ai-review";
import { retrieve, withSuccessors, type EmbedFn } from "@/lib/pipeline/retrieval";
import { verify, type Dropped } from "@/lib/pipeline/verifier";
import { maskPII } from "@/lib/privacy/mask";
import type { AiMeta } from "@/lib/scan-types";
import type { ClaimCandidate, Finding } from "@/lib/schemas/finding";

export interface ReviewResult {
  findings: Finding[];
  candidates: ClaimCandidate[];
  ai: AiMeta;
}

/**
 * The full pipeline: code checks → mask PII → retrieve rules + proof → AI review → Verifier.
 * If anything in the AI half fails, the code findings still come back (the fallback the plan promises).
 */
export async function reviewDraft(
  input: CheckInput & { intent?: Intent },
  pack: BrandPack,
  opts: { client: NvidiaClient | null; ai?: boolean; today?: string; embedFn?: EmbedFn },
): Promise<ReviewResult> {
  const today = opts.today ?? DEMO_TODAY;
  const code = runCodeChecks(input, pack, { today });
  const textFindings = code.findings.filter((f) => f.location === "text");

  if (opts.ai === false) return { ...code, ai: { ran: false, error: "AI review turned off" } };
  if (!opts.client) return { ...code, ai: { ran: false, error: "NVIDIA key not configured — showing code checks only" } };

  const client = opts.client;
  const started = Date.now();
  try {
    // Trust rule 03: personal data never reaches a model.
    const { masked, tokens } = maskPII(input.text);

    const embedFn: EmbedFn = opts.embedFn ?? (async (texts, type) => (await embed(client, texts, type)).data);
    const sentences = splitSentences(masked).map((s) => s.text);
    const candidateTexts = code.candidates.filter((c) => c.location === "text").map((c) => c.text);

    const [retrieved, safety] = await Promise.all([
      retrieve([...sentences, ...candidateTexts], pack, embedFn, { perQuery: 6, today }),
      safetyCheck(client, masked).catch(() => null),
    ]);

    // AI-judged rules always go in (there are few); retrieval adds the closest code rules for context.
    const aiRules = pack.rules.filter((r) => r.checkType !== "code");
    const ruleSet = [...new Map([...aiRules, ...retrieved.rules.slice(0, 6)].map((r) => [r.code, r])).values()];
    // Evidence: everything retrieval found, plus evidence code already linked, plus successors of stale entries.
    const linked = new Set([...code.candidates.flatMap((c) => c.evidence), ...code.findings.flatMap((f) => (f.evidence ? [f.evidence] : []))]);
    const evidence = withSuccessors(
      [...retrieved.evidence, ...pack.evidence.filter((e) => linked.has(e.code) && !retrieved.evidence.includes(e))],
      pack,
      today,
    );

    const messages = buildReviewMessages({
      pack,
      draft: masked,
      rules: ruleSet,
      evidence,
      candidates: code.candidates.filter((c) => c.location === "text"),
      codeFindings: textFindings,
      intent: input.intent,
      today,
    });
    const res = await askReviewer(client, messages);
    const result = verify({ draft: input.text, aiFindings: res.data, codeFindings: code.findings, pack, modelId: res.modelId, tokens, today });

    return {
      findings: [...code.findings, ...result.kept],
      candidates: code.candidates,
      ai: {
        ran: true,
        modelId: res.modelId,
        latencyMs: Date.now() - started,
        rulesConsidered: ruleSet.map((r) => r.code),
        evidenceConsidered: evidence.map((e) => e.code),
        proposed: res.data.length,
        verified: result.kept.filter((k) => k.review === "verified").length,
        needsReview: result.kept.filter((k) => k.review === "needs_review").length,
        dropped: result.dropped.map((d: Dropped) => ({ rule: d.finding.rule, quote: d.finding.quote, reason: d.reason })),
        maskedItems: tokens.length,
        safety: safety ? { ...safety.data, modelId: safety.modelId } : null,
      },
    };
  } catch (e) {
    return {
      ...code,
      ai: { ran: false, error: `AI review unavailable (${e instanceof Error ? e.message.slice(0, 160) : "error"}) — showing code checks only`, latencyMs: Date.now() - started },
    };
  }
}

export type { AiFinding, AiMeta, Intent };
