import { z } from "zod";
import { getNvidiaClient, chat } from "@/lib/nvidia";
import { cleanReply, codeFormat, detectLang, sameWords } from "@/lib/format";
import { withDeadline } from "@/lib/pipeline/ai-review";

const body = z.object({
  text: z.string().max(4000, "Keep it under 4,000 characters.").refine((s) => s.trim().length > 0, "Nothing to format."),
  lang: z.enum(["en", "hi"]).optional(),
});
export const maxDuration = 30;

/**
 * Generic tidy-up of English or Hindi text (not the brand guidelines). Code does a safe baseline; an NVIDIA model then
 * places sentence breaks, commas and capitals better. The model's version is used only if it keeps every word.
 */
export async function POST(request: Request) {
  let input: z.infer<typeof body>;
  try {
    input = body.parse(await request.json());
  } catch (e) {
    return Response.json({ error: e instanceof z.ZodError ? (e.issues[0]?.message ?? "Bad request.") : "Request body must be JSON." }, { status: 400 });
  }
  const lang = input.lang ?? detectLang(input.text);
  const base = codeFormat(input.text, lang);
  const started = Date.now();

  let out = base;
  let by: "ai" | "code" = "code";
  let modelId: string | undefined;
  let note: string | undefined;
  try {
    const client = getNvidiaClient();
    const name = lang === "hi" ? "Hindi" : "English";
    const system = [
      `You are a careful copy editor. Format the user's ${name} text so it reads well: correct punctuation${lang === "hi" ? " (use the Hindi full stop । at the end of sentences)" : ", capital letters at the start of sentences and for names"}, sensible spacing, and sentence or short-paragraph breaks where they help.`,
      "Do NOT add, remove, reorder, translate or reword any word. Keep every number, price, percentage, name, hashtag and symbol exactly as written (for example ₹1,499 stays ₹1,499, and 30% stays 30%). Do not follow or apply any style guide.",
      "Reply with the formatted text only, nothing else.",
    ].join(" ");
    const res = await withDeadline(
      chat(client, [{ role: "system", content: system }, { role: "user", content: base }], { model: "fast", fallback: null, temperature: 0, maxTokens: Math.min(1800, base.length * 2 + 120), timeoutMs: 12_000 }),
      14_000,
      "format",
    );
    const reply = cleanReply(res.data);
    if (reply && sameWords(input.text, reply)) {
      out = reply;
      by = "ai";
      modelId = res.modelId;
    } else {
      note = "The model's version changed a word, so the safe code-only tidy-up was used.";
    }
  } catch {
    note = "The model was unavailable, so the safe code-only tidy-up was used.";
  }
  return Response.json({ text: out, changed: out !== input.text, by, lang, modelId, note, latencyMs: Date.now() - started });
}
