import { describe, expect, it } from "vitest";
import { loadBrandPack } from "@/lib/brand-pack";
import { asHex, visualFindings, type ImageReview, type Visual } from "@/lib/pipeline/image-review";

const pack = loadBrandPack();
const review = (v: Partial<Visual>): ImageReview => ({
  file: "banner.png",
  modelId: "vision-model",
  visual: { has_text: true, text_color_hex: "#1F2A5A", background_color_hex: "#F7F3EA", text_is_large: false, logo: "indigo_spindle_wordmark", ...v },
});

describe("image review", () => {
  it("reads hex colours with or without the hash", () => {
    expect(asHex("1f2a5a")).toBe("#1F2A5A");
    expect(asHex("#1F2A5A")).toBe("#1F2A5A");
    expect(asHex("")).toBeNull();
    expect(asHex("blue")).toBeNull();
    expect(asHex(null)).toBeNull();
  });

  it("flags low contrast with the exact ratio, from code", () => {
    const f = visualFindings(review({ text_color_hex: "F4A261", background_color_hex: "F5F0E6", text_is_large: true }), "Indigo Hours · ₹2,299", pack);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ rule: "KSR-3.4", location: "image", imageFile: "banner.png", quote: "Indigo Hours · ₹2,299", review: "verified" });
    expect(f[0].explanation).toMatch(/1\.8:1.*large text needs at least 3:1/);
  });

  it("uses the stricter limit for normal text and sends near-misses to a person", () => {
    // Indigo on Cotton is fine; a mid grey on white is ~3.9:1: passes for large text, fails for normal text, but is close.
    expect(visualFindings(review({}), "x", pack)).toEqual([]);
    const grey = visualFindings(review({ text_color_hex: "#808080", background_color_hex: "#FFFFFF", text_is_large: false }), "x", pack);
    expect(grey).toHaveLength(1);
    expect(grey[0].review).toBe("needs_review");
    expect(visualFindings(review({ text_color_hex: "#808080", background_color_hex: "#FFFFFF", text_is_large: true }), "x", pack)).toEqual([]);
  });

  it("flags the retired logo for human review and ignores the current one", () => {
    const f = visualFindings(review({ logo: "orange_boxed_wordmark" }), "DHAAGA\nFestive Sale", pack);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ rule: "KSR-3.2", review: "needs_review", quote: "DHAAGA" });
    expect(visualFindings(review({ logo: "indigo_spindle_wordmark" }), "x", pack)).toEqual([]);
    expect(visualFindings(review({ logo: "no_logo" }), "x", pack)).toEqual([]);
  });

  it("does nothing when the model could not inspect the image or the text colours are unreadable", () => {
    expect(visualFindings({ file: "a.png", visual: null, error: "timeout" }, "x", pack)).toEqual([]);
    expect(visualFindings(review({ text_color_hex: "", background_color_hex: "" }), "x", pack)).toEqual([]);
    expect(visualFindings(review({ has_text: false }), "x", pack)).toEqual([]);
  });
});
