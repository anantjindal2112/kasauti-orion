import { z } from "zod";
import { isExpired, type BrandPack } from "@/lib/brand-pack";
import { runCodeChecks } from "@/lib/checks";
import { splitSentences } from "@/lib/checks/text";
import { classifyFacts } from "@/lib/ledger/facts";
import { chatJson, type ChatMessage } from "@/lib/nvidia/chat";
import type { NvidiaClient } from "@/lib/nvidia/client";
import { withDeadline, type Intent } from "@/lib/pipeline/ai-review";
import { inventedFacts } from "@/lib/pipeline/verifier";
import { maskPII, unmaskPII } from "@/lib/privacy/mask";
import type { Finding } from "@/lib/schemas/finding";

/**
 * "Accept all fixes" as one rewrite. Fixing problems one span at a time breaks down when a
 * sentence has several (clashing rewrites, repeated calls to action). So the model rewrites the
 * whole draft once, fixing every listed issue and nothing else, and code then holds it to account:
 * every code check must pass, no price or % may be invented, and no fact may be stale or
 * contradicted. Fail twice → the span-by-span fixes are used instead.
 */

const rewriteSchema = z.object({ draft: z.string().describe("The full revised draft") });

export interface RewriteResult {
  text: string;
  /** "ai" = the verified rewrite; "plan" = the span-by-span fixes. */
  source: "ai" | "plan";
  modelId?: string;
}

/** Problems with a candidate rewrite, judged only by code. Empty = acceptable. */
export function rewriteProblems(
  candidate: string,
  original: string,
  baseline: string,
  pack: BrandPack,
  today: string,
  issues: Pick<Finding, "span" | "location">[] = [],
): string[] {
  const problems: string[] = [];
  // Sentences with no issue must survive as they are; the rewrite may not add new ones.
  const norm = (t: string) => t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
  const sentences = splitSentences(original);
  const cand = norm(candidate);
  for (const sen of sentences) {
    const touched = issues.some((f) => f.location === "text" && f.span.start < sen.end && sen.start < f.span.end);
    if (!touched && !cand.includes(norm(sen.text))) problems.push(`Keep this sentence exactly as it was: "${sen.text}"`);
  }
  if (splitSentences(candidate).length > sentences.length + 2) problems.push("Don't add sentences. Only fix the issues listed.");
  // The same sentence twice ("Shop the festive sale! Shop the festive sale.") — usually two CTA fixes landing on one answer.
  const seenSentences = new Set<string>();
  for (const sen of splitSentences(candidate)) {
    const k = norm(sen.text).replace(/[^\p{L}\p{N}₹% ]+/gu, "").trim();
    if (k.length > 3 && seenSentences.has(k)) problems.push(`"${sen.text}" appears twice. Keep one call to action.`);
    seenSentences.add(k);
  }
  // Strict: the rewrite must pass every code check. (`baseline` is only the fallback the caller keeps.)
  void baseline;
  const left = runCodeChecks({ text: candidate }, pack, { today }).findings.filter((f) => f.location === "text");
  if (left.length) problems.push(...left.map((f) => `${f.rule} "${f.quote}": ${f.explanation}`));
  // Superlatives and comparisons the brand list doesn't name ("most popular", "softer than other brands") still need proof.
  const liveClaims = pack.evidence.filter((e) => !isExpired(e, today)).map((e) => e.claim.toLowerCase());
  for (const m of candidate.matchAll(SUPERLATIVE)) {
    const phrase = m[0].toLowerCase().trim();
    if (!liveClaims.some((c) => c.includes(phrase))) problems.push(`"${m[0].trim()}" is a superlative or comparison with no proof in the ledger. Use plain, true wording.`);
  }
  const invented = inventedFacts(candidate, original, pack);
  if (invented.length) problems.push(`Uses ${invented.join(", ")}, which is not in the draft or the approved claims.`);
  for (const f of classifyFacts(candidate, pack, today)) {
    if (f.status === "stale" || f.status === "contradicted") problems.push(`"${f.match.text}" is ${f.status}: ${f.note}`);
    // An offer carries its conditions (KSR-6.2): every condition in the ledger entry must appear in the copy.
    if (f.status === "verified" && f.evidence?.conditions && (f.kind === "percent" || f.kind === "price")) {
      const missing = missingConditions(f.evidence.conditions, candidate);
      if (missing.length) problems.push(`The offer "${f.match.text}" must keep its conditions: ${missing.join(" ")}`);
    }
  }
  if (candidate.length > original.length * 1.6 + 80) problems.push("The rewrite is much longer than the draft. Change only what the issues need.");
  if (candidate.trim().length < Math.min(40, original.trim().length / 3)) problems.push("The rewrite dropped most of the draft.");
  return problems;
}

const SUPERLATIVE =
  /\b(?:(?:the\s+)?most\s+[\p{L}-]+|best\s+[\p{L}-]+|number\s+one|no\.?\s?1|#\s?1|top-rated|leading|biggest|lowest\s+price|unbeatable|[\p{L}-]+er\s+than\s+(?:any|other|another|most|all)\b[\p{L}\s-]{0,20}?(?:brands?|sheets?|towels?|products?))/giu;

const SKIP = new Set(["valid", "only", "sale", "ends", "with", "from", "until", "offer", "this", "that", "applies"]);

/** Condition sentences from a ledger entry whose key words don't appear in the copy. */
export function missingConditions(conditions: string, copy: string): string[] {
  const text = copy.toLowerCase();
  return splitSentences(conditions)
    .map((c) => c.text)
    .filter((c) => {
      const keys = (c.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 4 && !SKIP.has(w) && !/^\d{4}$/.test(w));
      return keys.length > 0 && keys.some((w) => !text.includes(w.replace(/s$/, "")));
    });
}

function messages(pack: BrandPack, draft: string, issues: Finding[], intent: Intent | undefined, today: string): ChatMessage[] {
  const rules = new Map(pack.rules.map((r) => [r.code, r]));
  // Only the entries the issues cite (and what replaced them) — a full list just gets pasted into the copy.
  const cited = new Set(issues.flatMap((f) => (f.evidence ? [f.evidence] : [])));
  for (const e of pack.evidence) if (cited.has(e.code) && e.supersededBy) cited.add(e.supersededBy);
  const live = pack.evidence.filter((e) => cited.has(e.code) && !isExpired(e, today));
  const system = [
    `You are the copy editor for ${pack.brand.name}. Voice: ${pack.brand.voice.summary}`,
    "Rewrite the DRAFT so that every ISSUE is fixed. Change nothing else: keep the structure, length and hashtags, and copy every sentence that has no issue word for word.",
    "Do not add new sentences or new facts.",
    "Where fixes meet, make the sentence read naturally. One call to action only.",
    "A suggested fix shows WHAT must change, not the wording: never paste it in where it doesn't read as natural English",
    "(e.g. not \"Our Winner, Best D2C Home Brand…, dyed with azo-free dyes set\" — write \"Our Monsoon Weave set, from the winner of Best D2C Home Brand 2024, is dyed with azo-free dyes\").",
    "Read every sentence you changed out loud in your head before replying.",
    "Facts: use only numbers, dates and claims from APPROVED CLAIMS or the DRAFT. An offer must keep its end date and condition.",
    "Remove unproven superlatives and absolute promises rather than inventing proof. Keep every MUST KEEP item.",
    'Reply with JSON only: {"draft": "<the full revised draft>"}.',
  ].join("\n");
  const user = [
    `MUST KEEP: ${intent?.mustKeep || "—"} · PURPOSE: ${intent?.purpose || "—"} · AUDIENCE: ${intent?.audience || "—"}`,
    "",
    `BRAND NAME: always written exactly "${pack.terms.brandName.correct}"`,
    "FACTS TO USE WHERE AN ISSUE NEEDS THEM (do not add them anywhere else):",
    ...(live.length ? live.map((e) => `- ${e.claim}${e.conditions ? ` ${e.conditions}` : ""}`) : ["- (none needed)"]),
    "",
    "ISSUES:",
    ...issues.map((f) => {
      const r = rules.get(f.rule);
      const fix = f.suggestedFix === null ? "" : f.suggestedFix === "" ? ' — suggested: delete it' : ` — suggested: "${f.suggestedFix}"`;
      return `- ${f.rule} ${r?.title ?? ""}: "${f.quote}" — ${f.explanation}${fix}`;
    }),
    "",
    "DRAFT:",
    '"""',
    draft,
    '"""',
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export async function rewriteDraft(args: {
  client: NvidiaClient;
  pack: BrandPack;
  draft: string;
  issues: Finding[];
  /** The span-by-span result: the fallback, and the bar the rewrite must clear. */
  planText: string;
  intent?: Intent;
  today: string;
}): Promise<RewriteResult> {
  const { client, pack, draft, issues, planText, intent, today } = args;
  const textIssues = issues.filter((f) => f.location === "text");
  if (!textIssues.length) return { text: planText, source: "plan" };

  const { masked, tokens } = maskPII(draft);
  let msgs = messages(pack, masked, textIssues, intent, today);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await withDeadline(
        chatJson(client, msgs, rewriteSchema, { model: "reasoning", fallback: null, schemaMode: "prompt", maxTokens: 2000, timeoutMs: 25_000 }),
        26_000,
        "rewrite",
      );
      const candidate = unmaskPII(res.data.draft, tokens).trim();
      const problems = rewriteProblems(candidate, draft, planText, pack, today, textIssues);
      if (process.env.KASAUTI_DEBUG) console.error(`[rewrite attempt ${attempt + 1}]`, candidate, problems);
      if (!problems.length) return { text: candidate, source: "ai", modelId: res.modelId };
      msgs = [
        ...msgs,
        { role: "assistant", content: JSON.stringify({ draft: res.data.draft }) },
        { role: "user", content: `That rewrite still has problems. Fix them and reply with the full draft again:\n${problems.map((p) => `- ${p}`).join("\n")}` },
      ];
    } catch {
      break;
    }
  }
  return { text: planText, source: "plan" };
}
