import { describe, expect, it } from "vitest";
import { loadBrandPack } from "@/lib/brand-pack";
import { runCodeChecks } from "@/lib/checks";

/**
 * Every rule shows 3 good and 3 bad examples in the Rulebook. This keeps them honest:
 * for rules code can check on plain text, bad examples must trip the rule and good ones must not.
 */
const pack = loadBrandPack();
const textCheckable = pack.rules.filter((r) => r.layer !== "visual" && r.code !== "KSR-5.1");
const rulesHit = (text: string) => runCodeChecks({ text }, pack).findings.map((f) => f.rule);

describe("rule examples", () => {
  it("every rule has exactly 3 good and 3 bad examples", () => {
    for (const r of pack.rules) {
      expect(r.goodExamples, r.code).toHaveLength(3);
      expect(r.badExamples, r.code).toHaveLength(3);
    }
  });

  for (const r of textCheckable.filter((x) => x.checkType !== "ai")) {
    it(`${r.code} good examples pass its code check`, () => {
      for (const g of r.goodExamples) expect(rulesHit(g), `"${g}"`).not.toContain(r.code);
    });
  }

  for (const r of textCheckable.filter((x) => x.checkType === "code" || ["KSR-4.1", "KSR-4.2"].includes(x.code))) {
    it(`${r.code} bad examples fail its code check`, () => {
      for (const b of r.badExamples) expect(rulesHit(b), `"${b}"`).toContain(r.code);
    });
  }
});
