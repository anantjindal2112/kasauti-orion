import { z } from "zod";
import { loadBrandPack } from "@/lib/brand-pack";
import { runCodeChecks } from "@/lib/checks";
import { getNvidiaClient, imageToText } from "@/lib/nvidia";
import type { ScannedImage } from "@/lib/scan-types";

const MAX_IMAGE_DATA_URL = 6_000_000; // ~4.5 MB image

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
});

export type ScanRequest = z.input<typeof scanRequest>;

export async function POST(request: Request) {
  const started = Date.now();
  let body: z.infer<typeof scanRequest>;
  try {
    body = scanRequest.parse(await request.json());
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues.map((i) => i.message).join(" ") : "Request body must be JSON.";
    return Response.json({ error: message }, { status: 400 });
  }

  const pack = loadBrandPack();

  // Read text inside images (OCR) with NVIDIA, falling back to known demo text.
  let client: ReturnType<typeof getNvidiaClient> | null = null;
  let clientProblem: string | undefined;
  if (body.ocr && body.images.some((i) => i.dataUrl)) {
    try {
      client = getNvidiaClient();
    } catch {
      clientProblem = "NVIDIA key not configured";
    }
  }

  const images: ScannedImage[] = await Promise.all(
    body.images.map(async (img): Promise<ScannedImage> => {
      if (client && img.dataUrl) {
        try {
          const r = await imageToText(client, img.dataUrl);
          return { name: img.name, text: r.data, textSource: "nvidia", modelId: r.modelId, latencyMs: r.latencyMs };
        } catch (e) {
          const note = `Image reading failed (${e instanceof Error ? e.message.slice(0, 120) : "error"}).`;
          return img.demoText
            ? { name: img.name, text: img.demoText, textSource: "demo", note: `${note} Used known demo text.` }
            : { name: img.name, text: "", textSource: "none", note };
        }
      }
      if (img.demoText) {
        return { name: img.name, text: img.demoText, textSource: "demo", note: clientProblem ?? (body.ocr ? undefined : "OCR turned off") };
      }
      return { name: img.name, text: "", textSource: "none", note: clientProblem ?? "No image data to read." };
    }),
  );
  const ocrMs = Date.now() - started;

  const result = runCodeChecks(
    {
      text: body.text,
      images: body.images.map((img, i) => ({ file: img.name, alt: img.alt, text: images[i].text || undefined })),
    },
    pack,
  );

  return Response.json({
    ...result,
    images,
    timings: { totalMs: Date.now() - started, ocrMs },
  });
}
