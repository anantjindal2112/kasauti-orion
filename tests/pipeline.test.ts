import { beforeEach, describe, expect, it } from "vitest";
import { loadBrandPack } from "@/lib/brand-pack";
import { runCodeChecks } from "@/lib/checks";
import { NvidiaClient } from "@/lib/nvidia";
import { reviewDraft } from "@/lib/pipeline";
import type { AiFinding } from "@/lib/pipeline/ai-review";
import { buildReviewMessages } from "@/lib/pipeline/ai-review";
import { resetRetrievalIndex, retrieve, withSuccessors, type EmbedFn } from "@/lib/pipeline/retrieval";
import { verify } from "@/lib/pipeline/verifier";
import { maskPII } from "@/lib/privacy/mask";

const pack = loadBrandPack();
const ai = (over: Partial<AiFinding>): AiFinding => ({
  rule: "KSR-4.3",
  evidence: "KLE-03",
  quote: "Every Dhaaga & Co. product is GOTS-certified",
  explanation: "GOTS covers the Kesar Collection only.",
  suggestedFix: "The Kesar Collection is GOTS-certified",
  confidence: 0.9,
  ...over,
});
const D06 = "Every Dhaaga & Co. product is GOTS-certified organic cotton, from our towels to our cushion covers.";
const run = (draft: string, findings: AiFinding[]) =>
  verify({ draft, aiFindings: findings, codeFindings: runCodeChecks({ text: draft }, pack).findings, pack, modelId: "m" });

describe("Verifier", () => {
  it("keeps a grounded finding as verified, with the exact span", () => {
    const { kept, dropped } = run(D06, [ai({})]);
    expect(dropped).toEqual([]);
    expect(kept[0]).toMatchObject({ source: "ai", review: "verified", rule: "KSR-4.3", evidence: "KLE-03", modelId: "m" });
    expect(D06.slice(kept[0].span.start, kept[0].span.end)).toBe(kept[0].quote);
  });

  it("test 1: drops unknown rules, unknown evidence and code-only rules", () => {
    const { kept, dropped } = run(D06, [ai({ rule: "KSR-9.9" }), ai({ evidence: "KLE-99" }), ai({ rule: "KSR-2.3" })]);
    expect(kept).toEqual([]);
    expect(dropped.map((d) => d.reason)).toEqual(["unknown rule KSR-9.9", "unknown evidence KLE-99", "KSR-2.3 is a code-only rule"]);
  });

  it("test 2: drops quotes that are not in the draft character for character", () => {
    const { kept, dropped } = run(D06, [ai({ quote: "Every Dhaaga product is GOTS certified" })]);
    expect(kept).toEqual([]);
    expect(dropped[0].reason).toMatch(/quote not found/);
  });

  it("test 2: tolerates wrapping quote marks and curly apostrophes only", () => {
    const draft = "We’re the towel people. Shop towels.";
    const { kept } = run(draft, [ai({ rule: "KSR-1.1", evidence: null, quote: "“We're the towel people”", suggestedFix: null })]);
    expect(kept[0].quote).toBe("We’re the towel people");
  });

  it("test 3: removes a fix that breaks a code rule, and sends it to human review", () => {
    const { kept } = run(D06, [ai({ suggestedFix: "Every product is GUARANTEED GOTS-certified" })]);
    expect(kept[0].suggestedFix).toBeNull();
    expect(kept[0].review).toBe("needs_review");
    expect(kept[0].reviewNote).toMatch(/broke KSR-/);
  });

  it("test 3: removes a fix that invents a price not in the draft or ledger", () => {
    const draft = "Towels now at a special price, shop the sale.";
    const { kept } = run(draft, [ai({ rule: "KSR-6.2", evidence: null, quote: "a special price", suggestedFix: "₹499" })]);
    expect(kept[0].suggestedFix).toBeNull();
    expect(kept[0].reviewNote).toMatch(/₹499/);
  });

  it("allows a fix that uses a price from the Claim Ledger", () => {
    const draft = "Free shipping on every order, shop now.";
    const { kept } = run(draft, [ai({ rule: "KSR-6.2", evidence: "KLE-12", quote: "Free shipping on every order", suggestedFix: "Free shipping on orders above ₹1,499" })]);
    expect(kept[0]).toMatchObject({ review: "verified", suggestedFix: "Free shipping on orders above ₹1,499" });
  });

  it("sends low-confidence findings to human review", () => {
    const { kept } = run(D06, [ai({ confidence: 0.4 })]);
    expect(kept[0].review).toBe("needs_review");
    expect(kept[0].reviewNote).toMatch(/Low confidence/);
  });

  it("drops duplicates of code findings and of each other", () => {
    const draft = "Our #1 sale ever.";
    const { kept, dropped } = run(draft, [
      ai({ rule: "KSR-4.2", evidence: null, quote: "#1", suggestedFix: null }),
      ai({ rule: "KSR-1.1", evidence: null, quote: "sale ever", suggestedFix: null }),
      ai({ rule: "KSR-1.1", evidence: null, quote: "sale ever", suggestedFix: null }),
    ]);
    expect(kept.map((k) => k.rule)).toEqual(["KSR-1.1"]);
    expect(dropped.map((d) => d.reason)).toEqual(["duplicate of a code check", "duplicate finding"]);
  });

  it("unmasks PII tokens before checking the quote", () => {
    const draft = "Write to meera@dhaaga.example for the best deal in India.";
    const { masked, tokens } = maskPII(draft);
    expect(masked).not.toContain("meera@");
    const { kept } = verify({
      draft,
      aiFindings: [ai({ rule: "KSR-1.1", evidence: null, quote: "Write to ⟦EMAIL_1⟧", suggestedFix: null })],
      codeFindings: [],
      pack,
      modelId: "m",
      tokens,
    });
    expect(kept[0].quote).toBe("Write to meera@dhaaga.example");
  });
});

describe("retrieval", () => {
  beforeEach(() => resetRetrievalIndex());

  /** Fake embeddings: a bag of keywords, so similarity = shared words. */
  const VOCAB = ["shipping", "gots", "oeko", "price", "logo", "tone", "monsoon", "kesar", "sale", "award", "returns"];
  const fakeEmbed: EmbedFn = async (texts) =>
    texts.map((t) => [...VOCAB.map((w): number => (t.toLowerCase().includes(w) ? 1 : 0)), 0.01]);

  it("finds the shipping evidence for a shipping sentence", async () => {
    const r = await retrieve(["Free shipping on all orders above ₹999"], pack, fakeEmbed, { perQuery: 3 });
    expect(r.evidence.map((e) => e.code)).toEqual(expect.arrayContaining(["KLE-07", "KLE-12"]));
  });

  it("embeds the brand pack once and reuses it", async () => {
    let calls = 0;
    const counting: EmbedFn = async (t, type) => {
      calls++;
      return fakeEmbed(t, type);
    };
    await retrieve(["gots"], pack, counting);
    await retrieve(["logo"], pack, counting);
    expect(calls).toBe(3); // 1 index + 2 queries
  });

  it("adds the successor of a stale entry", () => {
    const stale = pack.evidence.filter((e) => e.code === "KLE-07");
    expect(withSuccessors(stale, pack).map((e) => e.code)).toEqual(["KLE-07", "KLE-12"]);
  });
});

describe("prompt", () => {
  it("contains the rules, evidence state, already-found items and the draft", () => {
    const code = runCodeChecks({ text: D06 }, pack);
    const [system, user] = buildReviewMessages({
      pack,
      draft: D06,
      rules: pack.rules.filter((r) => r.code === "KSR-4.3"),
      evidence: pack.evidence.filter((e) => ["KLE-03", "KLE-04"].includes(e.code)),
      candidates: code.candidates,
      codeFindings: code.findings,
      today: "2026-11-13",
    });
    expect(String(system.content)).toMatch(/never invent facts/);
    expect(String(user.content)).toMatch(/KSR-4\.3 \[hybrid\]/);
    expect(String(user.content)).toMatch(/KLE-04 \(EXPIRED on 2026-08-31\)/);
    expect(String(user.content)).toContain(D06);
  });
});

describe("reviewDraft fallbacks", () => {
  it("returns code findings with a reason when there is no NVIDIA client", async () => {
    const r = await reviewDraft({ text: "Our #1 sale!!!" }, pack, { client: null });
    expect(r.ai.ran).toBe(false);
    expect(r.ai.error).toMatch(/not configured/);
    expect(r.findings.map((f) => f.rule)).toContain("KSR-4.2");
  });

  it("falls back to code findings when the model call fails", async () => {
    const failing = new NvidiaClient({
      apiKeys: ["k"],
      baseUrl: "https://x",
      fetch: (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch,
      sleep: async () => {},
      maxRetries: 0,
    });
    const r = await reviewDraft({ text: "Our #1 sale!!!" }, pack, { client: failing, embedFn: async (t) => t.map(() => [1, 0]) });
    expect(r.ai.ran).toBe(false);
    expect(r.ai.error).toMatch(/unavailable/);
    expect(r.findings.length).toBeGreaterThan(0);
  });
});

describe("Verifier tuning", () => {
  it("rescues an evidence code written as prose, and ignores prose with no code", () => {
    const a = run(D06, [ai({ evidence: "KLE-03 (valid) says Kesar only" })]);
    expect(a.kept[0].evidence).toBe("KLE-03");
    const b = run(D06, [ai({ evidence: "No ledger entry covers this" })]);
    expect(b.kept[0].evidence).toBeUndefined();
  });

  it("routes vague rules and over-broad quotes to human review", () => {
    const draft = "The Monsoon Weave set is back in stock. Soft, breathable cotton. Shop Monsoon Weave.";
    const vague = run(draft, [ai({ rule: "KSR-1.2", evidence: null, quote: "back in stock", suggestedFix: null })]);
    expect(vague.kept[0].review).toBe("needs_review");
    const broad = run(draft, [ai({ rule: "KSR-1.1", evidence: null, quote: draft, suggestedFix: null })]);
    expect(broad.kept[0].reviewNote).toMatch(/more than one sentence/);
  });
});

describe("Verifier relevance guards (test 2b)", () => {
  it("drops a real quote cited under a rule it can't break", () => {
    const draft = "The Monsoon Weave set is back. Soft, breathable, 300 thread count cotton. Shop Monsoon Weave.";
    const r = run(draft, [
      ai({ rule: "KSR-4.3", evidence: "KLE-04", quote: "Soft, breathable, 300 thread count cotton.", suggestedFix: null }),
      ai({ rule: "KSR-6.1", evidence: null, quote: "Shop Monsoon Weave.", suggestedFix: null }),
    ]);
    expect(r.kept).toEqual([]);
    expect(r.dropped.map((d) => d.reason)).toEqual([
      "quote does not contain a certification, so it can't break KSR-4.3",
      "quote does not contain two or more different calls to action, so it can't break KSR-6.1",
    ]);
  });

  it("keeps a CTA finding with several asks, and sends tone findings to a person", () => {
    const draft = "20% off everything! Shop now, follow us on Instagram, refer a friend and download our app.";
    const r = run(draft, [
      ai({ rule: "KSR-6.1", evidence: null, quote: "Shop now, follow us on Instagram, refer a friend and download our app.", suggestedFix: null }),
      ai({ rule: "KSR-1.1", evidence: null, quote: "Shop now", suggestedFix: null }),
    ]);
    expect(r.kept.map((k) => [k.rule, k.review])).toEqual([
      ["KSR-6.1", "verified"],
      ["KSR-1.1", "needs_review"],
    ]);
  });
});
