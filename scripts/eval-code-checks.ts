/**
 * Score the Stage 4 code checks against the test-set answer keys.
 *   npm run eval:code          summary table
 *   npm run eval:code -- -v    every miss and extra finding
 */
import { loadBrandPack, loadTestSet } from "@/lib/brand-pack";
import { runCodeChecks } from "@/lib/checks";
import { codeResponsibility, scoreDraft } from "@/lib/checks/evaluate";

const verbose = process.argv.includes("-v");
const pack = loadBrandPack();
const drafts = loadTestSet();

let codeExpected = 0, codeHit = 0, allExpected = 0, allHit = 0, extras = 0;
const rows: string[][] = [];

for (const d of drafts) {
  const { findings } = runCodeChecks(
    { text: d.text, images: d.images.map((i) => ({ file: i.file, alt: i.alt, text: i.textInImage })) },
    pack,
  );
  const s = scoreDraft(d, findings);
  const mine = d.expected.filter(codeResponsibility);
  const mineHit = s.hits.filter(codeResponsibility);
  codeExpected += mine.length; codeHit += mineHit.length;
  allExpected += d.expected.length; allHit += s.hits.length;
  extras += s.extras.length;
  rows.push([d.id, `${mineHit.length}/${mine.length}`, `${s.hits.length}/${d.expected.length}`, String(s.extras.length), d.title]);
  if (verbose) {
    for (const m of s.misses) console.log(`  ${d.id} MISS  ${m.rule} "${m.quote}" (${m.detectedBy})`);
    for (const x of s.extras) console.log(`  ${d.id} EXTRA ${x.rule} "${x.quote}" — ${x.explanation}`);
  }
}

console.log("\nDraft  Code   All    Extra  Title");
for (const r of rows) console.log(`${r[0].padEnd(6)} ${r[1].padEnd(6)} ${r[2].padEnd(6)} ${r[3].padEnd(6)} ${r[4]}`);
const pct = (a: number, b: number) => `${b ? Math.round((a / b) * 100) : 100}%`;
console.log(`\nCode-check recall (Stage 4 responsibility): ${codeHit}/${codeExpected} = ${pct(codeHit, codeExpected)}`);
console.log(`Overall recall incl. AI + image items:      ${allHit}/${allExpected} = ${pct(allHit, allExpected)}`);
console.log(`Extra findings (possible false positives):  ${extras}`);
