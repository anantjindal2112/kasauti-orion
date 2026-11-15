import { z } from "zod";
import { DEMO_TODAY, loadBrandPack } from "@/lib/brand-pack";
import { runCodeChecks } from "@/lib/checks";
import { planFixAll } from "@/lib/fixes/plan";
import { rewriteDraft } from "@/lib/fixes/rewrite";
import { askImage, getNvidiaClient } from "@/lib/nvidia";
import { withDeadline } from "@/lib/pipeline/ai-review";
import type { FixAllResponse } from "@/lib/scan-types";
import { brandPackSchema } from "@/lib/schemas/brand-pack";
import { findingSchema } from "@/lib/schemas/finding";

/**
 * "Accept all fixes". Takes the draft and the open findings, returns the draft with all of them
 * fixed (one verified rewrite, or the span-by-span fixes) and alt text for images that had none.
 * Nothing here publishes anything: the scanner shows the result as a new version and re-checks it.
 */

const request = z.object({
  text: z.string().min(1).max(10_000),
  findings: z.array(findingSchema).max(60),
  images: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        dataUrl: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).max(6_000_000),
      }),
    )
    .max(4)
    .default([]),
  intent: z.object({ purpose: z.string().max(300).optional(), audience: z.string().max(300).optional(), mustKeep: z.string().max(300).optional() }).optional(),
  pack: brandPackSchema.optional(),
  today: z.iso.date().optional(),
});

const ALT_PROMPT =
  "Write alt text for this marketing image for a screen-reader user: one plain sentence under 140 characters that says what the image shows " +
  "and any offer or price written on it. No 'image of'. Output only the alt text.";

export const maxDuration = 60;

export async function POST(req: Request) {
  let body: z.infer<typeof request>;
  try {
    body = request.parse(await req.json());
  } catch {
    return Response.json({ error: "Couldn't read the fix request." }, { status: 400 });
  }
  const pack = body.pack ?? loadBrandPack();
  const today = body.today ?? DEMO_TODAY;
  const plan = planFixAll(body.text, body.findings, pack, today);

  let client: ReturnType<typeof getNvidiaClient> | null = null;
  try {
    client = getNvidiaClient();
  } catch {
    // No key: the span-by-span fixes are the answer.
  }

  const [rewrite, alts] = await Promise.all([
    client
      ? rewriteDraft({ client, pack, draft: body.text, issues: body.findings, planText: plan.text, intent: body.intent, today })
      : Promise.resolve({ text: plan.text, source: "plan" as const }),
    Promise.all(
      body.images.map(async (img) => {
        if (!client) return null;
        try {
          const r = await withDeadline(askImage(client, img.dataUrl, ALT_PROMPT), 20_000, "alt text");
          const alt = r.data.replace(/^["“]|["”]$/g, "").trim();
          // Keep it only if it passes the alt-text check (not empty, not a file name).
          const ok = alt.length > 5 && alt.length < 300 && !runCodeChecks({ text: ".", images: [{ file: img.name, alt }] }, pack, { today }).findings.some((f) => f.rule === "KSR-5.1");
          return ok ? { name: img.name, alt } : null;
        } catch {
          return null;
        }
      }),
    ),
  ]);

  const res: FixAllResponse = {
    text: rewrite.text,
    source: rewrite.source,
    ...("modelId" in rewrite && rewrite.modelId ? { modelId: rewrite.modelId } : {}),
    alts: alts.filter((a): a is { name: string; alt: string } => a !== null),
  };
  return Response.json(res);
}
