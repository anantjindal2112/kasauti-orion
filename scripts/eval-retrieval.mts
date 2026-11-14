/**
 * Stage 5 check: for 10 test sentences, is the right rule / evidence in the retrieved set?
 *   npm run eval:retrieval        (needs NVIDIA_API_KEY)
 */
import { loadBrandPack } from "@/lib/brand-pack";
import { embed, getNvidiaClient } from "@/lib/nvidia";
import { retrieve } from "@/lib/pipeline/retrieval";

try {
  process.loadEnvFile(".env.local");
} catch {}

const CASES: [string, string][] = [
  ["Free shipping on all orders above ₹999 this festive season.", "KLE-07"],
  ["Every product we make is GOTS-certified organic cotton.", "KLE-03"],
  ["Monsoon Weave is OEKO-TEX Standard 100 certified.", "KLE-04"],
  ["Our eco-friendly towels are good for the planet.", "KSR-4.5"],
  ["Shop now, follow us, refer a friend and download the app!", "KSR-6.1"],
  ["20% off everything!", "KLE-10"],
  ["The Monsoon Weave set is back at just ₹1,799.", "KLE-15"],
  ["Rated 4.6 out of 5 by thousands of happy customers.", "KLE-06"],
  ["Our award-winning sheets.", "KLE-14"],
  ["Purchase our premium bed linen solutions to optimise sleep outcomes.", "KSR-1.1"],
];

const pack = loadBrandPack();
const client = getNvidiaClient();
const embedFn = async (t: string[], type: "query" | "passage") => (await embed(client, t, type)).data;

let hits = 0;
for (const [sentence, want] of CASES) {
  const r = await retrieve([sentence], pack, embedFn, { perQuery: 6 });
  const got = [...r.rules.map((x) => x.code), ...r.evidence.map((x) => x.code)];
  const ok = got.includes(want);
  if (ok) hits++;
  console.log(`${ok ? "✓" : "✗"} ${want.padEnd(8)} ${sentence.slice(0, 60).padEnd(62)} → ${got.slice(0, 6).join(", ")}`);
}
console.log(`\nRetrieval: ${hits}/${CASES.length} sentences got the right rule or proof in the top 6.`);
