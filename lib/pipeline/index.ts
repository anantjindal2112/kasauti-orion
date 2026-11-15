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
import { buildCodeLedger, reconcile } from "@/lib/ledger";
import { askLedger, buildLedgerMessages, groundAiClaims } from "@/lib/ledger/ai";
import type { LedgerClaim } from "@/lib/schemas/claim";
import type { AiMeta } from "@/lib/scan-types";
import type { ClaimCandidate, Finding } from "@/lib/schemas/finding";

export interface ReviewResult {
  findings: Finding[];
  candidates: ClaimCandidate[];
  /** Stage 7: every claim in the draft and what the Claim Ledger says about it. */
  claims: LedgerClaim[];
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
  const codeLedger = buildCodeLedger(input, pack, today);
  const codeOnly = { ...code, claims: reconcile(codeLedger, code.findings) };

  if (opts.ai === false) return { ...codeOnly, ai: { ran: false, error: "AI review turned off" } };
  if (!opts.client) return { ...codeOnly, ai: { ran: false, error: "NVIDIA key not configured — showing code checks only" } };

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
    // The ledger pass runs beside the reviewer. Small packs send the whole ledger; it can't hurt to see every entry.
    const ledgerEvidence = pack.evidence.length <= 40 ? pack.evidence : evidence;
    const ledgerStarted = Date.now();
    const ledgerCall = askLedger(
      client,
      buildLedgerMessages({
        pack,
        draft: masked,
        evidence: ledgerEvidence,
        open: codeLedger.filter((c) => c.location === "text" && c.status === "unchecked"),
        decided: codeLedger.filter((c) => c.location === "text" && c.status !== "unchecked"),
        today,
      }),
    ).then(
      (r) => ({ ok: true as const, r, ms: Date.now() - ledgerStarted }),
      (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message.slice(0, 160) : "error", ms: Date.now() - ledgerStarted }),
    );

    const res = await askReviewer(client, messages);
    const result = verify({ draft: input.text, aiFindings: res.data, codeFindings: code.findings, pack, modelId: res.modelId, tokens, today });

    // Code wins on proof: an AI claims finding (price, evidence, certificate) on words the ledger verifiably
    // backs is dropped — as is "your new favourite set", which describes the reader, not the brand.
    const backed = codeLedger.filter((c) => c.location === "text" && c.status === "verified" && c.source === "rule");
    const readerChoice = [...input.text.matchAll(/\byour\s+(?:new\s+)?favou?rite\b/gi)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
    const hit = (f: { span: { start: number; end: number } }, spans: { start: number; end: number }[]) =>
      spans.find((c) => c.start < f.span.end && f.span.start < c.end);
    const overruled: { f: (typeof result.kept)[number]; reason: string }[] = [];
    for (const f of result.kept) {
      if (f.location !== "text" || !/^KSR-4\.[123]$/.test(f.rule)) continue;
      const c = backed.find((b) => hit(f, [b.span]));
      if (c) overruled.push({ f, reason: `the Claim Ledger backs "${c.text}" (${c.evidence})` });
      else if (f.rule === "KSR-4.2" && hit(f, readerChoice) && f.quote.split(/\s+/).length <= 4) overruled.push({ f, reason: "describes the reader's choice, not a brand claim" });
    }
    for (const { f, reason } of overruled) {
      result.dropped.push({
        finding: { rule: f.rule, evidence: f.evidence ?? null, quote: f.quote, explanation: f.explanation, suggestedFix: f.suggestedFix, confidence: f.confidence },
        reason,
      });
    }
    result.kept = result.kept.filter((f) => !overruled.some((o) => o.f === f));
    const findings = [...code.findings, ...result.kept];
    const ledgerRes = await ledgerCall;
    const grounded = ledgerRes.ok
      ? groundAiClaims({ draft: input.text, aiClaims: ledgerRes.r.data, codeClaims: codeLedger, pack, today, modelId: ledgerRes.r.modelId, tokens })
      : null;

    return {
      findings,
      candidates: code.candidates,
      claims: reconcile(grounded?.claims ?? codeLedger, findings),
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
        ledger:
          ledgerRes.ok && grounded
            ? { ran: true, modelId: ledgerRes.r.modelId, latencyMs: ledgerRes.ms, judged: grounded.judged, added: grounded.added, dropped: grounded.dropped }
            : { ran: false, error: ledgerRes.ok ? "no result" : ledgerRes.error, latencyMs: ledgerRes.ms },
      },
    };
  } catch (e) {
    return {
      ...codeOnly,
      ai: { ran: false, error: `AI review unavailable (${e instanceof Error ? e.message.slice(0, 160) : "error"}) — showing code checks only`, latencyMs: Date.now() - started },
    };
  }
}

export type { AiFinding, AiMeta, Intent };
