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
      {
        code: e.code,
        title: e.title,
        claim: e.claim,
        source: e.source,
        expiresAt: e.expiresAt,
        expired: isExpired(e),
        verifiedAt: e.verifiedAt,
        owner: `${e.owner.name} (${e.owner.role})`,
      },
    ]),
  );
}

export const formatDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * The three examples shown in "Scan a draft". Between them they exercise every feature:
 * S1 voice, terms, offers, CTAs, accessibility + a banner read by OCR; S2 facts, certificates,
 * AI judgement, PII masking and the Claim Ledger; S3 a clean post where everything is verified.
 * (The 18 scored test drafts stay on the Test set page and still open here by link.)
 */
export function showcaseDrafts(): DemoDraft[] {
  return [
    {
      id: "S1",
      title: "Festive sale post — everything a rushed agency gets wrong",
      channel: "instagram",
      author: "Agency draft",
      text:
        "🔥🔥🔥 HUGE FESTIVE NEWS from Dhaga and Co!!! India's most trusted bedsheet brand is back with 30% off everything. " +
        "Free shipping on all orders above ₹999, and the Indigo Hour set is just Rs. 2299/-. " +
        "Cheap sheets that feel premium, softer than LoomKart, with colours that never fade, guaranteed. Made by our workers in Panipat. " +
        "Don't miss out or regret it! Shop now, follow us on Instagram and download our app. Click here to shop. #festivesale #indigohours",
      intent: { purpose: "Festive-sale orders", audience: "Existing customers, casual", mustKeep: ["urgency", "festive sale", "free shipping"] },
      images: [
        {
          name: "festive-sale-banner.webp",
          src: "/showcase/festive-sale-banner.webp",
          alt: null,
          demoText: "Dhaaga & Co.\nFESTIVE SALE\n30% OFF EVERYTHING\nFree shipping above ₹999\nIndia's #1 bedsheet brand",
        },
      ],
      expectedCount: 0,
      shows: [
        "Voice: stacked !!!, ALL CAPS, emoji, pressure phrase",
        "Terms: brand name, product name, “workers”, banned word, price format",
        "Claim Ledger: stale ₹999 shipping, contradicted 30% off, unproven “most trusted” (try Add proof)",
        "Absolute promises, competitor mention, “Click here”, lowercase hashtags",
        "AI: offer with no end date, four calls to action",
        "Banner: NVIDIA reads the text in the image — stale ₹999, 30% and “#1” flagged there too — and the missing alt text",
        "Accept all fixes → new version, re-scanned",
      ],
    },
    {
      id: "S2",
      title: "Brand story email — facts and proof",
      channel: "email",
      author: "In-house writer",
      text:
        "Dhaaga & Co. hereby announces the availability of premium bed linen solutions engineered to optimise consumer sleep outcomes through advanced textile methodologies. " +
        "Weaving since 2012, we work with 2,000 artisans, and every sheet is handwoven in Panipat and Varanasi. " +
        "Every Dhaaga & Co. product is GOTS-certified organic cotton, and Monsoon Weave is OEKO-TEX Standard 100 certified. " +
        "Our award-winning, eco-friendly Monsoon Weave set is now ₹1,799, rated 4.8 out of 5 by 25,000 customers, with 30-day returns. " +
        "Questions? Email care@dhaaga.example or call +91 98765 43210. Shop Monsoon Weave.",
      intent: { purpose: "Brand trust + Monsoon Weave sales", audience: "Newsletter subscribers", mustKeep: ["handwoven story", "Monsoon Weave"] },
      images: [
        {
          name: "monsoon-weave-email.webp",
          src: "/showcase/monsoon-weave-email.webp",
          alt: "IMG_2041.png",
          demoText: "Dhaaga & Co.\nThe Monsoon Weave\nNow ₹1,799\nOEKO-TEX Standard 100 certified\nRated 4.8/5 by 25,000 customers",
        },
      ],
      expectedCount: 0,
      shows: [
        "Contradicted facts fixed from the ledger: founding year, artisan count, rating, review count, return window",
        "Stale price (₹1,799 → ₹1,999) and an expired certificate (OEKO-TEX)",
        "AI + Verifier: GOTS stretched to every product, “award-winning” with no award named, vague “eco-friendly”",
        "AI finds a claim in plain words and verifies it: “handwoven in Panipat and Varanasi” (KLE-13)",
        "Readability + corporate voice",
        "Email and phone masked before any model sees the draft (see ai_disclosure.txt)",
        "Email banner: stale price, expired certificate and wrong rating read out of the image; a file name used as alt text",
      ],
    },
    {
      id: "S3",
      title: "Restock post — clean, every claim verified",
      channel: "instagram",
      author: "Brand team",
      text:
        "Settle in, the Monsoon Weave is back. 300 thread count cotton, handwoven by artisans in Panipat and Varanasi, now ₹1,999. " +
        "Our festive sale gives you 20% off sitewide until 16 November (not valid on gift cards), and free shipping on orders above ₹1,499. " +
        "Rated 4.6 out of 5 by more than 18,000 customers. Shop Monsoon Weave.",
      intent: { purpose: "Restock awareness", audience: "Followers, warm", mustKeep: ["back in stock", "₹1,999"] },
      images: [
        {
          name: "monsoon-weave-restock.webp",
          src: "/showcase/monsoon-weave-restock.webp",
          alt: "Indigo striped Monsoon Weave bedsheet set on a sunlit bed, with the price ₹1,999 and the festive offer",
          demoText: "Dhaaga & Co.\nThe Monsoon Weave is back\n₹1,999\n20% off sitewide until 16 November\nFree shipping above ₹1,499",
        },
      ],
      expectedCount: 0,
      shows: [
        "No findings: Kasauti stays quiet when copy is right",
        "Claim Ledger: every price, offer, rating and the handwoven claim verified with its entry",
        "Expiry warning: the 20% festive offer’s proof runs out in days",
        "Clean banner with real alt text: the image passes too",
      ],
    },
  ];
}
