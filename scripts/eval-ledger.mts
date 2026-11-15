/**
 * Live check of the Claim Ledger (Stage 7): code statuses + the NVIDIA ledger pass, on the test set.
 *   npm run eval:ledger        expected-status checks + summary
 *   npm run eval:ledger -- -v  every claim in every draft
 * Needs NVIDIA_API_KEY (without it, only the code half runs and AI-only checks fail).
 */
import { loadBrandPack, loadTestSet } from "@/lib/brand-pack";
import { getNvidiaClient } from "@/lib/nvidia";
import { reviewDraft } from "@/lib/pipeline";
import type { ClaimStatus } from "@/lib/schemas/claim";

try {
  process.loadEnvFile(".env.local");
} catch {}

const verbose = process.argv.includes("-v");
const pack = loadBrandPack();
const drafts = loadTestSet();
let client = null;
try {
  client = getNvidiaClient();
} catch {
  console.log("No NVIDIA key — code half only.");
}

/** What the ledger must say. `text` is matched as a substring of the claim. */
const EXPECT: { id: string; text: string; status: ClaimStatus | "absent" }[] = [
  { id: "D01", text: "₹999", status: "stale" },
  { id: "D02", text: "#1", status: "no_evidence" },
  { id: "D02", text: "20%", status: "verified" },
  { id: "D03", text: "most trusted", status: "no_evidence" },
  { id: "D03", text: "Varanasi and Panipat", status: "verified" },
  { id: "D03", text: "favourite", status: "absent" },
  { id: "D04", text: "OEKO-TEX", status: "stale" },
  { id: "D05", text: "₹1,799", status: "stale" },
  { id: "D06", text: "GOTS", status: "no_evidence" },
  { id: "D10", text: "eco-friendly", status: "no_evidence" },
  { id: "D11", text: "award-winning", status: "no_evidence" },
  { id: "D11", text: "best", status: "no_evidence" },
  { id: "D13", text: "GOTS", status: "verified" },
  { id: "D16", text: "₹999", status: "stale" },
  { id: "D17", text: "₹1,499", status: "verified" },
  { id: "D18", text: "4.6 out of 5", status: "verified" },
  { id: "D18", text: "azo-free", status: "verified" },
];

const results = [];
for (let i = 0; i < drafts.length; i += 3) {
  const batch = drafts.slice(i, i + 3);
  results.push(
    ...(await Promise.all(
      batch.map(async (d) => ({
        d,
        r: await reviewDraft(
          { text: d.text, images: d.images.map((im) => ({ file: im.file, alt: im.alt, text: im.textInImage })) },
          pack,
          { client },
        ),
      })),
    )),
  );
}

let pass = 0;
for (const e of EXPECT) {
  const { r } = results.find((x) => x.d.id === e.id)!;
  const c = r.claims.find((x) => x.text.toLowerCase().includes(e.text.toLowerCase()) || e.text.toLowerCase().includes(x.text.toLowerCase()));
  const got = c ? c.status : "absent";
  const ok = got === e.status;
  if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${e.id}  "${e.text}" → ${got}${ok ? "" : ` (want ${e.status})`}${c?.source === "ai" ? " [ai]" : ""}`);
}

const all = results.flatMap((x) => x.r.claims);
const unverifiedOnClean = results
  .filter((x) => x.d.expected.length === 0)
  .flatMap((x) => x.r.claims.filter((c) => c.status !== "verified").map((c) => `${x.d.id} "${c.text}" ${c.status}`));
const ledgerRuns = results.map((x) => x.r.ai.ledger).filter(Boolean);
const lat = ledgerRuns.filter((l) => l!.ran).map((l) => l!.latencyMs!);

if (verbose) {
  for (const { d, r } of results) {
    console.log(`\n${d.id} ${d.title}`);
    for (const c of r.claims) console.log(`  ${c.status.padEnd(12)} ${c.source.padEnd(4)} ${c.kind.padEnd(13)} "${c.text}"${c.evidence ? ` ${c.evidence}` : ""} — ${c.note.slice(0, 90)}`);
    for (const x of r.ai.ledger?.dropped ?? []) console.log(`  DROPPED "${x.quote}" — ${x.reason}`);
    if (r.ai.ledger && !r.ai.ledger.ran) console.log(`  ledger AI off: ${r.ai.ledger.error}`);
  }
}

console.log(`\nExpected statuses: ${pass}/${EXPECT.length}`);
console.log(`Claims: ${all.length} total · ${all.filter((c) => c.source === "ai").length} found by AI · ${all.filter((c) => c.status === "unchecked").length} left unchecked`);
console.log(`Clean drafts with a non-verified claim: ${unverifiedOnClean.length ? unverifiedOnClean.join("; ") : "none"}`);
console.log(`Ledger AI pass: ${lat.length}/${results.length} ran${lat.length ? `, median ${lat.sort((a, b) => a - b)[Math.floor(lat.length / 2)]} ms` : ""}`);
