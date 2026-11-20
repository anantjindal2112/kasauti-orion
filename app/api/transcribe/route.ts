import { loadBrandPack } from "@/lib/brand-pack";
import { parseNvidiaEnv } from "@/lib/env";
import { getNvidiaClient } from "@/lib/nvidia";
import { LANGUAGES, type Lang } from "@/lib/nvidia/config";
import { SpeechError, transcribeWav } from "@/lib/nvidia/speech";
import { translateText } from "@/lib/nvidia/translate";
import { normalizeSpokenEnglish } from "@/lib/speech/normalize";
import { normalizeSpokenHindi } from "@/lib/speech/normalize-hindi";

/** 60 s of 16 kHz mono 16-bit audio is about 1.9 MB; stay under the platform's request limit. */
const MAX_BYTES = 2_400_000;
export const maxDuration = 40;

/** Reads the header of a WAV file; the browser always sends 16 kHz mono 16-bit, so anything else is rejected. */
function wavProblem(b: Buffer): string | null {
  if (b.length < 44 || b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") return "Send a WAV file.";
  const format = b.readUInt16LE(20);
  const channels = b.readUInt16LE(22);
  const rate = b.readUInt32LE(24);
  const bits = b.readUInt16LE(34);
  if (format !== 1 || channels !== 1 || rate !== 16_000 || bits !== 16) return "Audio must be 16 kHz mono 16-bit WAV.";
  if (b.length - 44 < 3_200) return "That recording is too short to transcribe.";
  return null;
}

const asLang = (v: string | null, fallback: Lang): Lang | null => (v === null ? fallback : (LANGUAGES as readonly string[]).includes(v) ? (v as Lang) : null);

export async function POST(request: Request) {
  // English and Hindi only: `from` is the language spoken, `to` is the language of the text you want back.
  const params = new URL(request.url).searchParams;
  const from = asLang(params.get("from"), "en");
  const to = from ? asLang(params.get("to"), from) : null;
  if (!from || !to) return Response.json({ error: "Only English (en) and Hindi (hi) are supported." }, { status: 400 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return Response.json({ error: "Recording is too long (60 seconds at most)." }, { status: 413 });
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length > MAX_BYTES) return Response.json({ error: "Recording is too long (60 seconds at most)." }, { status: 413 });
  const problem = wavProblem(body);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  let keys: string[];
  try {
    keys = parseNvidiaEnv().apiKeys;
  } catch {
    return Response.json({ error: "NVIDIA key not configured on the server." }, { status: 503 });
  }

  try {
    const t = await transcribeWav(body, keys, from);
    if (!t.text) return Response.json({ error: "No speech was heard in that recording." }, { status: 422 });
    // Spoken numbers become digits first, so prices and percentages survive translation and can be checked.
    let text = from === "en" ? normalizeSpokenEnglish(t.text) : normalizeSpokenHindi(t.text);
    let translation: { modelId: string; latencyMs: number } | null = null;
    if (to !== from) {
      const brand = loadBrandPack().brand;
      const tr = await translateText(getNvidiaClient(), text, from, to, [brand.name, ...brand.products]);
      text = tr.text;
      translation = { modelId: tr.modelId, latencyMs: tr.latencyMs };
    }
    // English text from a translation: number words become digits, so the Claim Ledger can check them.
    if (to === "en") text = normalizeSpokenEnglish(text);
    return Response.json({ text, raw: t.text, from, to, translated: !!translation, modelId: t.modelId, translateModelId: translation?.modelId ?? null, latencyMs: t.latencyMs + (translation?.latencyMs ?? 0), confidence: t.confidence });
  } catch (e) {
    const msg = e instanceof SpeechError || (e instanceof Error && /translat/i.test(e.message)) ? (e as Error).message : "Transcription failed.";
    return Response.json({ error: `Couldn't transcribe: ${msg}` }, { status: 502 });
  }
}
