import { describe, expect, it } from "vitest";
import { DEMO_TODAY, loadBrandPack, loadTestSet } from "@/lib/brand-pack";
import { runCodeChecks } from "@/lib/checks";
import { buildCodeLedger, reconcile } from "@/lib/ledger";
import { groundAiClaims, type AiClaim } from "@/lib/ledger/ai";
import { classifyFacts } from "@/lib/ledger/facts";
import { reviewDraft } from "@/lib/pipeline";
import { ledgerClaimSchema, type LedgerClaim } from "@/lib/schemas/claim";
import type { Finding } from "@/lib/schemas/finding";

const pack = loadBrandPack();
const facts = (text: string, today = DEMO_TODAY) =>
  classifyFacts(text, pack, today).map((f) => [f.match.text, f.status, f.evidence?.code ?? null, f.fix]);
const findings = (text: string, rule?: string) => runCodeChecks({ text }, pack).findings.filter((f) => !rule || f.rule === rule);
const ledger = (text: string) => reconcile(buildCodeLedger({ text }, pack, DEMO_TODAY), runCodeChecks({ text }, pack).findings);

describe("Claim Ledger — numeric facts (code)", () => {
  it("slide 7: '₹999 free shipping' is stale against expired KLE-07, fixed with KLE-12's ₹1,499", () => {
    expect(facts("Free shipping on all orders above ₹999 this festive season.")).toEqual([["₹999", "stale", "KLE-07", "₹1,499"]]);
    const [f] = findings("Free shipping on all orders above ₹999 this festive season.", "KSR-4.1");
    expect(f).toMatchObject({ evidence: "KLE-07", suggestedFix: "₹1,499" });
    expect(f.explanation).toMatch(/KLE-12/);
  });

  it("a shipping threshold with no entry is contradicted by the live one", () => {
    expect(facts("Free shipping on orders above ₹799.")).toEqual([["₹799", "contradicted", "KLE-12", "₹1,499"]]);
    expect(findings("Free shipping on orders above ₹799.", "KSR-4.1")[0]).toMatchObject({ evidence: "KLE-12", suggestedFix: "₹1,499" });
  });

  it("a real price on the wrong topic is not verified: ₹1,999 is the Monsoon Weave price, not the shipping threshold", () => {
    expect(facts("Free shipping on orders above ₹1,999.")).toEqual([["₹1,999", "contradicted", "KLE-12", "₹1,499"]]);
  });

  it("a topic word far from the number doesn't claim it", () => {
    expect(facts("Free shipping on all orders above ₹999, and the Indigo Hour set is just Rs. 2299/-.")).toEqual([
      ["₹999", "stale", "KLE-07", "₹1,499"],
      ["Rs. 2299/-", "verified", "KLE-11", null],
    ]);
  });

  it("matches each price to the nearest product in the sentence", () => {
    expect(facts("Monsoon Weave ₹1,999 and Indigo Hours ₹2,500.")).toEqual([
      ["₹1,999", "verified", "KLE-16", null],
      ["₹2,500", "contradicted", "KLE-11", "₹2,299"],
    ]);
  });

  it("checks ratings, review counts, artisan counts, return windows and the founding year (KSR-4.2)", () => {
    expect(facts("Rated 4.8 out of 5 by 25,000 happy customers.")).toEqual([
      ["4.8 out of 5", "contradicted", "KLE-06", "4.6 out of 5"],
      ["25,000 happy customers", "contradicted", "KLE-06", "18,000 happy customers"],
    ]);
    expect(facts("Made by 2,000 artisans. Weaving since 2012. 30-day returns.")).toEqual([
      ["2,000 artisans", "contradicted", "KLE-02", "1,200 artisans"],
      ["since 2012", "contradicted", "KLE-01", "since 2014"],
      ["30-day", "contradicted", "KLE-09", "7-day"],
    ]);
    expect(findings("Made by 2,000 artisans.").map((f) => [f.rule, f.suggestedFix])).toEqual([["KSR-4.2", "1,200 artisans"]]);
  });

  it("'more than' claims below the ledger value are verified", () => {
    expect(facts("Rated 4.6 out of 5 by over 18,000 customers. Woven by 1,000 artisans.").map((f) => f[1])).toEqual([
      "verified",
      "verified",
      "verified",
    ]);
  });

  it("a % only contradicts the sale when it is an offer", () => {
    expect(facts("Up to 50% off sitewide. 100% cotton.")).toEqual([
      ["50%", "contradicted", "KLE-10", "20%"],
      ["100%", "no_evidence", null, null],
    ]);
    expect(findings("100% cotton sheets.", "KSR-4.1")).toEqual([]);
  });

  it("respects the date: a live price turns stale after it expires", () => {
    expect(facts("Indigo Hours, ₹2,299.", "2027-02-01")).toEqual([["₹2,299", "stale", "KLE-11", null]]);
  });
});

describe("Claim Ledger — whole draft", () => {
  const drafts = loadTestSet();
  const byId = (id: string) => {
    const d = drafts.find((x) => x.id === id)!;
    const input = { text: d.text, images: d.images.map((i) => ({ file: i.file, alt: i.alt, text: i.textInImage })) };
    return reconcile(buildCodeLedger(input, pack, DEMO_TODAY), runCodeChecks(input, pack).findings);
  };

  it("every claim matches the schema and quotes its own span", () => {
    for (const d of drafts) {
      const text = d.text;
      for (const c of byId(d.id)) {
        expect(ledgerClaimSchema.safeParse(c).success).toBe(true);
        if (c.location === "text") expect(text.slice(c.span.start, c.span.end)).toBe(c.text);
      }
    }
  });

  it("clean drafts D17 and D18 have only verified claims", () => {
    for (const id of ["D17", "D18"]) {
      const claims = byId(id);
      expect(claims.length).toBeGreaterThan(2);
      expect(claims.every((c) => c.status === "verified"), id).toBe(true);
    }
  });

  it("links stale claims to their finding, and finds the stale price inside the D16 banner", () => {
    const d01 = byId("D01");
    expect(d01[0]).toMatchObject({ status: "stale", evidence: "KLE-07", suggestedFix: "₹1,499" });
    expect(d01[0].findingId).toMatch(/^KSR-4\.1:text/);
    expect(byId("D16").find((c) => c.location === "image")).toMatchObject({ text: "₹999", status: "stale" });
  });

  it("superlatives: approved wording is verified, the rest have no proof; absolutes never have proof", () => {
    expect(ledger("Winner, Best D2C Home Brand at the Demo Retail Awards 2024.")[0]).toMatchObject({ status: "verified", evidence: "KLE-14" });
    expect(ledger("India's most trusted brand.")[0]).toMatchObject({ kind: "superlative", status: "no_evidence" });
    expect(ledger("Colours that never fade.")[0]).toMatchObject({ kind: "absolute", status: "no_evidence" });
  });

  it("a certificate is verified only when the sentence names the line it covers", () => {
    expect(ledger("The Kesar Collection is GOTS-certified organic cotton.")[0]).toMatchObject({ status: "verified", evidence: "KLE-03" });
    expect(ledger("Every product is GOTS-certified.")[0]).toMatchObject({ status: "unchecked", evidence: "KLE-03" });
    expect(ledger("Monsoon Weave is OEKO-TEX Standard 100 certified.")[0]).toMatchObject({ status: "stale", evidence: "KLE-04" });
  });

  it("a verified claims finding settles an unchecked claim; one sent to a person does not", () => {
    const text = "Every product is GOTS-certified.";
    const claims = buildCodeLedger({ text }, pack, DEMO_TODAY);
    const finding = (review: Finding["review"]): Finding => ({
      id: "f1", rule: "KSR-4.3", evidence: "KLE-03", quote: "Every product is GOTS-certified", location: "text",
      span: { start: 0, end: 31 }, explanation: "GOTS covers the Kesar Collection only.", suggestedFix: null,
      confidence: 0.9, severity: "high", source: "ai", modelId: "m", review,
    });
    expect(reconcile(claims, [finding("verified")])[0]).toMatchObject({ status: "no_evidence", findingId: "f1", note: "GOTS covers the Kesar Collection only." });
    expect(reconcile(claims, [finding("needs_review")])[0]).toMatchObject({ status: "unchecked", findingId: "f1" });
  });

  it("skips claim words a nearby claim already covers, and 'your new favourite'", () => {
    const kinds = ledger("Find your new favourite set. Rated 4.6 out of 5. Cheap, eco-friendly towels that never fade.").map((c) => [c.text, c.kind]);
    expect(kinds).toEqual([
      ["4.6 out of 5", "rating"],
      ["eco-friendly", "trigger"],
      ["never fade", "absolute"],
    ]);
  });
});

describe("Claim Ledger — AI pass grounding", () => {
  const draft = "Every sheet is woven by hand in Varanasi and Panipat, and gets softer with every wash. Award-winning design.";
  const code = buildCodeLedger({ text: draft }, pack, DEMO_TODAY);
  const ai = (over: Partial<AiClaim>): AiClaim => ({ quote: "woven by hand in Varanasi and Panipat", evidence: "KLE-13", verdict: "supported", reason: "KLE-13.", confidence: 0.9, ...over });
  const ground = (aiClaims: AiClaim[], codeClaims: LedgerClaim[] = code, today = DEMO_TODAY) =>
    groundAiClaims({ draft, aiClaims, codeClaims, pack, today, modelId: "m", tokens: [] });

  it("adds a supported implicit claim as verified, with an exact span", () => {
    const r = ground([ai({})]);
    const c = r.claims.find((x) => x.source === "ai")!;
    expect(c).toMatchObject({ status: "verified", evidence: "KLE-13", kind: "implicit", modelId: "m", review: "verified" });
    expect(draft.slice(c.span.start, c.span.end)).toBe(c.text);
    expect(r.added).toBe(1);
  });

  it("drops misquotes, and code decides the status from the cited entry", () => {
    const r = ground([
      ai({ quote: "hand-woven in Varanasi" }),
      ai({ quote: "gets softer with every wash", evidence: null, verdict: "supported" }),
      ai({ evidence: "KLE-99" }),
    ]);
    expect(r.dropped.map((d) => d.reason)).toEqual(["quote not found in the draft"]);
    const softer = r.claims.find((c) => c.text === "gets softer with every wash")!;
    expect(softer.status).toBe("no_evidence");
    expect(softer.note).toMatch(/No ledger entry was cited/);
    // KLE-99 doesn't exist: an unknown citation is no citation, so that claim has no proof either.
    expect(r.claims.find((c) => c.text.startsWith("woven by hand"))?.status).toBe("no_evidence");
    expect(r.claims.filter((c) => c.source === "ai")).toHaveLength(2);
  });

  it("an expired entry makes a 'supported' claim stale, whatever the model says", () => {
    const d = "Monsoon Weave is safety-tested to international textile standards.";
    const r = groundAiClaims({
      draft: d,
      aiClaims: [ai({ quote: "safety-tested to international textile standards", evidence: "KLE-04" })],
      codeClaims: [],
      pack,
      today: DEMO_TODAY,
      modelId: "m",
      tokens: [],
    });
    expect(r.claims[0]).toMatchObject({ status: "stale", evidence: "KLE-04" });
  });

  it("settles unchecked claim words, removes non-claims, and never overrides code", () => {
    const withTrigger = code.filter((c) => c.status === "unchecked");
    expect(withTrigger.map((c) => c.text)).toEqual(["Award-winning"]);
    const r = ground([ai({ quote: "Award-winning", evidence: "KLE-14", verdict: "not_supported", reason: "Must name the award." })]);
    expect(r.claims.find((c) => c.text === "Award-winning")).toMatchObject({ source: "ai", kind: "trigger", status: "no_evidence" });
    expect(r.judged).toBe(1);

    const gone = ground([ai({ quote: "Award-winning", verdict: "not_a_claim" })]);
    expect(gone.claims.some((c) => c.text === "Award-winning")).toBe(false);

    const priced = buildCodeLedger({ text: "Free shipping above ₹999." }, pack, DEMO_TODAY);
    const kept = groundAiClaims({ draft: "Free shipping above ₹999.", aiClaims: [ai({ quote: "₹999", evidence: "KLE-07", verdict: "supported" })], codeClaims: priced, pack, today: DEMO_TODAY, modelId: "m", tokens: [] });
    expect(kept.claims).toEqual(priced);
  });

  it("low confidence goes to a person", () => {
    expect(ground([ai({ confidence: 0.4 })]).claims.find((c) => c.source === "ai")?.review).toBe("needs_review");
  });
});

describe("Claim Ledger in the pipeline", () => {
  it("returns the code ledger when AI is off", async () => {
    const r = await reviewDraft({ text: "Free shipping on orders above ₹799. Our #1 set." }, pack, { client: null });
    expect(r.claims.map((c) => [c.text, c.status])).toEqual([
      ["₹799", "contradicted"],
      ["#1", "no_evidence"],
    ]);
    expect(r.claims[0].findingId).toBeDefined();
  });
});

describe("Claim Ledger — AI guards from the live run", () => {
  const ground = (draft: string, quote: string, extra: Partial<AiClaim> = {}) =>
    groundAiClaims({
      draft,
      aiClaims: [{ quote, evidence: "KLE-11", verdict: "not_supported", reason: "r", confidence: 0.9, ...extra }],
      codeClaims: [],
      pack,
      today: DEMO_TODAY,
      modelId: "m",
      tokens: [],
    });

  it("drops calls to action and bare product names", () => {
    expect(ground("Find your new favourite set in the Indigo Hours collection.", "Find your new favourite set in the Indigo Hours collection.").claims).toEqual([]);
    expect(ground("Treat your home to the Monsoon Weave.", "Monsoon Weave", { evidence: "KLE-08", verdict: "supported" }).claims).toEqual([]);
  });

  it("a verified claims finding overrides an AI 'supported' verdict", () => {
    const draft = "Softer and award-winning too.";
    const r = groundAiClaims({
      draft,
      aiClaims: [{ quote: "award-winning", evidence: "KLE-14", verdict: "supported", reason: "r", confidence: 0.9 }],
      codeClaims: buildCodeLedger({ text: draft }, pack, DEMO_TODAY),
      pack,
      today: DEMO_TODAY,
      modelId: "m",
      tokens: [],
    });
    const f: Finding = {
      id: "f2", rule: "KSR-4.2", evidence: "KLE-14", quote: "award-winning", location: "text", span: { start: 11, end: 24 },
      explanation: "Name the award and the year.", suggestedFix: null, confidence: 0.9, severity: "high", source: "ai", modelId: "m", review: "verified",
    };
    expect(reconcile(r.claims, [f]).find((c) => c.text === "award-winning")).toMatchObject({ status: "no_evidence", findingId: "f2" });
  });
});

describe("Claim Ledger overrules the AI reviewer on proven claims", () => {
  it("drops an AI KSR-4.2 finding once a reviewer has added proof for the claim", async () => {
    const text = "Dhaaga & Co. is India's most trusted bedsheet brand.";
    const proven = {
      ...pack,
      evidence: [
        ...pack.evidence,
        {
          code: "KLE-17", title: "Survey", claim: text, value: { kind: "text" as const, text: "most trusted" }, source: "Survey",
          owner: { name: "A", role: "B" }, verifiedAt: DEMO_TODAY, expiresAt: null, tags: [],
        },
      ],
    };
    const reply = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 });
    const fake = (async (_url: string, init: RequestInit) => {
      const body = String(init.body);
      if (body.includes("kasauti_claims")) return reply({ claims: [] });
      if (body.includes("ALREADY FOUND"))
        return reply({ findings: [{ rule: "KSR-4.2", evidence: null, quote: "India's most trusted bedsheet brand", explanation: "No proof.", suggestedFix: null, confidence: 0.9 }] });
      return new Response("{}", { status: 500 });
    }) as unknown as typeof fetch;
    const { NvidiaClient } = await import("@/lib/nvidia");
    const client = new NvidiaClient({ apiKeys: ["k"], baseUrl: "https://x", fetch: fake, sleep: async () => {}, maxRetries: 0 });
    const r = await reviewDraft({ text }, proven, { client, embedFn: async (t) => t.map(() => [1, 0]) });
    expect(r.ai.ran).toBe(true);
    expect(r.findings.filter((f) => f.rule === "KSR-4.2")).toEqual([]);
    expect(r.ai.dropped?.[0].reason).toMatch(/Claim Ledger backs "most trusted" \(KLE-17\)/);
    expect(r.claims[0]).toMatchObject({ text: "most trusted", status: "verified", evidence: "KLE-17" });
  });
});
