import { DEMO_TODAY, type BrandPack } from "@/lib/brand-pack";
import { runCodeChecks, type CheckInput } from "@/lib/checks";
import { splitSentences } from "@/lib/checks/text";
import { embed } from "@/lib/nvidia/embed";
import type { NvidiaClient } from "@/lib/nvidia/client";
import { safetyCheck } from "@/lib/nvidia/safety";
import { checkIntent, hasIntent } from "@/lib/pipeline/intent-lock";
import { askReviewer, buildReviewMessages, withDeadline, type AiFinding, type Intent } from "@/lib/pipeline/ai-review";
import { retrieve, withSuccessors, type EmbedFn } from "@/lib/pipeline/retrieval";
import { verify, type Dropped } from "@/lib/pipeline/verifier";
import { maskPII } from "@/lib/privacy/mask";
import { buildCodeLedger, reconcile } from "@/lib/ledger";
import { askLedger, buildLedgerMessages, groundAiClaims } from "@/lib/ledger/ai";
import type { LedgerClaim } from "@/lib/schemas/claim";
import { writeFixes } from "@/lib/pipeline/fix-writer";
import type { AiMeta } from "@/lib/scan-types";
import type { ClaimCandidate, Finding } from "@/lib/schemas/finding";

/** How long embedding search gets before the full ledger is sent instead. */
const RETRIEVAL_DEADLINE_MS = 4_000;

export interface ReviewResult {
  findings: Finding[];
  candidates: ClaimCandidate[];
  /** Stage 7: every claim in the draft and what the Claim Ledger says about it. */
  claims: LedgerClaim[];
  ai: AiMeta;
}

/** On a re-check (after fixes were accepted), the AI findings shown last time, as "rule|quote". */
export interface Recheck {
  aiSeen: string[];
  /** Fix wording accepted in the last round. The reviewer doesn't get to argue with its own accepted fixes. */
  accepted?: string[];
}

/**
 * The full pipeline: code checks → mask PII → retrieve rules + proof → AI review → Verifier.
 * If anything in the AI half fails, the code findings still come back (the fallback the plan promises).
 */
export async function reviewDraft(
  input: CheckInput & { intent?: Intent },
  pack: BrandPack,
  opts: { client: NvidiaClient | null; ai?: boolean; today?: string; embedFn?: EmbedFn; recheck?: Recheck },
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

    // Embedding search picks the closest rules and proof. If the embedding model is slow or down, the whole
    // ledger goes to the reviewer instead (packs are small enough to fit): slower to read, but the scan still works.
    const [retrieved, safety] = await Promise.all([
      withDeadline(retrieve([...sentences, ...candidateTexts], pack, embedFn, { perQuery: 6, today }), RETRIEVAL_DEADLINE_MS, "retrieval").catch(() => ({
        rules: [] as BrandPack["rules"],
        evidence: pack.evidence,
        scores: {} as Record<string, number>,
      })),
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

    // The fix-writer drafts fixes for code findings that have none, beside the reviewer and the ledger pass.
    const fixStarted = Date.now();
    const fixCall = writeFixes({ client, pack, draft: input.text, findings: code.findings, today }).then(
      (r) => ({ ok: true as const, r, ms: Date.now() - fixStarted }),
      () => ({ ok: false as const, ms: Date.now() - fixStarted }),
    );

    // If the reviewer model fails (e.g. it returns broken JSON twice), the rest of the AI half still runs:
    // the ledger pass, the fix writer and Intent Lock don't depend on it. The disclosure says so.
    let reviewerError: string | undefined;
    const res = await askReviewer(client, messages).catch((e: unknown) => {
      reviewerError = `The reviewer model failed (${e instanceof Error ? e.message.slice(0, 100) : "error"}); its findings are missing from this scan.`;
      return { data: [] as AiFinding[], modelId: "reviewer unavailable", latencyMs: 0, attempts: 0 };
    });
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

    // A re-check after accepting fixes reports real problems, not fresh second opinions: a new
    // low-confidence finding the reviewer didn't raise last time is set aside (listed in the disclosure).
    if (opts.recheck) {
      const seen = new Set(opts.recheck.aiSeen);
      const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}₹%]+/gu, " ").trim();
      const accepted = (opts.recheck.accepted ?? []).map(norm).filter((t) => t.length >= 8);
      const onAccepted = (q: string) => accepted.some((a) => norm(q).includes(a) || a.includes(norm(q)));
      const fresh = result.kept.filter(
        (f) => !seen.has(`${f.rule}|${f.quote}`) && (f.review === "needs_review" || onAccepted(f.quote)),
      );
      for (const f of fresh) {
        result.dropped.push({
          finding: { rule: f.rule, evidence: f.evidence ?? null, quote: f.quote, explanation: f.explanation, suggestedFix: f.suggestedFix, confidence: f.confidence },
          reason: onAccepted(f.quote) ? "argues with a fix accepted in this review" : "new low-confidence opinion on a re-check after fixes",
        });
      }
      result.kept = result.kept.filter((f) => !fresh.includes(f));
    }

    const fixRes = await fixCall;
    const written = fixRes.ok && fixRes.r ? fixRes.r : null;
    const codeFindings = written
      ? code.findings.map((f) => {
          const w = written.fixes.get(f.id);
          // A widened fix replaces the clause around the problem, so the finding now points at that clause.
          return w ? { ...f, quote: w.quote, span: w.span, suggestedFix: w.fix, fixBy: written.modelId } : f;
        })
      : code.findings;
    const merged = [...codeFindings, ...result.kept];
    // Intent Lock runs beside the ledger pass: every suggested fix is tested against the Intent Card.
    const intentCall = hasIntent(input.intent) ? checkIntent({ client, draft: input.text, findings: merged, intent: input.intent! }) : null;
    const ledgerRes = await ledgerCall;
    // Nothing from the AI half worked: that is "AI unavailable", and the code findings go out on their own.
    if (reviewerError && !ledgerRes.ok && !fixRes.ok) throw new Error(reviewerError);
    const intentRes = intentCall ? await intentCall : null;
    const findings = intentRes ? merged.map((f) => (intentRes.verdicts.has(f.id) ? { ...f, intent: intentRes.verdicts.get(f.id) } : f)) : merged;
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
        reviewerError,
        proposed: res.data.length,
        verified: result.kept.filter((k) => k.review === "verified").length,
        needsReview: result.kept.filter((k) => k.review === "needs_review").length,
        dropped: result.dropped.map((d: Dropped) => ({ rule: d.finding.rule, quote: d.finding.quote, reason: d.reason })),
        maskedItems: tokens.length,
        safety: safety ? { ...safety.data, modelId: safety.modelId } : null,
        intent: intentRes?.meta,
        fixWriter: written
          ? { ran: true, modelId: written.modelId, latencyMs: fixRes.ms, written: written.fixes.size, rejected: written.rejected.length, rejectedReasons: written.rejected.map((r) => r.reason) }
          : undefined,
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
