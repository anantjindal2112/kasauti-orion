import { z } from "zod";
import { splitSentences } from "@/lib/checks/text";
import { applyFixes } from "@/lib/fixes/apply";
import { chatJson, type ChatMessage } from "@/lib/nvidia/chat";
import type { NvidiaClient } from "@/lib/nvidia/client";
import { withDeadline } from "@/lib/pipeline/ai-review";
import type { Finding, IntentVerdict } from "@/lib/schemas/finding";

export interface IntentCard {
  purpose?: string;
  audience?: string;
  mustKeep?: string;
}

/** "urgency, the 20% offer; free shipping" → three items. */
export function parseMustKeep(s?: string): string[] {
  return [...new Set((s ?? "").split(/[,;\n]+/).map((x) => x.trim()).filter((x) => x.length > 0 && x.length <= 60))].slice(0, 8);
}

export const hasIntent = (i?: IntentCard) => !!(i?.purpose?.trim() || i?.audience?.trim() || parseMustKeep(i?.mustKeep).length);

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}₹%]+/gu, " ").trim();
const contains = (hay: string, needle: string) => ` ${norm(hay)} `.includes(` ${norm(needle)} `);

const llmSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.string(),
        ok: z.boolean().describe("false only if the fix loses or weakens the purpose, the audience tone or a MUST KEEP item"),
        kept: z.array(z.string()).describe("MUST KEEP items, copied word for word from the list, that the AFTER sentence still carries"),
        changed: z.array(z.string()).describe("up to 2 short phrases (max 6 words) for what the fix gives up that the creator might care about; empty if nothing"),
        note: z.string().describe("one short sentence"),
      }),
    )
    .max(24),
});

interface Candidate {
  id: string;
  before: string;
  after: string;
  quote: string;
  lost: string[];
  present: string[];
  /** The fix replaces a fact the Claim Ledger contradicts with the proven one: always required, never "weakening". */
  correction: string | null;
  /** The fix lowers a percentage offer ("30% → 20%"); code sees this, so the model's opinion cannot wave it through. */
  lowered: string | null;
}

const percents = (t: string) => [...t.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));

/** The sentence a finding sits in, before and after its suggested fix. */
function candidatesFor(draft: string, findings: Finding[], mustKeep: string[]): Candidate[] {
  const sentences = splitSentences(draft);
  const out: Candidate[] = [];
  for (const f of findings) {
    if (f.location !== "text" || f.suggestedFix === null) continue;
    const s = sentences.find((x) => f.span.start >= x.start && f.span.start < x.end);
    if (!s) continue;
    const rel = { start: f.span.start - s.start, end: Math.min(f.span.end, s.end) - s.start };
    const before = s.text;
    const after = applyFixes(before, [{ ...rel, replacement: f.suggestedFix }]);
    // Code wins on what it can see: a MUST KEEP phrase that is in the sentence and gone after the fix is lost.
    const lost = mustKeep.filter((m) => contains(before, m) && !contains(after, m));
    const present = mustKeep.filter((m) => contains(before, m) && contains(after, m));
    const b = percents(before);
    const a = percents(after);
    const correction = f.evidence && /^KSR-4\.[123]$/.test(f.rule) ? f.evidence : null;
    // A discount that drops because the ledger says so is a correction; any other drop is the creator's call.
    const lowered = !correction && b.length && a.length && Math.max(...a) < Math.max(...b) ? `${Math.max(...b)}% → ${Math.max(...a)}%` : null;
    out.push({ id: f.id, before, after, quote: f.quote, lost, present, lowered, correction });
    if (out.length >= 20) break;
  }
  return out;
}

function messagesFor(intent: IntentCard, mustKeep: string[], items: Candidate[]): ChatMessage[] {
  const system = [
    "You are the Intent Check for a brand-review tool. A reviewer wants to replace some words in a draft (a FIX).",
    "For each fix, decide whether the AFTER sentence still carries the creator's INTENT CARD: the purpose, the audience tone and every MUST KEEP item.",
    "Fixing a rule break always changes the quoted words; that alone is not a problem. Set ok=false only when the fix removes or clearly weakens the purpose, the tone for the audience, or a MUST KEEP item.",
    "Urgency, a named offer, or a promise counts as kept if the AFTER sentence still conveys it in other words.",
    "KIND=correction means the Claim Ledger proves the QUOTE wrong and the fix writes the proven fact. A correction is required, so never flag it for 'weakening' the message; flag it only if it removes a MUST KEEP phrase.",
    "Terminology and formatting fixes (brand or product name, price format, a banned word, capital letters, punctuation) are almost never a problem.",
    "kept: MUST KEEP items copied word for word from the list. changed: up to 2 short phrases for what the fix gives up. Be brief. Reply with JSON only.",
  ].join("\n");
  const user = [
    `INTENT CARD: purpose: ${intent.purpose?.trim() || "—"}; audience: ${intent.audience?.trim() || "—"}`,
    `MUST KEEP: ${mustKeep.length ? mustKeep.map((m) => `"${m}"`).join(", ") : "(none given)"}`,
    "",
    ...items.map((c) => `FIX id=${c.id} KIND=${c.correction ? `correction (proven by ${c.correction})` : "wording"}\n  QUOTE: ${JSON.stringify(c.quote)}\n  BEFORE: ${JSON.stringify(c.before)}\n  AFTER: ${JSON.stringify(c.after)}`),
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export interface IntentResult {
  verdicts: Map<string, IntentVerdict>;
  meta: { ran: boolean; codeOnly: boolean; checked: number; flagged: number; modelId?: string; latencyMs?: number; error?: string };
}

/**
 * Intent Lock: every suggested fix is tested against the Intent Card. Code checks what it can see (a MUST KEEP phrase
 * that disappears), a model judges the rest (tone, urgency in other words). A fix that fails is flagged for a person;
 * the creator can still accept it, and that choice is theirs.
 */
export async function checkIntent(args: { client: NvidiaClient; draft: string; findings: Finding[]; intent: IntentCard }): Promise<IntentResult> {
  const { client, draft, findings, intent } = args;
  const mustKeep = parseMustKeep(intent.mustKeep);
  const items = candidatesFor(draft, findings, mustKeep);
  const verdicts = new Map<string, IntentVerdict>();
  if (!items.length) return { verdicts, meta: { ran: false, codeOnly: false, checked: 0, flagged: 0 } };

  const codeNote = (c: Candidate) =>
    [c.lost.length ? `The fix removes “${c.lost.join("”, “")}”.` : "", c.lowered ? `The fix lowers the discount (${c.lowered}).` : ""].filter(Boolean).join(" ");
  const fromCode = (c: Candidate): IntentVerdict => ({
    ok: c.lost.length === 0 && !c.lowered,
    kept: c.present,
    changed: [...c.lost, ...(c.lowered ? [c.lowered] : [])],
    note: codeNote(c) || undefined,
    by: "code",
  });

  const started = Date.now();
  try {
    const res = await withDeadline(
      chatJson(client, messagesFor(intent, mustKeep, items), llmSchema, { model: "fast", fallback: null, schemaMode: "prompt", maxTokens: 1800, timeoutMs: 14_000 }),
      15_000,
      "intent check",
    );
    const byId = new Map(res.data.results.map((r) => [r.id, r]));
    for (const c of items) {
      const r = byId.get(c.id);
      if (!r) {
        verdicts.set(c.id, fromCode(c));
        continue;
      }
      const keptByModel = r.kept.filter((k) => mustKeep.some((m) => norm(m) === norm(k))).map((k) => mustKeep.find((m) => norm(m) === norm(k))!);
      const kept = [...new Set([...c.present, ...keptByModel])].filter((k) => !c.lost.includes(k));
      if (c.correction && c.lost.length === 0) {
        // The ledger proves the original wrong, so the fix is required. Code decides this; a model's "weakens the message" cannot overrule proof.
        verdicts.set(c.id, { ok: true, kept, changed: [], note: `A correction: ${c.correction} proves the original wrong.`, by: "code" });
        continue;
      }
      const changed = [...new Set([...c.lost, ...(c.lowered ? [c.lowered] : []), ...r.changed.map((x) => x.trim()).filter(Boolean)])].slice(0, 3);
      const byCode = c.lost.length > 0 || !!c.lowered;
      verdicts.set(c.id, {
        ok: r.ok && !byCode,
        kept,
        changed,
        note: byCode ? codeNote(c) : r.note.slice(0, 160),
        by: byCode ? "code" : "ai",
      });
    }
    return { verdicts, meta: { ran: true, codeOnly: false, checked: items.length, flagged: [...verdicts.values()].filter((v) => !v.ok).length, modelId: res.modelId, latencyMs: Date.now() - started } };
  } catch (e) {
    for (const c of items) verdicts.set(c.id, fromCode(c));
    return {
      verdicts,
      meta: {
        ran: false,
        codeOnly: true,
        checked: items.length,
        flagged: [...verdicts.values()].filter((v) => !v.ok).length,
        latencyMs: Date.now() - started,
        error: `Intent Check by the AI was unavailable (${e instanceof Error ? e.message.slice(0, 80) : "error"}); only the code check ran.`,
      },
    };
  }
}
