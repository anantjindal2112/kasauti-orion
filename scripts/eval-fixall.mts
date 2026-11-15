/**
 * Does "Accept all fixes" converge? For each showcase example: scan → fix everything (as /api/fixall does)
 * → re-check. Prints what is left after one click, tagged NEW / stays (no fix) / stays (image) etc.
 *   npm run eval:fixall          all three examples
 *   npm run eval:fixall -- S1    one example
 * Needs NVIDIA_API_KEY.
 */
import { loadBrandPack } from "@/lib/brand-pack";
import { getNvidiaClient } from "@/lib/nvidia";
import { reviewDraft } from "@/lib/pipeline";
import { showcaseDrafts } from "@/lib/demo";
import type { Finding } from "@/lib/schemas/finding";
import { planFixAll } from "@/lib/fixes/plan";
import { rewriteDraft } from "@/lib/fixes/rewrite";
import { DEMO_TODAY } from "@/lib/brand-pack";
try { process.loadEnvFile(".env.local"); } catch {}
const pack = loadBrandPack(); const client = getNvidiaClient();
const key = (f: Finding) => `${f.rule}|${f.location}|${f.quote}`;
const ids = process.argv.slice(2);
await Promise.all(showcaseDrafts().filter((x) => !ids.length || ids.includes(x.id)).map(async (d) => {
  const images = d.images.map((i) => ({ file: i.name, alt: i.alt, text: i.demoText }));
  const intent = { purpose: d.intent.purpose, audience: d.intent.audience, mustKeep: d.intent.mustKeep.join(", ") };
  const r1 = await reviewDraft({ text: d.text, images, intent }, pack, { client });
  const issues = r1.findings.filter((f) => f.location === "text");
  const plan = planFixAll(d.text, issues, pack, DEMO_TODAY);
  const rw = await rewriteDraft({ client, pack, draft: d.text, issues, planText: plan.text, intent, today: DEMO_TODAY });
  const next = rw.text;
  const aiSeen = r1.findings.filter((f) => f.source === "ai").map((f) => `${f.rule}|${f.quote}`);
  const accepted = issues.flatMap((f) => (f.suggestedFix && (f.source === "ai" || f.fixBy) ? [f.suggestedFix] : []));
  const r2 = await reviewDraft({ text: next, images, intent }, pack, { client, recheck: { aiSeen, accepted } });
  const first = new Map(r1.findings.map((f) => [key(f), f]));
  const out = [`\n===== ${d.id}: round 1 ${r1.findings.length} findings (${r1.findings.filter((f) => f.fixBy).length} fixes by AI writer: ${JSON.stringify(r1.ai.fixWriter)}), rewrite source: ${rw.source}`, `FIXED: ${next}`];
  for (const f of r2.findings) {
    const was = first.get(key(f));
    const tag = !was ? "NEW" : f.location !== "text" ? `stays (${f.location})` : was.review === "needs_review" ? "stays (for a person)" : was.suggestedFix === null ? "stays (no fix)" : "FIX DIDN'T TAKE";
    out.push(`  [${tag}] ${f.rule} ${f.source}${f.review ? "/" + f.review : ""} "${f.quote}" → ${JSON.stringify(f.suggestedFix)}`);
  }
  out.push(`  round 2 dropped by re-check: ${r2.ai.dropped?.filter((x) => /re-check/.test(x.reason)).map((x) => x.rule).join(", ") || "none"}`);
  console.log(out.join("\n"));
}));
