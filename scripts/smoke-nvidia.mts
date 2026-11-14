/**
 * Live check of every NVIDIA model we use. Needs NVIDIA_API_KEY in .env.local.
 *   npm run smoke:nvidia
 * Prints model, latency and a short result per job. Never prints keys.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  chat,
  chatJson,
  embed,
  getNvidiaClient,
  imageToText,
  MODELS,
  rankBySimilarity,
  safetyCheck,
  toDataUrl,
} from "@/lib/nvidia";
import { maskPII } from "@/lib/privacy/mask";

try {
  process.loadEnvFile(".env.local");
} catch {
  // fall back to the real environment (e.g. CI)
}

const client = getNvidiaClient();
const banner = toDataUrl(readFileSync("testset/images/png/banner-stale-shipping.png"), "image/png");

const jobs: [string, () => Promise<{ modelId: string; latencyMs: number; summary: string }>][] = [
  ["chat (fast)", async () => {
    const r = await chat(client, [{ role: "user", content: "Reply with just: OK" }], { model: "fast" });
    return { ...r, summary: r.data };
  }],
  ["chat (reasoning)", async () => {
    const r = await chat(client, [{ role: "user", content: "Reply with just: OK" }], { model: "reasoning", fallback: null });
    return { ...r, summary: r.data };
  }],
  ["chat (tiny)", async () => {
    const r = await chat(client, [{ role: "user", content: "Reply with just: OK" }], { model: "tiny" });
    return { ...r, summary: r.data };
  }],
  ["JSON output", async () => {
    const r = await chatJson(
      client,
      [{ role: "user", content: `Does the marketing line "India's most trusted bedsheet brand" need evidence?` }],
      z.object({ needsEvidence: z.boolean(), reason: z.string() }),
      { model: "reasoning", schemaName: "claim_check" },
    );
    return { ...r, summary: `needsEvidence=${r.data.needsEvidence}` };
  }],
  ["embeddings", async () => {
    const r = await embed(client, ["Free shipping on orders above ₹1,499."], "passage");
    return { ...r, summary: `${r.data[0].length} dimensions` };
  }],
  ["similarity ranking", async () => {
    const passages = ["GOTS-certified organic cotton.", "Free shipping on orders above ₹1,499.", "Easy returns within 7 days."];
    const r = await rankBySimilarity(client, "free shipping on all orders above ₹999", passages, 1);
    return { ...r, summary: `top: "${passages[r.data[0].index]}" (${r.data[0].score.toFixed(2)})` };
  }],
  ["content safety", async () => {
    const r = await safetyCheck(client, "Our towels are soft and dry fast.");
    return { ...r, summary: r.data.safe ? "safe" : `unsafe: ${r.data.categories.join(", ")}` };
  }],
  ["OCR (vision)", async () => {
    const r = await imageToText(client, banner);
    return { ...r, summary: r.data.replace(/\s+/g, " ") };
  }],
  ["PII masking (code)", async () => {
    const t = Date.now();
    const m = maskPII("Call +91 98765 43210 or mail a@b.co");
    return { modelId: "code", latencyMs: Date.now() - t, summary: m.masked };
  }],
];

console.log(`NVIDIA smoke test — ${client.keyCount} key(s) configured\n`);
let failed = 0;
const results = await Promise.allSettled(jobs.map(([, run]) => run()));
results.forEach((r, i) => {
  const name = jobs[i][0].padEnd(20);
  if (r.status === "fulfilled") {
    console.log(`✅ ${name} ${String(r.value.latencyMs).padStart(6)}ms  ${r.value.modelId.padEnd(46)} ${r.value.summary.slice(0, 70)}`);
  } else {
    failed++;
    console.log(`❌ ${name} ${String(r.reason).slice(0, 160)}`);
  }
});
console.log(`\nConfigured models: ${Object.entries(MODELS).map(([k, v]) => `${k}=${v}`).join(", ")}`);
process.exit(failed ? 1 : 0);
