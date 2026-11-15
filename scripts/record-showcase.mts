/**
 * Records a real scan of each showcase example into lib/scan-fixtures/, so opening an example
 * returns that saved result instantly. Run against a dev server started with KASAUTI_RECORD=1:
 *
 *   KASAUTI_RECORD=1 npm run dev -- -p 3001
 *   npx tsx scripts/record-showcase.mts http://localhost:3001
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { showcaseDrafts } from "../lib/demo";

const base = process.argv[2] ?? "http://localhost:3001";
// Optional third argument: record just one example, e.g. S3.
for (const d of showcaseDrafts().filter((x) => !process.argv[3] || x.id === process.argv[3])) {
  const images = d.images.map((i) => {
    const file = path.join(process.cwd(), "public", i.src.replace(/^\//, ""));
    const dataUrl = `data:image/webp;base64,${readFileSync(file).toString("base64")}`;
    return { name: i.name, alt: i.alt, demoText: i.demoText, dataUrl };
  });
  const t0 = Date.now();
  const res = await fetch(`${base}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: d.text,
      images,
      ocr: true,
      ai: true,
      intent: { purpose: d.intent.purpose, audience: d.intent.audience, mustKeep: d.intent.mustKeep.join(", ") },
    }),
  });
  const json = (await res.json()) as { ai?: { ran?: boolean; error?: string }; findings?: unknown[] };
  console.log(d.id, res.status, `${((Date.now() - t0) / 1000).toFixed(1)}s`, "ai ran:", json.ai?.ran, json.ai?.error ?? "", "findings:", json.findings?.length);
}
