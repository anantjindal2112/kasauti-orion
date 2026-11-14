import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_TODAY, isExpired, loadBrandPack, loadTestSet } from "@/lib/brand-pack";
import { contrastRatio, passesAA } from "@/lib/checks/contrast";

const root = resolve(__dirname, "..");
const pack = loadBrandPack();
const drafts = loadTestSet();
const ruleCodes = new Set(pack.rules.map((r) => r.code));
const evidenceByCode = new Map(pack.evidence.map((e) => [e.code, e]));

describe("brand pack", () => {
  it("parses every file against its schema", () => {
    expect(pack.brand.fictional).toBe(true);
    expect(pack.rules.length).toBeGreaterThanOrEqual(20);
    expect(pack.evidence.length).toBeGreaterThanOrEqual(15);
  });

  it("has unique rule and evidence codes", () => {
    expect(ruleCodes.size).toBe(pack.rules.length);
    expect(evidenceByCode.size).toBe(pack.evidence.length);
  });

  it("includes the rule codes the deck demos use", () => {
    for (const code of ["KSR-1.2", "KSR-1.3", "KSR-2.6", "KSR-3.1", "KSR-4.2"]) {
      expect(ruleCodes.has(code)).toBe(true);
    }
  });

  it("covers every layer", () => {
    const layers = new Set(pack.rules.map((r) => r.layer));
    expect([...layers].sort()).toEqual(["accessibility", "claims", "messaging", "terminology", "visual", "voice"]);
  });

  it("seeds some deliberately unclear rules for the Radar", () => {
    expect(pack.rules.filter((r) => r.knownUnclear).map((r) => r.code)).toEqual(["KSR-1.2", "KSR-3.1"]);
  });

  it("has 3+ expired evidence entries on the demo date, and KLE-12 is valid", () => {
    const expired = pack.evidence.filter((e) => isExpired(e)).map((e) => e.code);
    expect(expired.length).toBeGreaterThanOrEqual(3);
    expect(expired).toEqual(expect.arrayContaining(["KLE-04", "KLE-07", "KLE-15"]));
    expect(isExpired(evidenceByCode.get("KLE-12")!)).toBe(false);
  });

  it("points supersededBy at a real, still-valid entry", () => {
    for (const e of pack.evidence.filter((x) => x.supersededBy)) {
      const next = evidenceByCode.get(e.supersededBy!);
      expect(next, `${e.code} → ${e.supersededBy}`).toBeDefined();
      expect(isExpired(e)).toBe(true);
      expect(isExpired(next!)).toBe(false);
    }
  });

  it("has verifiedAt on or before the demo date and before expiry", () => {
    for (const e of pack.evidence) {
      expect(e.verifiedAt <= DEMO_TODAY, e.code).toBe(true);
      if (e.expiresAt) expect(e.verifiedAt < e.expiresAt, e.code).toBe(true);
    }
  });

  it("only references real rules from the terms list", () => {
    for (const t of [...pack.terms.banned, ...pack.terms.replace]) {
      expect(ruleCodes.has(t.rule), t.term).toBe(true);
    }
  });

  it("has exactly one current logo and the logo files exist", () => {
    expect(pack.assets.logos.filter((l) => l.status === "current")).toHaveLength(1);
    for (const l of pack.assets.logos) expect(existsSync(resolve(root, l.file)), l.file).toBe(true);
  });

  it("palette matches the contrast examples written in KSR-3.4", () => {
    const hex = Object.fromEntries(pack.assets.palette.map((p) => [p.name, p.hex]));
    expect(passesAA(hex.Charcoal, hex.Cotton)).toBe(true);
    expect(contrastRatio(hex.Charcoal, hex.Cotton)).toBeGreaterThan(12);
    expect(passesAA(hex.Kesar, hex.Cotton, true)).toBe(false);
    expect(contrastRatio(hex.Kesar, hex.Cotton)).toBeLessThan(2.5);
  });
});

describe("test set", () => {
  it("has unique draft IDs and 15+ drafts", () => {
    expect(new Set(drafts.map((d) => d.id)).size).toBe(drafts.length);
    expect(drafts.length).toBeGreaterThanOrEqual(15);
  });

  it("only expects real rules and evidence", () => {
    for (const d of drafts) {
      for (const f of d.expected) {
        expect(ruleCodes.has(f.rule), `${d.id} ${f.rule}`).toBe(true);
        if (f.evidence) expect(evidenceByCode.has(f.evidence), `${d.id} ${f.evidence}`).toBe(true);
      }
    }
  });

  it("has every expected quote present character for character", () => {
    for (const d of drafts) {
      for (const f of d.expected) {
        const haystack =
          f.location === "text"
            ? d.text
            : f.location === "image"
              ? d.images.map((i) => i.textInImage ?? "").join("\n")
              : d.images.filter((i) => !i.alt).map((i) => i.file).join("\n");
        expect(haystack.includes(f.quote), `${d.id}: "${f.quote}" not found in ${f.location}`).toBe(true);
      }
    }
  });

  it("covers all four failure types from the deck, plus clean drafts", () => {
    const kinds = new Set(drafts.flatMap((d) => d.expected.map((f) => f.kind)));
    for (const k of ["unsupported_claim", "stale_fact", "voice_drift", "off_brand_visual"] as const) {
      expect(kinds.has(k), k).toBe(true);
    }
    expect(drafts.filter((d) => d.expected.length === 0).length).toBeGreaterThanOrEqual(2);
  });

  it("references image files that exist", () => {
    for (const d of drafts) for (const i of d.images) expect(existsSync(resolve(root, i.file)), i.file).toBe(true);
  });
});
