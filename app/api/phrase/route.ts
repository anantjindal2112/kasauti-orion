import { z } from "zod";
import { connection } from "next/server";
import { DEMO_TODAY, loadBrandPack } from "@/lib/brand-pack";
import { getNvidiaClient } from "@/lib/nvidia";
import { chatJson } from "@/lib/nvidia/chat";
import { translateText } from "@/lib/nvidia/translate";
import { phraseMessages, phraseProblems, usableFacts } from "@/lib/speech/phrase";
import { withDeadline } from "@/lib/pipeline/ai-review";

const body = z.object({
  lang: z.enum(["en", "hi"]).default("en"),
  purpose: z.string().max(300).optional(),
  mustKeep: z.string().max(300).optional(),
});
const reply = z.object({ phrase: z.string() });
export const maxDuration = 40;

const pick = <T,>(xs: T[], n: number) => [...xs].sort(() => Math.random() - 0.5).slice(0, n);

/**
 * A sample line to read aloud, written by NVIDIA from the brand's real facts and then judged by our own rules.
 * It is only returned if it passes every code check, so what comes back from speech-to-text needs almost no fixing.
 */
export async function POST(request: Request) {
  await connection();
  let input: z.infer<typeof body>;
  try {
    input = body.parse(await request.json().catch(() => ({})));
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const pack = loadBrandPack();
  let client: ReturnType<typeof getNvidiaClient>;
  try {
    client = getNvidiaClient();
  } catch {
    return Response.json({ error: "NVIDIA key not configured on the server." }, { status: 503 });
  }

  const facts = pick(usableFacts(pack, DEMO_TODAY), 3);
  let tried: { phrase: string; problems: string[] } | undefined;
  const started = Date.now();
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await withDeadline(
        chatJson(client, phraseMessages({ pack, facts, purpose: input.purpose, mustKeep: input.mustKeep, tried }), reply, {
          model: "fast",
          fallback: null,
          schemaMode: "prompt",
          temperature: 0.9,
          maxTokens: 220,
          timeoutMs: 12_000,
        }),
        14_000,
        "phrase",
      );
      const phrase = res.data.phrase.trim().replace(/^["“]|["”]$/g, "");
      const problems = phraseProblems(phrase, pack, facts, DEMO_TODAY);
      if (problems.length) {
        tried = { phrase, problems };
        continue;
      }
      let spoken = phrase;
      let modelIds = [res.modelId];
      if (input.lang === "hi") {
        const tr = await translateText(client, phrase, "en", "hi", [pack.brand.name, ...pack.brand.products]);
        spoken = tr.text;
        modelIds = [...modelIds, tr.modelId];
      }
      return Response.json({ phrase: spoken, english: input.lang === "hi" ? phrase : null, lang: input.lang, checked: "passed every rule check", attempts: attempt, modelIds, latencyMs: Date.now() - started });
    } catch (e) {
      tried = undefined;
      if (attempt === 5) return Response.json({ error: `Couldn't write a phrase right now (${e instanceof Error ? e.message.slice(0, 80) : "error"}).` }, { status: 502 });
    }
  }
  return Response.json({ error: "Couldn't write a phrase that passes the brand rules. Try again." }, { status: 502 });
}
