import { z } from "zod";
import type { BrandPack } from "@/lib/brand-pack";
import { contrastRatio } from "@/lib/checks/contrast";
import { askImageJson } from "@/lib/nvidia/vision";
import type { NvidiaClient } from "@/lib/nvidia/client";
import { withDeadline } from "@/lib/pipeline/ai-review";
import type { Finding } from "@/lib/schemas/finding";

/** What the vision model is asked to report about a banner. Code makes every decision from these answers. */
const visualSchema = z.object({
  has_text: z.boolean().describe("true if the image contains readable text"),
  text_color_hex: z.string().nullable().describe("6-digit hex of the colour of the main text, e.g. #1F2A5A; null if no text"),
  background_color_hex: z.string().nullable().describe("6-digit hex of the colour directly behind that text; null if no text"),
  text_is_large: z.boolean().describe("true if the main text is large: about 24px or bigger on an 800px-wide banner, or bold and about 19px or bigger"),
  logo: z.enum(["indigo_spindle_wordmark", "orange_boxed_wordmark", "other_logo", "no_logo"]),
});
export type Visual = z.infer<typeof visualSchema>;

/** Models write hex with or without the "#", sometimes empty. Returns "#RRGGBB" or null. */
export const asHex = (h: string | null | undefined): string | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec((h ?? "").trim());
  return m ? `#${m[1].toUpperCase()}` : null;
};

function promptFor(pack: BrandPack): string {
  const logos = pack.assets.logos.map((l) => `- ${l.version === "v3" ? "indigo_spindle_wordmark" : "orange_boxed_wordmark"}: ${l.description}`).join("\n");
  return [
    "You are inspecting a marketing banner for a brand-review tool. Report only what you can see. Reply with JSON only.",
    "text_color_hex: the colour of the main (largest or most important) text. background_color_hex: the colour right behind that text. Give both as 6-digit hex.",
    "logo: which logo, if any, appears in the image:",
    logos,
    "- other_logo: some other logo or mark.  - no_logo: no logo at all (plain text such as a headline is NOT a logo).",
    "If you are unsure whether a logo is present, choose no_logo.",
  ].join("\n");
}

export interface ImageReview {
  file: string;
  visual: Visual | null;
  error?: string;
  latencyMs?: number;
  modelId?: string;
}

/** Ask the vision model what the banner looks like. Never throws: a failure just means no image review for that image. */
export async function inspectImage(client: NvidiaClient, file: string, dataUrl: string, pack: BrandPack): Promise<ImageReview> {
  try {
    const res = await withDeadline(askImageJson(client, dataUrl, promptFor(pack), visualSchema, "kasauti_visual"), 25_000, "image inspection");
    return { file, visual: res.data, latencyMs: res.latencyMs, modelId: res.modelId };
  } catch (e) {
    return { file, visual: null, error: e instanceof Error ? e.message.slice(0, 120) : "image inspection failed" };
  }
}

/**
 * Turn what the model saw into findings. Contrast is arithmetic (WCAG ratio from the two colours); the logo verdict is the
 * model's, so it goes to a person. `text` is the OCR text of the image, used to give the finding a real quote.
 */
export function visualFindings(review: ImageReview, text: string, pack: BrandPack): Finding[] {
  const v = review.visual;
  if (!v) return [];
  const sev = (rule: string) => pack.rules.find((r) => r.code === rule)?.severity;
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? review.file;
  const quote = line.slice(0, 80);
  const start = Math.max(0, text.indexOf(quote));
  const span = { start, end: start + quote.length };
  const out: Finding[] = [];

  const contrastSev = sev("KSR-3.4");
  const fg = asHex(v.text_color_hex);
  const bg = asHex(v.background_color_hex);
  if (contrastSev && v.has_text && fg && bg) {
    const ratio = contrastRatio(fg, bg);
    const need = v.text_is_large ? pack.assets.contrast.largeText : pack.assets.contrast.normalText;
    if (ratio < need) {
      out.push({
        id: `img:KSR-3.4:${review.file}`,
        rule: "KSR-3.4",
        quote,
        location: "image",
        span,
        imageFile: review.file,
        explanation: `The text colour ${fg} on ${bg} has a contrast of ${ratio.toFixed(1)}:1; ${v.text_is_large ? "large" : "normal"} text needs at least ${need}:1 (WCAG AA).`,
        suggestedFix: null,
        confidence: ratio < need * 0.75 ? 0.9 : 0.65,
        severity: contrastSev,
        source: "ai",
        modelId: review.modelId ?? null,
        // The ratio is exact, but the two colours are the model's reading of the picture: only a clear miss is shown as verified.
        review: ratio < need * 0.75 ? "verified" : "needs_review",
        reviewNote: ratio < need * 0.75 ? undefined : "The contrast is close to the limit and the colours were read by a model: please check the banner.",
      });
    }
  }

  const logoSev = sev("KSR-3.2");
  if (logoSev && v.logo === "orange_boxed_wordmark") {
    out.push({
      id: `img:KSR-3.2:${review.file}`,
      rule: "KSR-3.2",
      quote,
      location: "image",
      span,
      imageFile: review.file,
      explanation: "The banner shows the retired logo (v2, the orange boxed wordmark, retired on 31 Dec 2025). The current logo is v3: the indigo spindle mark with the wordmark.",
      suggestedFix: null,
      confidence: 0.75,
      severity: logoSev,
      source: "ai",
      modelId: review.modelId ?? null,
      review: "needs_review",
      reviewNote: "The vision model read this as the retired logo. A person should confirm before the banner is replaced.",
    });
  }
  return out;
}
