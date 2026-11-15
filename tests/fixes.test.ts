import { describe, expect, it } from "vitest";
import { DEMO_TODAY, loadBrandPack } from "@/lib/brand-pack";
import { runCodeChecks } from "@/lib/checks";
import { applyFixes, joinSeam } from "@/lib/fixes/apply";
import { fixHolds, planFixAll } from "@/lib/fixes/plan";
import { missingConditions, rewriteProblems } from "@/lib/fixes/rewrite";
import type { Finding } from "@/lib/schemas/finding";

const pack = loadBrandPack();
const codeFindings = (text: string) => runCodeChecks({ text }, pack).findings.filter((f) => f.location === "text");

describe("applyFixes — clean seams", () => {
  it("doesn't double a full stop where two fixes meet", () => {
    const text = "News from Dhaga and Co!!! Shop now.";
    const out = applyFixes(text, [
      { start: 10, end: 22, replacement: "Dhaaga & Co." },
      { start: 22, end: 25, replacement: "." },
    ]);
    expect(out).toBe("News from Dhaaga & Co. Shop now.");
  });

  it("tidies a deletion: no dangling comma, capitalised sentence start", () => {
    expect(applyFixes("Colours that never fade, guaranteed.", [{ start: 25, end: 35, replacement: "" }])).toBe("Colours that never fade.");
    expect(applyFixes("Hi. Cheap sheets that feel premium.", [{ start: 4, end: 9, replacement: "" }])).toBe("Hi. Sheets that feel premium.");
    expect(joinSeam("Hello  ", " world")).toBe("Hello world");
  });
});

describe("code fixes don't create new findings", () => {
  it("a hashtag written as #IndigoHours is not a product-name slip", () => {
    expect(codeFindings("New in. #IndigoHours").map((f) => f.rule)).not.toContain("KSR-2.6");
    expect(codeFindings("Meet the IndigoHours set.").map((f) => f.rule)).toContain("KSR-2.6");
  });

  it("every code fix on Example 1 applied together leaves no code-fixable finding behind", () => {
    const text =
      "🔥🔥🔥 HUGE FESTIVE NEWS from Dhaga and Co!!! The Indigo Hour set is just Rs. 2299/-. Made by our workers in Panipat. #festivesale #indigohours";
    const plan = planFixAll(text, codeFindings(text), pack, DEMO_TODAY);
    const left = codeFindings(plan.text).filter((f) => f.suggestedFix !== null);
    expect(left).toEqual([]);
    expect(plan.text).toContain("Dhaaga & Co.");
    expect(plan.text).not.toContain("Co..");
    expect(plan.text).toContain("#IndigoHours");
  });
});

describe("planFixAll — overlapping fixes", () => {
  const text = "Big news: 30% off everything! Shop the sale.";
  const code = codeFindings(text);
  const ai: Finding = {
    id: "ai:KSR-6.2:10",
    rule: "KSR-6.2",
    evidence: "KLE-10",
    quote: "30% off everything",
    location: "text",
    span: { start: 10, end: 28 },
    explanation: "Offer has no end date.",
    suggestedFix: "20% off sitewide until 16 November (not valid on gift cards)",
    confidence: 0.9,
    severity: "high",
    source: "ai",
    modelId: "m",
    review: "verified",
  };

  it("takes the larger fix when it also clears the smaller one inside it", () => {
    expect(code.find((f) => f.rule === "KSR-4.1")?.quote).toBe("30%");
    const plan = planFixAll(text, [...code, ai], pack, DEMO_TODAY);
    expect(plan.text).toContain("20% off sitewide until 16 November (not valid on gift cards)");
    expect(plan.applied).toEqual(expect.arrayContaining([ai.id, code.find((f) => f.rule === "KSR-4.1")!.id]));
  });

  it("keeps the smaller fix when the larger one doesn't clear it", () => {
    const bad = { ...ai, suggestedFix: "30% off sitewide until 16 November" };
    const plan = planFixAll(text, [...code, bad], pack, DEMO_TODAY);
    expect(plan.text).toContain("20% off everything");
  });

  it("leaves findings sent to a person alone", () => {
    const tone = { ...ai, rule: "KSR-1.1", review: "needs_review" as const, suggestedFix: "Something else entirely" };
    expect(planFixAll(text, [tone], pack, DEMO_TODAY).text).not.toContain("Something else");
  });
});

describe("fixHolds", () => {
  const text = "Colours that never fade, guaranteed. Shop towels.";
  const f = codeFindings(text).find((x) => x.quote === "never fade")!;
  it("accepts a fix that clears the rule and breaks nothing", () => {
    expect(fixHolds(text, f, "stay bright wash after wash", pack, DEMO_TODAY).ok).toBe(true);
  });
  it("rejects fixes that keep the problem, break a rule or invent a price", () => {
    expect(fixHolds(text, f, "never fade", pack, DEMO_TODAY)).toMatchObject({ ok: false });
    expect(fixHolds(text, f, "stay BRIGHT FOREVER", pack, DEMO_TODAY)).toMatchObject({ ok: false });
    expect(fixHolds(text, f, "stay bright, all for ₹499", pack, DEMO_TODAY)).toMatchObject({ ok: false, reason: expect.stringMatching(/₹499/) });
  });
});

describe("rewrite checks (code holds the AI rewrite to account)", () => {
  const original = "Free shipping on all orders above ₹999. Questions? Call us. Shop Monsoon Weave.";
  const issues = codeFindings(original);

  it("accepts a rewrite that fixes the issue and keeps every other sentence", () => {
    expect(rewriteProblems("Free shipping on orders above ₹1,499. Questions? Call us. Shop Monsoon Weave.", original, original, pack, DEMO_TODAY, issues)).toEqual([]);
  });

  it("rejects stale facts, dropped sentences, added sentences and invented prices", () => {
    expect(rewriteProblems(original, original, original, pack, DEMO_TODAY, issues).join(" ")).toMatch(/stale/);
    expect(rewriteProblems("Free shipping above ₹1,499. Shop Monsoon Weave.", original, original, pack, DEMO_TODAY, issues).join(" ")).toMatch(/Keep this sentence/);
    expect(
      rewriteProblems("Free shipping above ₹1,499. Questions? Call us. A. B. C. Shop Monsoon Weave.", original, original, pack, DEMO_TODAY, issues).join(" "),
    ).toMatch(/Don't add sentences/);
    expect(rewriteProblems("Free shipping above ₹1,299. Questions? Call us. Shop Monsoon Weave.", original, original, pack, DEMO_TODAY, issues).join(" ")).toMatch(/₹1,299/);
  });

  it("rejects the same sentence twice", () => {
    const o = "Don't miss out! Click here to shop.";
    expect(rewriteProblems("Shop the festive sale! Shop the festive sale.", o, o, pack, DEMO_TODAY, codeFindings(o)).join(" ")).toMatch(/appears twice/);
  });

  it("an offer must carry its ledger conditions", () => {
    const c = "Sale ends 16 November 2026. Not valid on gift cards.";
    expect(missingConditions(c, "20% off sitewide until 16 November — not valid on gift cards")).toEqual([]);
    expect(missingConditions(c, "20% off sitewide until 16 November.")).toEqual(["Not valid on gift cards."]);
    const o = "20% off sitewide. Shop the festive sale.";
    expect(rewriteProblems("20% off sitewide until 16 November. Shop the festive sale.", o, o, pack, DEMO_TODAY, codeFindings(o)).join(" ")).toMatch(/gift cards/);
  });
});
