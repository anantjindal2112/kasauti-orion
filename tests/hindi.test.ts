import { describe, expect, it } from "vitest";
import { loadBrandPack } from "@/lib/brand-pack";
import { runCodeChecks } from "@/lib/checks";
import { withHindiTerms } from "@/lib/checks/hindi";
import { PRICE_RE, parseAmount } from "@/lib/checks/terminology";
import { findRegex, findTerm, splitSentences } from "@/lib/checks/text";
import { buildCodeLedger } from "@/lib/ledger";
import { classifyFacts } from "@/lib/ledger/facts";
import { RULE_GUARDS } from "@/lib/pipeline/verifier";

const pack = loadBrandPack();
const TODAY = "2026-11-13";
const found = (text: string) => runCodeChecks({ text }, pack, { today: TODAY }).findings.map((f) => [f.rule, f.quote, f.suggestedFix] as const);
const has = (list: ReturnType<typeof found>, rule: string, quote: string) => list.some(([r, q]) => r === rule && q === quote);

describe("Hindi term lists", () => {
  it("add to the pack once, and leave the English lists in place", () => {
    const p = withHindiTerms(pack);
    expect(withHindiTerms(p)).toBe(p);
    expect(withHindiTerms(pack)).toBe(p);
    expect(p.terms.superlatives).toContain("best");
    expect(p.terms.superlatives).toContain("सबसे भरोसेमंद");
    expect(p.terms.banned.some((b) => b.term === "cheap")).toBe(true);
    expect(pack.terms.superlatives).not.toContain("सबसे भरोसेमंद"); // the original pack is untouched
  });
  it("find whole Hindi words only", () => {
    expect(findTerm("यह सस्ता है", "सस्ता")).toHaveLength(1);
    expect(findTerm("सस्ताई की बात", "सस्ता")).toHaveLength(0);
    expect(splitSentences("पहला वाक्य। दूसरा वाक्य। Third one.").map((s) => s.text)).toEqual(["पहला वाक्य।", "दूसरा वाक्य।", "Third one."]);
  });
});

describe("code checks on Hindi copy", () => {
  it("catch the same mistakes as in English and quote the Hindi", () => {
    const r = found("मॉनसून वीव अब सिर्फ 1999 रुपये में उपलब्ध है। 30% की छूट। सबसे भरोसेमंद बेडशीट ब्रांड। गारंटी के साथ। आज ही खरीदें!!!");
    expect(has(r, "KSR-2.6", "मॉनसून वीव")).toBe(true);
    expect(r).toContainEqual(["KSR-2.5", "1999 रुपये", "₹1,999"]);
    expect(r).toContainEqual(["KSR-4.1", "30%", "20%"]);
    expect(has(r, "KSR-4.2", "सबसे भरोसेमंद")).toBe(true);
    expect(has(r, "KSR-4.4", "गारंटी")).toBe(true);
    expect(has(r, "KSR-1.3", "!!!")).toBe(true);
  });
  it("catch terms, banned words, pressure and link text", () => {
    const r = found("धागा एंड को की सस्ती चादरें, हमारे मज़दूरों ने बनाईं। यहाँ क्लिक करें। आखिरी मौका, वरना पछताएंगे।");
    expect(r).toContainEqual(["KSR-2.1", "धागा एंड को", "Dhaaga & Co."]);
    expect(has(r, "KSR-2.3", "सस्ती")).toBe(true);
    expect(r).toContainEqual(["KSR-2.2", "मज़दूरों", "कारीगरों"]);
    expect(has(r, "KSR-5.2", "यहाँ क्लिक करें")).toBe(true);
    expect(has(r, "KSR-1.6", "आखिरी मौका")).toBe(true);
    expect(has(r, "KSR-1.6", "वरना पछताएंगे")).toBe(true);
  });
  it("check facts against the ledger with Hindi phrasing", () => {
    const r = found("हम 2012 से बुन रहे हैं, 2,000 कारीगरों के साथ। 5 में से 4.8 रेटिंग, 25,000 से अधिक ग्राहकों से। 30 दिन की वापसी।");
    expect(r).toContainEqual(["KSR-4.2", "2012 से", "2014 से"]);
    expect(r).toContainEqual(["KSR-4.2", "2,000 कारीगरों", "1,200 कारीगरों"]);
    expect(r).toContainEqual(["KSR-4.2", "5 में से 4.8", "5 में से 4.6"]);
    expect(r).toContainEqual(["KSR-4.2", "25,000 से अधिक ग्राहकों", "18,000 से अधिक ग्राहकों"]);
    expect(r).toContainEqual(["KSR-4.2", "30 दिन", "7 दिन"]);
  });
  it("find a stale price written in Hindi", () => {
    const r = found("999 रुपये से ऊपर मुफ़्त शिपिंग।");
    expect(r).toContainEqual(["KSR-4.1", "999 रुपये", "₹1,499"]);
  });
  it("stay quiet on a correct Hindi sentence, and on readability", () => {
    const r = found("₹1,499 से ऊपर मुफ़्त शिपिंग। 20% की छूट 16 नवंबर तक, गिफ्ट कार्ड पर मान्य नहीं।");
    expect(r).toEqual([]);
    expect(found("यह एक बहुत ही लंबा वाक्य है जिसमें बहुत सारे शब्द हैं और यह कहीं रुकता नहीं है जब तक कि पाठक थक न जाए और पढ़ना छोड़ न दे।").some(([rule]) => rule === "KSR-2.4")).toBe(false);
  });
  it("work on Hinglish (Hindi in Roman letters)", () => {
    const r = found("Dhaga and Co ki sabse bharosemand chadar, sasta daam, kabhi fade nahi hoti.");
    expect(has(r, "KSR-4.2", "sabse bharosemand")).toBe(true);
    expect(has(r, "KSR-2.3", "sasta")).toBe(true);
    expect(has(r, "KSR-4.4", "kabhi fade nahi")).toBe(true);
  });
});

describe("prices and the ledger in Hindi", () => {
  it("reads Hindi price forms", () => {
    const text = "रु. 1499 और रुपये 2299 और 999 रुपये और ₹1,499";
    const amounts = findRegex(text, PRICE_RE).map((m) => parseAmount(m.text));
    expect(amounts).toEqual([1499, 2299, 999, 1499]);
    expect(findRegex("रुकिए 999 रुकिए", PRICE_RE)).toEqual([]);
  });
  it("verifies true Hindi claims and flags false ones", () => {
    expect(classifyFacts("मॉनसून वीव ₹1,999 में है। ₹1,499 से ऊपर मुफ़्त शिपिंग।", pack, TODAY).map((f) => f.status)).toEqual(["verified", "verified"]);
    expect(buildCodeLedger({ text: "तीस नहीं, 30% की छूट। सबसे भरोसेमंद ब्रांड।" }, pack, TODAY).map((c) => `${c.kind}:${c.status}`)).toEqual(["percent:contradicted", "superlative:no_evidence"]);
  });
});

describe("Verifier guards know Hindi", () => {
  const ok = (rule: string, quote: string) => RULE_GUARDS[rule].test(quote);
  it("accept a Hindi quote that is about the rule", () => {
    expect(ok("KSR-4.2", "सबसे भरोसेमंद बेडशीट ब्रांड")).toBe(true);
    expect(ok("KSR-4.3", "ऑर्गेनिक कॉटन से प्रमाणित")).toBe(true);
    expect(ok("KSR-4.5", "पर्यावरण के अनुकूल चादरें")).toBe(true);
    expect(ok("KSR-6.1", "अभी खरीदें, हमें फॉलो करें और ऐप डाउनलोड करें")).toBe(true);
    expect(ok("KSR-6.2", "सभी पर 20% की छूट")).toBe(true);
    expect(ok("KSR-1.6", "जल्दी करें, मौका न चूकें")).toBe(true);
  });
  it("reject a Hindi quote that is not about the rule", () => {
    expect(ok("KSR-4.3", "मुलायम और हवादार कपड़ा")).toBe(false);
    expect(ok("KSR-4.2", "नई चादरें आ गई हैं")).toBe(false);
    expect(ok("KSR-6.1", "अभी खरीदें")).toBe(false);
  });
});
