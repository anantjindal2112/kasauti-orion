import { z } from "zod";
import { isExpired, type BrandPack } from "@/lib/brand-pack";
import { runCodeChecks } from "@/lib/checks";
import { splitSentences } from "@/lib/checks/text";
import { fixHolds } from "@/lib/fixes/plan";
import { chatJson, type ChatMessage } from "@/lib/nvidia/chat";
import type { NvidiaClient } from "@/lib/nvidia/client";
import { withDeadline } from "@/lib/pipeline/ai-review";
import { maskPII, unmaskPII, type MaskToken } from "@/lib/privacy/mask";
import type { Finding } from "@/lib/schemas/finding";

/**
 * Code can find "Cheap", "never fade" or "most trusted", but rewriting them needs judgement.
 * The fast model drafts a replacement for each code finding that has no fix; code then tries
 * every draft inside the whole text (fixHolds) and only keeps the ones that clear the problem
 * without breaking anything or inventing facts. The rest stay with a person.
 */

export const fixWriterSchema = z.object({
  fixes: z
    .array(
      z.object({
        id: z.string().describe("The id of the item, copied exactly"),
        target: z
          .string()
          .describe("The exact words from the SENTENCE you are replacing. Usually the QUOTE itself; a longer clause around it only if the sentence would not read naturally otherwise. Must contain the QUOTE."),
        fix: z.string().describe("Replacement for the target. Empty string to delete it."),
      }),
    )
    .max(20),
});

/** Findings worth asking about: in the copy, no fix yet, not alt text (that needs the image). */
export const needsAFix = (f: Finding) => f.location === "text" && f.suggestedFix === null && f.rule !== "KSR-5.1";

/** Spans refer to the original draft, so each quote and sentence is masked on its own before the model sees it. */
export function buildFixMessages(pack: BrandPack, draft: string, items: Finding[], today: string): { messages: ChatMessage[]; tokens: MaskToken[] } {
  const rules = new Map(pack.rules.map((r) => [r.code, r]));
  const sentences = splitSentences(draft);
  const tokens: MaskToken[] = [];
  const mask = (t: string) => {
    const m = maskPII(t);
    tokens.push(...m.tokens);
    return m.masked;
  };
  const sentenceOf = (f: Finding) => mask(sentences.find((s) => f.span.start >= s.start && f.span.start < s.end)?.text ?? "");
  const live = pack.evidence.filter((e) => !isExpired(e, today));
  const system = [
    `You fix copy for ${pack.brand.name}. Voice: ${pack.brand.voice.summary}`,
    "The DRAFT may be English, Hindi (Devanagari) or Hinglish (Hindi in Roman letters). Keep the SENTENCE's own language and script: write every replacement in the same language and script as the words it replaces. Explanations are in English.",
    "For each ITEM, choose a TARGET — the exact words in the SENTENCE to replace — and write its replacement.",
    "The TARGET is usually just the QUOTE. Widen it to the surrounding clause only when the sentence would not read naturally otherwise",
    "(e.g. to delete a certificate you must remove the whole claim, not just its name). The TARGET must contain the QUOTE.",
    "The replacement replaces the TARGET only: never repeat words that sit outside it. Read the SENTENCE with it in place —",
    "it must read naturally, keep the writer's intent, and break no rule.",
    "Prefer the smallest change. Use an empty string to delete words that add nothing (e.g. a banned word, an absolute promise, a pressure phrase).",
    "Never invent facts: only use numbers, dates and claims from APPROVED CLAIMS or the draft. Unproven superlatives become plain, true wording.",
    "Hashtags: capitalise each word (#FestiveSale). Link text: say where it goes (\"Shop the festive sale\").",
    "Reply with JSON only.",
  ].join("\n");
  const user = [
    "APPROVED CLAIMS:",
    ...live.map((e) => `- ${e.claim}${e.conditions ? ` (${e.conditions})` : ""}`),
    "",
    "ITEMS:",
    ...items.map((f) => {
      const r = rules.get(f.rule);
      return `- id: ${f.id}\n  rule: ${f.rule} ${r?.title ?? ""}: ${r?.body ?? ""}\n  problem: ${mask(f.explanation)}\n  QUOTE: "${mask(f.quote)}"\n  SENTENCE: ${sentenceOf(f)}`;
    }),
  ].join("\n");
  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    tokens,
  };
}

export interface WrittenFix {
  fix: string;
  /** What the fix replaces: the finding's quote, or the clause around it. */
  span: { start: number; end: number };
  quote: string;
}

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? [];

/** Cheap checks on the fix text itself, before trying it in the draft. */
function fixProblem(
  fix: string,
  draft: string,
  span: { start: number; end: number },
  sentence: { start: number; end: number } | undefined,
  pack: BrandPack,
  today: string,
): string | null {
  // A fix must not break a code rule on its own ("…softer than LoomKart, guaranteed").
  const own = runCodeChecks({ text: fix }, pack, { today }).findings.filter((x) => x.rule !== "KSR-2.4");
  if (own.length) return `the fix itself breaks ${[...new Set(own.map((o) => o.rule))].join(", ")}`;
  // Nor repeat the rest of the sentence (a model rewriting the whole sentence into one word's slot).
  if (sentence) {
    const outside = words(draft.slice(sentence.start, span.start) + " | " + draft.slice(span.end, sentence.end)).join(" ");
    const w = words(fix);
    for (let i = 0; i + 3 <= w.length; i++) if (outside.includes(w.slice(i, i + 3).join(" "))) return "the fix repeats words from the rest of the sentence";
  }
  return null;
}

export interface FixWriterResult {
  /** Fixes that passed the code checks, by finding id. */
  fixes: Map<string, WrittenFix>;
  modelId: string;
  rejected: { id: string; reason: string }[];
}

export async function writeFixes(args: {
  client: NvidiaClient;
  pack: BrandPack;
  draft: string;
  findings: Finding[];
  today: string;
}): Promise<FixWriterResult | null> {
  const { client, pack, draft, findings, today } = args;
  const items = findings.filter(needsAFix);
  if (!items.length) return null;
  const { messages, tokens } = buildFixMessages(pack, draft, items, today);
  const res = await withDeadline(
    chatJson(client, messages, fixWriterSchema, {
      model: "fast",
      fallback: null,
      schemaMode: "prompt",
      maxTokens: 1500,
      timeoutMs: 15_000,
    }),
    18_000,
    "fix writer",
  );
  const fixes = new Map<string, WrittenFix>();
  const rejected: FixWriterResult["rejected"] = [];
  const sentences = splitSentences(draft);
  for (const { id, target: rawTarget, fix: raw } of res.data.fixes) {
    const f = items.find((i) => i.id === id.trim());
    if (!f || fixes.has(f.id)) continue;
    const fix = unmaskPII(raw, tokens).trim();
    const sentence = sentences.find((x) => f.span.start >= x.start && f.span.start < x.end);
    // The target must be in the same sentence and contain the original quote; otherwise fall back to the quote.
    const target = unmaskPII(rawTarget, tokens).trim();
    let span = f.span;
    if (sentence && target && target !== f.quote) {
      const at = draft.indexOf(target, sentence.start);
      if (at >= sentence.start && at + target.length <= sentence.end && at <= f.span.start && at + target.length >= f.span.end) {
        span = { start: at, end: at + target.length };
      }
    }
    const quote = draft.slice(span.start, span.end);
    if (fix === quote) continue;
    const problem = fixProblem(fix, draft, span, sentence, pack, today) ?? (() => {
      const check = fixHolds(draft, { ...f, span }, fix, pack, today);
      return check.ok ? null : check.reason;
    })();
    if (problem) rejected.push({ id: f.id, reason: problem });
    else fixes.set(f.id, { fix, span, quote });
  }
  return { fixes, modelId: res.modelId, rejected };
}
