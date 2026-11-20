import { describe, expect, it } from "vitest";
import { normalizeSpokenEnglish as n } from "@/lib/speech/normalize";
import { normalizeSpokenHindi as h } from "@/lib/speech/normalize-hindi";

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
  it("reads hyphenated numbers", () => {
    expect(n("just one thousand nine hundred ninety-nine rupees. Buy now")).toBe("just ₹1,999. Buy now");
  });
  it("keeps punctuation after a number", () => {
    expect(n("It costs fifty rupees, today only")).toBe("It costs ₹50, today only");
  });
});

import { isLanguage } from "@/lib/nvidia/translate";

describe("isLanguage", () => {
  it("accepts Hindi in Devanagari and rejects other scripts", () => {
    expect(isLanguage("मॉनसून वीव अब सिर्फ ₹1,999 में उपलब्ध है।", "hi")).toBe(true);
    expect(isLanguage("Bezplatná doprava pro všechny objednávky", "hi")).toBe(false);
  });
  it("accepts English and rejects Czech or Devanagari", () => {
    expect(isLanguage("Free shipping on all orders above ₹1,499. Shop the Monsoon Weave now.", "en")).toBe(true);
    expect(isLanguage("Bezplatná doprava pro všechny objednávky nad ₹1,499", "en")).toBe(false);
    expect(isLanguage("मॉनसून वीव अब उपलब्ध है", "en")).toBe(false);
  });
});

describe("normalizeSpokenHindi", () => {
  it("turns spoken prices into rupee digits", () => {
    expect(h("मॉनसून वीव अब सिर्फ एक हजार नौ सौ निन्यानवे रुपये में उपलब्ध है।")).toBe("मॉनसून वीव अब सिर्फ ₹1,999 में उपलब्ध है।");
    expect(h("चौदह सौ निन्यानवे रुपये से ऊपर मुफ्त शिपिंग")).toBe("₹1,499 से ऊपर मुफ्त शिपिंग");
  });
  it("turns percentages and counts into digits", () => {
    expect(h("तीस प्रतिशत की छूट")).toBe("30% की छूट");
    expect(h("दो हजार कारीगर")).toBe("2,000 कारीगर");
    expect(h("पच्चीस हजार ग्राहक")).toBe("25,000 ग्राहक");
  });
  it("ignores spelling marks and leaves ordinary words alone", () => {
    expect(h("तीस फ़ीसदी")).toBe("30%");
    expect(h("एक दिन में दो चादरें")).toBe("एक दिन में दो चादरें");
  });
});
