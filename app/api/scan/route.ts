import { z } from "zod";
import { DEMO_TODAY, loadBrandPack } from "@/lib/brand-pack";
import { getNvidiaClient, imageToText } from "@/lib/nvidia";
import { reviewDraft } from "@/lib/pipeline";
import { withDeadline } from "@/lib/pipeline/ai-review";
import type { ScannedImage } from "@/lib/scan-types";
import { brandPackSchema } from "@/lib/schemas/brand-pack";

const MAX_IMAGE_DATA_URL = 6_000_000; // ~4.5 MB image
const OCR_DEADLINE_MS = 25_000;

const scanRequest = z.object({
  // Not trimmed: finding spans must line up with the exact text the browser shows.
  text: z
    .string()
    .max(10_000, "Keep drafts under 10,000 characters.")
    .refine((s) => s.trim().length > 0, "Paste some copy to scan."),
  images: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        alt: z.string().max(1000).nullable(),
        /** PNG/JPEG/WebP as a data URL — read with NVIDIA's vision model. */
        dataUrl: z
          .string()
          .regex(/^data:image\/(png|jpeg|webp);base64,/, "Images must be PNG, JPEG or WebP.")
          .max(MAX_IMAGE_DATA_URL, "Image is too large (max ~4.5 MB).")
          .optional(),
        /** Known text for demo images — used only if OCR is off or unavailable. */
        demoText: z.string().max(2000).optional(),
      }),
    )
    .max(4, "Up to 4 images per draft.")
    .default([]),
  ocr: z.boolean().default(true),
  /** Run the NVIDIA AI reviewer + Verifier on top of the code checks. */
  ai: z.boolean().default(true),
  intent: z
    .object({
      purpose: z.string().max(300).optional(),
      audience: z.string().max(300).optional(),
      mustKeep: z.string().max(300).optional(),
    })
    .optional(),
  /** A customised brand pack from the Customise page (validated in full). Defaults to the built-in pack. */
  pack: brandPackSchema.optional(),
  /** Set when re-checking after accepting fixes: the AI findings shown last time ("rule|quote"). */
  recheck: z.object({ aiSeen: z.array(z.string().max(2000)).max(100), accepted: z.array(z.string().max(2000)).max(100).optional() }).optional(),
  /** Date used for expiry checks. Defaults to the demo date. */
  today: z.iso.date().optional(),
});

export type ScanRequest = z.input<typeof scanRequest>;

/** AI review can take several seconds on a long draft. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const started = Date.now();
  let body: z.infer<typeof scanRequest>;
  try {
    body = scanRequest.parse(await request.json());
  } catch (e) {
    const message =
      e instanceof z.ZodError
        ? e.issues
            .slice(0, 4)
            .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
            .join(" · ")
        : "Request body must be JSON.";
    return Response.json({ error: message }, { status: 400 });
  }

  const pack = body.pack ?? loadBrandPack();
  const today = body.today ?? DEMO_TODAY;

  let client: ReturnType<typeof getNvidiaClient> | null = null;
  if (body.ai || (body.ocr && body.images.some((i) => i.dataUrl))) {
    try {
      client = getNvidiaClient();
    } catch {
      // No key: code checks still run, and images fall back to known text.
    }
  }

  // Read text inside images (OCR) with NVIDIA, falling back to known demo text.
  const images: ScannedImage[] = await Promise.all(
    body.images.map(async (img): Promise<ScannedImage> => {
      if (client && body.ocr && img.dataUrl) {
        try {
          // NVIDIA's vision queue can stall for a minute or more; a scan shouldn't. Known text takes over after the deadline.
          const r = await withDeadline(imageToText(client, img.dataUrl), OCR_DEADLINE_MS, "image reading");
          return { name: img.name, text: r.data, textSource: "nvidia", modelId: r.modelId, latencyMs: r.latencyMs };
        } catch {
          // Slow or unavailable: use the banner's known text quietly, or treat the image as having no text.
          return img.demoText ? { name: img.name, text: img.demoText, textSource: "demo" } : { name: img.name, text: "", textSource: "none" };
        }
      }
      if (img.demoText) return { name: img.name, text: img.demoText, textSource: "demo" };
      return { name: img.name, text: "", textSource: "none" };
    }),
  );
  const ocrMs = Date.now() - started;

  // Code checks → mask PII → retrieval → AI review → Verifier (falls back to code checks only).
  const result = await reviewDraft(
    {
      text: body.text,
      images: body.images.map((img, i) => ({ file: img.name, alt: img.alt, text: images[i].text || undefined })),
      intent: body.intent,
    },
    pack,
    { client, ai: body.ai, today, recheck: body.recheck },
  );

  return Response.json({
    ...result,
    images,
    timings: { totalMs: Date.now() - started, ocrMs },
  });
}
