import { isExpired, loadBrandPack, loadTestSet } from "@/lib/brand-pack";
import type { DemoDraft, EvidenceInfo, RuleInfo } from "@/lib/scan-types";

/** testset/images/foo.svg → /testset/foo.png (rasterised copy in public/) */
export const publicImage = (file: string) => `/testset/${file.split("/").at(-1)!.replace(/\.svg$/, ".png")}`;

/** Test-set drafts in a browser-friendly shape for the scanner's "load a demo" picker. */
export function demoDrafts(): DemoDraft[] {
  return loadTestSet().map((d) => ({
    id: d.id,
    title: d.title,
    channel: d.channel,
    author: d.author,
    text: d.text,
    intent: d.intent,
    images: d.images.map((i) => ({
      name: i.file.split("/").at(-1)!.replace(/\.svg$/, ".png"),
      src: publicImage(i.file),
      alt: i.alt,
      demoText: i.textInImage,
    })),
    expectedCount: d.expected.length,
  }));
}

export function ruleIndex(): Record<string, RuleInfo> {
  return Object.fromEntries(
    loadBrandPack().rules.map((r) => [r.code, { code: r.code, title: r.title, layer: r.layer, checkType: r.checkType }]),
  );
}

export function evidenceIndex(): Record<string, EvidenceInfo> {
  return Object.fromEntries(
    loadBrandPack().evidence.map((e) => [
      e.code,
      { code: e.code, title: e.title, claim: e.claim, source: e.source, expiresAt: e.expiresAt, expired: isExpired(e) },
    ]),
  );
}

export const formatDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Big drafts packed with problems, for trying the scanner by hand. Not scored (no answer key). */
export function stressDrafts(): DemoDraft[] {
  return [
    {
      id: "X1",
      title: "Everything wrong: the festive mega-ad",
      channel: "instagram",
      author: "Stress test",
      text:
        "🔥🔥🔥 HUGE FESTIVE NEWS from Dhaga and Co!!! India's most trusted bedsheet brand is back with our #1 sale ever: 20% off everything, today only. " +
        "Every Dhaaga & Co. product is GOTS-certified organic cotton and Monsoon Weave is OEKO-TEX Standard 100 certified, so it's 100% safe for your baby. " +
        "Our eco-friendly, award-winning towels have colours that never fade, guaranteed. They're cheap, honestly a miracle, and softer than LoomKart sheets. " +
        "The Monsoon Weave set is back at just ₹1,799, the Indigo Hour set is Rs. 2299/-, and there's free shipping on all orders above ₹999. " +
        "Made by our workers in Panipat. Rated 4.6 out of 5 by more than 18,000 customers. Don't miss out or regret it! " +
        "Shop now, follow us on Instagram, refer a friend and download our app. Questions? Mail care@dhaaga.example or call +91 98765 43210. " +
        "Click here to shop. #festivesale #monsoonweave",
      intent: { purpose: "Festive-sale orders", audience: "Existing customers, casual", mustKeep: ["urgency", "20% offer", "free shipping"] },
      images: [],
      expectedCount: 0,
    },
    {
      id: "X2",
      title: "Subtle problems only the AI can judge",
      channel: "email",
      author: "Stress test",
      text:
        "Your new favourite set is here. The Kesar Collection and our whole towel range are GOTS-certified organic cotton, sustainable from field to fold. " +
        "Award-winning design, now 20% off. Each piece is handwoven in Panipat and Varanasi and dyed with azo-free dyes. " +
        "Shop the sale, follow us for daily inspiration and join our newsletter for early access.",
      intent: { purpose: "Festive sale email", audience: "Newsletter subscribers", mustKeep: ["20% off", "handwoven story"] },
      images: [],
      expectedCount: 0,
    },
  ];
}
