import { describe, expect, it } from "vitest";
import { loadBrandPack, loadTestSet } from "@/lib/brand-pack";
import { runCodeChecks } from "@/lib/checks";
import { codeResponsibility, scoreDraft } from "@/lib/checks/evaluate";
import { fleschKincaidGrade, syllables } from "@/lib/checks/readability";
import { findTerm, formatInr, mergeAdjacent, splitSentences } from "@/lib/checks/text";
import { findingSchema } from "@/lib/schemas/finding";

const pack = loadBrandPack();
const run = (text: string, images?: Parameters<typeof runCodeChecks>[0]["images"]) =>
  runCodeChecks({ text, images }, pack);
const rules = (text: string) => run(text).findings.map((f) => f.rule);
const only = (text: string, rule: string) => run(text).findings.filter((f) => f.rule === rule);

describe("text helpers", () => {
  it("findTerm respects word boundaries only where the term has word characters", () => {
    expect(findTerm("bestseller", "best")).toHaveLength(0);
    expect(findTerm("the best one", "best")).toHaveLength(1);
    expect(findTerm("Our #1 pick", "#1")).toHaveLength(1);
    expect(findTerm("Indigo Hours", "Indigo Hour", { caseSensitive: true })).toHaveLength(0);
  });

  it("findTerm treats curly and straight apostrophes the same and keeps original text", () => {
    const [m] = findTerm("Don’t miss out", "don't miss out");
    expect(m.text).toBe("Don’t miss out");
  });

  it("splitSentences does not split on 'Co.' or 'Rs.'", () => {
    const s = splitSentences("Dhaaga & Co. is here. Now Rs. 999 only!");
    expect(s.map((x) => x.text)).toEqual(["Dhaaga & Co. is here.", "Now Rs. 999 only!"]);
  });

  it("mergeAdjacent joins whitespace-separated matches only", () => {
    const text = "HUGE NEWS, BIG deal";
    const merged = mergeAdjacent(text, [
      { start: 0, end: 4, text: "HUGE" },
      { start: 5, end: 9, text: "NEWS" },
      { start: 11, end: 14, text: "BIG" },
    ]);
    expect(merged.map((m) => m.text)).toEqual(["HUGE NEWS", "BIG"]);
  });

  it("formatInr uses Indian grouping", () => {
    expect(formatInr(1499)).toBe("₹1,499");
    expect(formatInr(150000)).toBe("₹1,50,000");
  });
});

describe("voice checks", () => {
  it("KSR-1.3 flags stacked marks, or extra single marks over the limit", () => {
    expect(only("Wow!!", "KSR-1.3").map((f) => f.quote)).toEqual(["!!"]);
    expect(only("New in! Shop now! Today!", "KSR-1.3")).toHaveLength(2);
    expect(only("Our sale starts today!", "KSR-1.3")).toHaveLength(0);
  });

  it("KSR-1.4 ignores approved acronyms and hashtags, merges runs, suggests sentence case", () => {
    expect(only("Now GOTS and OEKO-TEX approved, pay by UPI.", "KSR-1.4")).toHaveLength(0);
    const [f] = only("BIG SALE today", "KSR-1.4");
    expect(f.quote).toBe("BIG SALE");
    expect(f.suggestedFix).toBe("Big sale");
  });

  it("KSR-1.5 flags only emoji past the limit and keeps the allowed ones in the fix", () => {
    expect(only("Hello 🌿 there ✨", "KSR-1.5")).toHaveLength(0);
    const [f] = only("Sale 🔥🎉🛍️", "KSR-1.5");
    expect(f.quote).toBe("🔥🎉🛍️");
    expect(f.suggestedFix).toBe("🔥🎉");
  });

  it("KSR-1.6 flags pressure phrases", () => {
    expect(only("What are you waiting for? Buy now.", "KSR-1.6")).toHaveLength(1);
  });
});

describe("terminology checks", () => {
  it("KSR-2.1 catches misspellings and a missing full stop", () => {
    expect(only("Love from Dhaga & Co.", "KSR-2.1")[0].quote).toBe("Dhaga & Co");
    expect(only("Dhaaga & Co sheets are soft.", "KSR-2.1")[0].quote).toBe("Dhaaga & Co");
    expect(only("Made by Dhaaga & Co.", "KSR-2.1")).toHaveLength(0);
  });

  it("KSR-2.2 replaces with matching case", () => {
    const [f] = only("Workers in Panipat weave it.", "KSR-2.2");
    expect(f.suggestedFix).toBe("Artisans");
  });

  it("KSR-2.5 formats prices, and leaves correct ones alone", () => {
    expect(only("Only INR 2299", "KSR-2.5")[0].suggestedFix).toBe("₹2,299");
    expect(only("Only ₹1999", "KSR-2.5")[0].suggestedFix).toBe("₹1,999");
    expect(only("Only ₹1,999", "KSR-2.5")).toHaveLength(0);
  });

  it("KSR-2.6 catches wrong product names but not the right one", () => {
    expect(only("Meet the Kesar Collections.", "KSR-2.6")[0].suggestedFix).toBe("Kesar Collection");
    expect(only("Meet the Kesar Collection.", "KSR-2.6")).toHaveLength(0);
  });

  it("KSR-6.3 flags competitors in any case", () => {
    expect(only("better than weavewala", "KSR-6.3")).toHaveLength(1);
  });

  it("KSR-5.2 flags vague link text", () => {
    expect(only("Link in bio for more.", "KSR-5.2")).toHaveLength(1);
  });
});

describe("claim checks", () => {
  it("KSR-4.2 flags superlatives, but allows the exact phrase a live ledger entry backs", () => {
    expect(only("The best towels you'll own.", "KSR-4.2")).toHaveLength(1);
    expect(only("Winner, Best D2C Home Brand at the Demo Retail Awards 2024.", "KSR-4.2")).toHaveLength(0);
  });

  it("KSR-4.4 prefers the longest absolute phrase", () => {
    expect(only("It's guaranteed.", "KSR-4.4").map((f) => f.quote)).toEqual(["guaranteed"]);
  });

  it("KSR-4.1 flags a superseded price and suggests the live one with its source", () => {
    const [f] = only("Now just ₹1,799!", "KSR-4.1");
    expect(f.evidence).toBe("KLE-15");
    expect(f.suggestedFix).toBe("₹1,999");
    expect(f.explanation).toContain("KLE-16");
  });

  it("KSR-4.1 passes live prices and leaves unknown prices to the candidate list", () => {
    const r = run("Indigo Hours, ₹2,299. Towels from ₹649.");
    expect(r.findings.filter((f) => f.rule === "KSR-4.1")).toHaveLength(0);
    const prices = r.candidates.filter((c) => c.type === "price");
    expect(prices.find((c) => c.text === "₹2,299")?.evidence).toEqual(["KLE-11"]);
    expect(prices.find((c) => c.text === "₹649")?.evidence).toEqual([]);
  });

  it("KSR-4.1 respects the date: after expiry a live price becomes stale", () => {
    const later = runCodeChecks({ text: "Indigo Hours, ₹2,299." }, pack, { today: "2027-02-01" });
    expect(later.findings.map((f) => f.rule)).toContain("KSR-4.1");
  });

  it("KSR-4.3 flags expired certificates; live ones become scope candidates", () => {
    expect(only("Certified OEKO-TEX.", "KSR-4.3")[0].evidence).toBe("KLE-04");
    const r = run("GOTS-certified towels.");
    expect(r.findings.filter((f) => f.rule === "KSR-4.3")).toHaveLength(0);
    expect(r.candidates.find((c) => c.type === "certification")?.evidence).toEqual(["KLE-03"]);
  });
});

describe("accessibility checks", () => {
  it("KSR-5.1 flags missing and filename alt text", () => {
    const r = run("Hi.", [
      { file: "a.png", alt: null },
      { file: "b.png", alt: "IMG_2041.jpg" },
      { file: "c.png", alt: "Folded indigo bedsheet on a bench" },
    ]);
    expect(r.findings.filter((f) => f.rule === "KSR-5.1").map((f) => f.quote)).toEqual(["a.png", "b.png"]);
  });

  it("KSR-5.3 flags long lowercase hashtags and fixes product names", () => {
    const f = only("#monsoonweave #sale #FestiveSale", "KSR-5.3");
    expect(f.map((x) => x.quote)).toEqual(["#monsoonweave"]);
    expect(f[0].suggestedFix).toBe("#MonsoonWeave");
    expect(f[0].confidence).toBeLessThan(1);
  });
});

describe("readability", () => {
  it("counts syllables roughly", () => {
    expect(syllables("cotton")).toBe(2);
    expect(syllables("woven")).toBe(2);
    expect(syllables("make")).toBe(1);
  });

  it("scores plain copy low and jargon high", () => {
    expect(fleschKincaidGrade("Soft cotton. Woven by hand. Gets softer with every wash.")).toBeLessThan(6);
    expect(rules("Our meticulously engineered, artisanally conceptualised textile innovations deliver unparalleled tactile sophistication to discerning households.")).toContain("KSR-2.4");
  });
});

describe("runner", () => {
  it("returns findings that satisfy the schema, with quotes matching their spans", () => {
    for (const d of loadTestSet()) {
      const { findings } = runCodeChecks(
        { text: d.text, images: d.images.map((i) => ({ file: i.file, alt: i.alt, text: i.textInImage })) },
        pack,
      );
      for (const f of findings) {
        expect(() => findingSchema.parse(f)).not.toThrow();
        expect(f.source).toBe("rule");
        if (f.location === "text") expect(d.text.slice(f.span.start, f.span.end)).toBe(f.quote);
      }
      expect(new Set(findings.map((f) => f.id)).size).toBe(findings.length);
    }
  });

  it("does not double-report one span under the same rule", () => {
    expect(only("guaranteed guarantee", "KSR-4.4")).toHaveLength(2);
    expect(only("Dhaga and Co", "KSR-2.1")).toHaveLength(1);
  });
});

describe("test set (answer keys)", () => {
  const drafts = loadTestSet();
  const scores = drafts.map((d) =>
    scoreDraft(
      d,
      runCodeChecks({ text: d.text, images: d.images.map((i) => ({ file: i.file, alt: i.alt, text: i.textInImage })) }, pack)
        .findings,
    ),
  );

  it("catches every item the code checks are responsible for", () => {
    const missed = scores.flatMap((s) => s.misses.filter(codeResponsibility).map((m) => `${s.draftId} ${m.rule} "${m.quote}"`));
    expect(missed).toEqual([]);
  });

  it("reports nothing outside the answer keys", () => {
    const extras = scores.flatMap((s) => s.extras.map((x) => `${s.draftId} ${x.rule} "${x.quote}"`));
    expect(extras).toEqual([]);
  });

  it("hands AI the candidates it needs for the AI-only items", () => {
    const cands = (id: string) => {
      const d = drafts.find((x) => x.id === id)!;
      return runCodeChecks({ text: d.text }, pack).candidates;
    };
    expect(cands("D06").find((c) => c.type === "certification")?.evidence).toEqual(["KLE-03"]);
    expect(cands("D12").find((c) => c.type === "percent")?.evidence).toEqual(["KLE-10"]);
    expect(cands("D11").some((c) => c.text === "award-winning")).toBe(true);
    expect(cands("D10").some((c) => c.text === "eco-friendly")).toBe(true);
  });
});

describe("price format regression", () => {
  it("does not swallow a comma that ends the clause", () => {
    expect(only("Free shipping above ₹1,499, shop now.", "KSR-2.5")).toHaveLength(0);
    expect(only("Now Rs. 2299/-, today only.", "KSR-2.5")[0].quote).toBe("Rs. 2299/-");
  });
});
