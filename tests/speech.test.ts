import { describe, expect, it } from "vitest";
import { normalizeSpokenEnglish as n } from "@/lib/speech/normalize";

describe("normalizeSpokenEnglish", () => {
  it("turns spoken prices into rupee digits", () => {
    expect(n("Free shipping above one thousand four hundred ninety nine rupees. Shop now.")).toBe("Free shipping above ₹1,499. Shop now.");
    expect(n("now just one thousand nine hundred ninety nine rupees")).toBe("now just ₹1,999");
  });
  it("turns spoken percentages into digits", () => {
    expect(n("thirty percent off everything")).toBe("30% off everything");
    expect(n("take twenty per cent off")).toBe("take 20% off");
  });
  it("converts larger counts", () => {
    expect(n("we work with two thousand artisans")).toBe("we work with 2,000 artisans");
    expect(n("rated by twenty five thousand customers")).toBe("rated by 25,000 customers");
    expect(n("over eighteen thousand reviews")).toBe("over 18,000 reviews");
  });
  it("leaves ordinary words alone", () => {
    expect(n("one of our favourite sets, two colours and three sizes")).toBe("one of our favourite sets, two colours and three sizes");
    expect(n("Shop the Monsoon Weave")).toBe("Shop the Monsoon Weave");
  });
  it("keeps punctuation after a number", () => {
    expect(n("It costs fifty rupees, today only")).toBe("It costs ₹50, today only");
  });
});
