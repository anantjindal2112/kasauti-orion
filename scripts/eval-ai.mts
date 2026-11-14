/**
 * Live score of the FULL pipeline (code checks + NVIDIA AI review + Verifier) on the test set.
 *   npm run eval:ai          summary
 *   npm run eval:ai -- -v    every miss, extra and dropped finding
 * Needs NVIDIA_API_KEY. Image-only items (logo, contrast) belong to Stage 11 and are reported separately.
 */
import { loadBrandPack, loadTestSet } from "@/lib/brand-pack";
import { getNvidiaClient } from "@/lib/nvidia";
import { reviewDraft } from "@/lib/pipeline";
import { needsImageAnalysis, scoreDraft } from "@/lib/checks/evaluate";

try {
  process.loadEnvFile(".env.local");
} catch {}

const verbose = process.argv.includes("-v");
const pack = loadBrandPack();
const drafts = loadTestSet();
const client = getNvidiaClient();

const results = [];
for (let i = 0; i < drafts.length; i += 3) {
  const batch = drafts.slice(i, i + 3);
  results.push(
    ...(await Promise.all(
      batch.map(async (d) => {
        const r = await reviewDraft(
          {
            text: d.text,
            images: d.images.map((im) => ({ file: im.file, alt: im.alt, text: im.textInImage })),
            intent: { purpose: d.intent.purpose, audience: d.intent.audience, mustKeep: d.intent.mustKeep.join(", ") },
          },
          pack,
          { client },
        );
        return { d, r, s: scoreDraft(d, r.findings) };
      }),
    )),
  );
}

let textExpected = 0, textHit = 0, aiExpected = 0, aiHit = 0, extras = 0, extrasVerified = 0, needsReview = 0, dropped = 0, failures = 0;
console.log("\nDraft  Hit    Extra  AI-ms   Title");
for (const { d, r, s } of results) {
  const scoreable = d.expected.filter((e) => !needsImageAnalysis(e));
  const hits = s.hits.filter((e) => !needsImageAnalysis(e));
  textExpected += scoreable.length; textHit += hits.length;
  aiExpected += scoreable.filter((e) => e.detectedBy === "ai").length;
  aiHit += hits.filter((e) => e.detectedBy === "ai").length;
  extras += s.extras.length;
  extrasVerified += s.extras.filter((x) => x.review !== "needs_review").length;
  needsReview += r.findings.filter((f) => f.review === "needs_review").length;
  dropped += r.ai.dropped?.length ?? 0;
  if (!r.ai.ran) failures++;
  console.log(`${d.id.padEnd(6)} ${`${hits.length}/${scoreable.length}`.padEnd(6)} ${String(s.extras.length).padEnd(6)} ${String(r.ai.latencyMs ?? "-").padEnd(7)} ${d.title}${r.ai.ran ? "" : `  [AI: ${r.ai.error}]`}`);
  if (verbose) {
    for (const m of s.misses.filter((e) => !needsImageAnalysis(e))) console.log(`   MISS  ${m.rule} "${m.quote}" (${m.detectedBy})`);
    for (const x of s.extras) console.log(`   EXTRA ${x.source} ${x.rule} "${x.quote}" ${x.review ?? ""} — ${x.explanation}`);
    for (const x of r.ai.dropped ?? []) console.log(`   DROP  ${x.rule} "${x.quote}" — ${x.reason}`);
  }
}
const pct = (a: number, b: number) => `${b ? Math.round((a / b) * 100) : 100}%`;
console.log(`\nAll text items (code + AI):  ${textHit}/${textExpected} = ${pct(textHit, textExpected)}`);
console.log(`AI-judgement items:          ${aiHit}/${aiExpected} = ${pct(aiHit, aiExpected)}`);
console.log(`Extra findings:              ${extras}  → shown as verified: ${extrasVerified}, sent to a human: ${extras - extrasVerified}`);
console.log(`Needs-review findings total: ${needsReview} · dropped by the Verifier: ${dropped}`);
console.log(`AI runs that fell back:      ${failures}`);
