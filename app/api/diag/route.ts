import { connection } from "next/server";
import { parseNvidiaEnv } from "@/lib/env";

/** Temporary: checks every configured NVIDIA key from the server (never returns key values). */
export async function GET() {
  await connection();
  const { apiKeys, baseUrl } = parseNvidiaEnv();
  const results = await Promise.all(
    apiKeys.map(async (k, i) => {
      const t0 = Date.now();
      try {
        const r = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "nvidia/nemotron-3.5-lightning-30b-a3b", messages: [{ role: "user", content: "Say ok" }], max_tokens: 5 }),
          signal: AbortSignal.timeout(20_000),
        });
        return { key: i + 1, length: k.length, hasSpace: /\s/.test(k), status: r.status, ms: Date.now() - t0 };
      } catch (e) {
        return { key: i + 1, length: k.length, hasSpace: /\s/.test(k), error: e instanceof Error ? e.message.slice(0, 80) : "error", ms: Date.now() - t0 };
      }
    }),
  );
  // One call per model with the first key, to see which model is slow from this region.
  const k = apiKeys[0];
  const call = async (label: string, path: string, body: unknown) => {
    const t0 = Date.now();
    try {
      const r = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(40_000) });
      return { label, status: r.status, ms: Date.now() - t0 };
    } catch (e) {
      return { label, error: e instanceof Error ? e.message.slice(0, 60) : "error", ms: Date.now() - t0 };
    }
  };
  const chat = (model: string) => call(model, "/chat/completions", { model, messages: [{ role: "user", content: "Say ok" }], max_tokens: 5 });
  const models = await Promise.all([
    call("embed", "/embeddings", { model: "nvidia/nemotron-3.5-embed-1b", input: ["hello world"], input_type: "query", encoding_format: "float", dimensions: 1024 }),
    chat("nvidia/nemotron-3-ultra-550b-a55b"),
    chat("nvidia/llama-3.1-nemotron-safety-guard-8b-v3"),
  ]);
  return Response.json({ models, region: process.env.VERCEL_REGION ?? null, baseUrl, results });
}
