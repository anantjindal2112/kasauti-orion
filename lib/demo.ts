import { isExpired, loadBrandPack, loadTestSet } from "@/lib/brand-pack";
import type { DemoDraft, EvidenceInfo, RuleInfo } from "@/lib/scan-types";

/** testset/images/foo.svg → /testset/foo.png (rasterised copy in public/) */
export const publicImage = (file: string) => `/testset/${file.split("/").at(-1)!.replace(/\.svg$/, ".png")}`;

/** Test-set drafts in a browser-friendly shape for the scanner's "load a demo" picker. */
export function demoDrafts(): DemoDraft[] {
  return loadTestSet().map((d) => ({
    id: d.id,
    title: d.title,
    channel: d.channel,
    author: d.author,
    text: d.text,
    intent: d.intent,
    images: d.images.map((i) => ({
      name: i.file.split("/").at(-1)!.replace(/\.svg$/, ".png"),
      src: publicImage(i.file),
      alt: i.alt,
      demoText: i.textInImage,
    })),
    expectedCount: d.expected.length,
  }));
}

export function ruleIndex(): Record<string, RuleInfo> {
  return Object.fromEntries(
    loadBrandPack().rules.map((r) => [r.code, { code: r.code, title: r.title, layer: r.layer, checkType: r.checkType }]),
  );
}

export function evidenceIndex(): Record<string, EvidenceInfo> {
  return Object.fromEntries(
    loadBrandPack().evidence.map((e) => [
      e.code,
      { code: e.code, title: e.title, claim: e.claim, source: e.source, expiresAt: e.expiresAt, expired: isExpired(e) },
    ]),
  );
}

export const formatDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
