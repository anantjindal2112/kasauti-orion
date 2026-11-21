import { describe, expect, it } from "vitest";
import { DEMO_TODAY, loadBrandPack } from "@/lib/brand-pack";
import { phraseProblems, usableFacts } from "@/lib/speech/phrase";

const pack = loadBrandPack();
const facts = ["Free shipping on orders above ₹1,499.", "The Monsoon Weave costs ₹1,999."];

describe("sample phrase checks", () => {
  it("lists only proof that has not expired", () => {
    const f = usableFacts(pack, DEMO_TODAY);
    expect(f.length).toBeGreaterThan(5);
    expect(f.some((x) => /999/.test(x) && /shipping/i.test(x))).toBe(false); // the stale ₹999 shipping entry is expired
  });

  it("accepts a clean line that uses a real product and only given numbers", () => {
    expect(phraseProblems("The Monsoon Weave is ₹1,999 and free shipping starts above ₹1,499.", pack, facts, DEMO_TODAY)).toEqual([]);
  });

  it("rejects invented numbers, shouting, a missing product and bad terms", () => {
    const bad = phraseProblems("HUGE SALE!!! Get 50% off our cheap sheets today.", pack, facts, DEMO_TODAY).join(" | ");
    expect(bad).toMatch(/product/i);
    expect(bad).toMatch(/not in the facts.*50/);
    expect(bad).toMatch(/KSR-1\.3|KSR-1\.4|KSR-2\.3/);
  });

  it("rejects lines that are too short or have line breaks", () => {
    expect(phraseProblems("Hi", pack, facts, DEMO_TODAY).join(" ")).toMatch(/short sentences/);
    expect(phraseProblems("The Monsoon Weave is ₹1,999.\nShop now.", pack, facts, DEMO_TODAY).join(" ")).toMatch(/line breaks/);
  });
});
