import { z } from "zod";
import { isExpired, type BrandPack } from "@/lib/brand-pack";
import { chatJson, type ChatMessage } from "@/lib/nvidia/chat";
import type { NvidiaClient, NvidiaResult } from "@/lib/nvidia/client";
import type { Evidence, Rule } from "@/lib/schemas/brand-pack";
import type { ClaimCandidate, Finding } from "@/lib/schemas/finding";

/** What the model must return. Anything else is rejected by chatJson (Zod + one retry). */
export const aiFindingSchema = z.object({
  rule: z.string().describe("One rule code from the RULES list, e.g. KSR-4.2"),
  evidence: z.string().nullable().describe("An evidence code from the EVIDENCE list if one is relevant, else null"),
  quote: z.string().describe("Exact words copied from the DRAFT, character for character — the shortest span that shows the problem"),
  explanation: z.string().describe("One or two plain sentences: what is wrong and why, citing evidence codes when relevant"),
  suggestedFix: z.string().nullable().describe("Replacement text for the quote that fixes it and keeps the intent; null if a person must rewrite"),
  confidence: z.number().min(0).max(1).describe("How sure you are this is a real violation, 0 to 1"),
});
export const aiResponseSchema = z.object({ findings: z.array(aiFindingSchema).max(12) });
export type AiFinding = z.infer<typeof aiFindingSchema>;

export interface Intent {
  purpose?: string;
  audience?: string;
  mustKeep?: string;
}

const describeRule = (r: Rule) =>
  `${r.code} [${r.checkType}] ${r.title}: ${r.body}\n   good: ${r.goodExamples.join(" | ")}\n   bad: ${r.badExamples.join(" | ")}`;

const describeEvidence = (e: Evidence, today: string) => {
  const state = e.expiresAt === null ? "valid, no expiry" : isExpired(e, today) ? `EXPIRED on ${e.expiresAt}` : `valid until ${e.expiresAt}`;
  const next = e.supersededBy ? ` Replaced by ${e.supersededBy}.` : "";
  return `${e.code} (${state}) "${e.claim}"${e.conditions ? ` Condition: ${e.conditions}` : ""}${next}`;
};

/**
 * The prompt. The model only judges what code can't: tone, scope of certifications,
 * vague green claims, missing offer conditions, competing calls to action. Everything
 * it says still has to pass the Verifier.
 */
export function buildReviewMessages(args: {
  pack: BrandPack;
  draft: string;
  rules: Rule[];
  evidence: Evidence[];
  candidates: ClaimCandidate[];
  codeFindings: Finding[];
  intent?: Intent;
  today: string;
}): ChatMessage[] {
  const { pack, draft, rules, evidence, candidates, codeFindings, intent, today } = args;

  const system = [
    `You are Kasauti, the pre-publication brand reviewer for ${pack.brand.name}. Today is ${today}.`,
    "Review the DRAFT against ONLY the RULES and EVIDENCE given. Do not use outside knowledge about the brand.",
    "Report a finding only when the draft clearly breaks a rule. A clean draft gets an empty list — that is a good answer.",
    "Do NOT report anything listed under ALREADY FOUND, and do not report rules marked [code]; code already checks those.",
    "Rules marked [ai] or [hybrid] are yours to judge.",
    "Each finding must:",
    "- cite exactly one rule code from RULES;",
    "- quote words copied exactly from the DRAFT (same spelling, punctuation and capitals), the shortest span that shows the problem;",
    "- explain in one or two sentences, naming the evidence code when a claim is involved;",
    "- suggest replacement text for the quoted words only, keeping the creator's intent and every MUST KEEP item; use null if a person must rewrite;",
    "- read the sentence with your fix in place: it must read naturally. If it can't, quote the whole clause and rewrite that instead;",
    "- never invent facts: a fix may only use numbers, dates and claims that appear in EVIDENCE or the DRAFT;",
    "- set evidence to a single code like KLE-10, or null — never prose;",
    "- give a confidence from 0 to 1. Use below 0.6 when you are unsure.",
    "Quote the specific offending words (usually under 12 words), never a whole sentence or the whole draft.",
    "Report at most 8 findings. Spend them on what only you can judge, in this order: certification scope, 'award-winning' or green claims,",
    "offers missing their end date or condition, several calls to action, then tone and voice.",
    "Vague rules (like 'keep the tone warm') need a clear, obvious breach before you report them. Short, plain product posts are fine.",
    "Offers (a % off, a sale, free shipping) must state their end date or condition — check the Condition in EVIDENCE.",
    "A list of several different calls to action (shop, follow, refer, download…) breaks the one-CTA rule.",
    "Words like 'favourite' describing the reader's own choice (\"your new favourite set\") are not claims.",
    "'Award-winning' without naming the award and year, and green words like 'eco-friendly' or 'sustainable' on their own, need flagging.",
    "Reply with JSON only.",
  ].join("\n");

  const user = [
    `BRAND VOICE: ${pack.brand.voice.summary}`,
    `INTENT CARD: purpose: ${intent?.purpose || "—"}; audience: ${intent?.audience || "—"}; must keep: ${intent?.mustKeep || "—"}`,
    "",
    "RULES:",
    ...rules.map(describeRule),
    "",
    "EVIDENCE (Claim Ledger):",
    ...(evidence.length ? evidence.map((e) => describeEvidence(e, today)) : ["(none retrieved)"]),
    "",
    "POSSIBLE CLAIMS spotted by code (judge these):",
    ...(candidates.length ? candidates.map((c) => `- ${c.type}: "${c.text}" — ${c.note}`) : ["(none)"]),
    "",
    "ALREADY FOUND by code (do not repeat):",
    ...(codeFindings.length ? codeFindings.map((f) => `- ${f.rule} "${f.quote}"`) : ["(none)"]),
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

/** Reject after `ms` — so one slow model call can't hang the scanner. */
export function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} took longer than ${ms / 1000}s`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

/** How long the reasoning model gets before the fast model's answer is used instead. */
export const REASONING_WAIT_MS = Number(process.env.KASAUTI_REASONING_WAIT_MS) || 5_000;

/**
 * Both models are asked at once. The reasoning model's answer is used if it arrives within
 * REASONING_WAIT_MS; otherwise the fast model's (already on its way) is, so a slow reasoning
 * model costs about five seconds instead of the 25 s it used to.
 */
export async function askReviewer(client: NvidiaClient, messages: ChatMessage[]): Promise<NvidiaResult<AiFinding[]>> {
  const ask = (model: "reasoning" | "fast", ms: number) =>
    withDeadline(
      chatJson(client, messages, aiResponseSchema, { model, fallback: null, schemaName: "kasauti_findings", schemaMode: "prompt", maxTokens: 2000, timeoutMs: ms }),
      ms,
      model,
    );
  const fast = ask("fast", 20_000);
  fast.catch(() => undefined); // handled below if the reasoning model doesn't answer in time
  let res;
  try {
    res = await ask("reasoning", REASONING_WAIT_MS);
  } catch {
    res = await fast;
  }
  return { ...res, data: res.data.findings };
}
