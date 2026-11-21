import { describe, expect, it } from "vitest";
import { cleanReply, codeFormat, detectLang, hindiShare, sameWords, wordsOf } from "@/lib/format";

describe("codeFormat (English)", () => {
  it("fixes spacing, a lone i, capitals and the ending", () => {
    expect(codeFormat("free shipping above ₹1,499 .  shop the monsoon weave now", "en")).toBe("Free shipping above ₹1,499. Shop the monsoon weave now.");
    expect(codeFormat("i think it's great ,really", "en")).toBe("I think it's great, really.");
  });
  it("does not split numbers or abbreviations", () => {
    expect(codeFormat("it is rated 4.6 out of 5 by 18,000 customers", "en")).toBe("It is rated 4.6 out of 5 by 18,000 customers.");
    expect(codeFormat("Dhaaga & Co. is back. now just Rs. 1999", "en")).toBe("Dhaaga & Co. is back. Now just Rs. 1999.");
  });
  it("keeps paragraphs, trims, and leaves short fragments without a full stop", () => {
    expect(codeFormat("  hello there friend \n\n\n\n second paragraph here  ", "en")).toBe("Hello there friend.\n\nSecond paragraph here.");
    expect(codeFormat("Shop now", "en")).toBe("Shop now");
  });
});

describe("codeFormat (Hindi)", () => {
  it("uses the Hindi full stop and tidy spacing", () => {
    expect(codeFormat("मॉनसून वीव अब सिर्फ ₹1,999 में उपलब्ध है .   अभी खरीदें", "hi")).toBe("मॉनसून वीव अब सिर्फ ₹1,999 में उपलब्ध है। अभी खरीदें।");
    expect(codeFormat("अभी खरीदें,आज ही", "hi")).toBe("अभी खरीदें, आज ही।");
  });
});

describe("words are never changed", () => {
  it("ignores case, punctuation and number grouping, but nothing else", () => {
    expect(wordsOf("Free shipping above ₹1,499, 30% off.")).toEqual(["free", "shipping", "above", "₹1499", "30%", "off"]);
    expect(sameWords("free shipping above ₹1,499 shop now", "Free shipping above ₹1,499. Shop now.")).toBe(true);
    expect(sameWords("free shipping above ₹1,499", "Free shipping above ₹2,499.")).toBe(false);
    expect(sameWords("free shipping", "Free delivery.")).toBe(false);
    expect(sameWords("a b c", "a b")).toBe(false);
  });
  it("detects the language and cleans a model's wrapping", () => {
    expect(detectLang("मॉनसून वीव अब उपलब्ध है")).toBe("hi");
    expect(detectLang("Shop the Monsoon Weave")).toBe("en");
    expect(hindiShare("")).toBe(0);
    expect(cleanReply('```\n"Hello there."\n```')).toBe("Hello there.");
    expect(cleanReply("Here is the formatted text:\nHello there.")).toBe("Hello there.");
  });
});
