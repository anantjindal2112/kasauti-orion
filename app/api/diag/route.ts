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
  return Response.json({ region: process.env.VERCEL_REGION ?? null, baseUrl, results });
}
