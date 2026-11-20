import { parseNvidiaEnv } from "@/lib/env";
import { SpeechError, transcribeWav } from "@/lib/nvidia/speech";
import { normalizeSpokenEnglish } from "@/lib/speech/normalize";

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

export async function POST(request: Request) {
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
    const t = await transcribeWav(body, keys);
    if (!t.text) return Response.json({ error: "No speech was heard in that recording." }, { status: 422 });
    // Spoken numbers become digits (English), so prices and percentages can be checked against the ledger.
    const text = normalizeSpokenEnglish(t.text);
    return Response.json({ text, raw: t.text, modelId: t.modelId, latencyMs: t.latencyMs, confidence: t.confidence });
  } catch (e) {
    const msg = e instanceof SpeechError ? e.message : "Transcription failed.";
    return Response.json({ error: `Couldn't transcribe: ${msg}` }, { status: 502 });
  }
}
