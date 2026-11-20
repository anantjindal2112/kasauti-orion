import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import protobuf from "protobufjs";
import { SPEECH, type Lang } from "@/lib/nvidia/config";

/** The part of NVIDIA Riva's speech-recognition API we use (field numbers match riva_asr.proto). */
const PROTO = `
syntax = "proto3";
package nvidia.riva.asr;
message RecognitionConfig {
  int32 encoding = 1;
  int32 sample_rate_hertz = 2;
  string language_code = 3;
  int32 max_alternatives = 4;
  int32 audio_channel_count = 7;
  bool enable_automatic_punctuation = 11;
}
message RecognizeRequest { RecognitionConfig config = 1; bytes audio = 2; }
message SpeechRecognitionAlternative { string transcript = 1; float confidence = 2; }
message SpeechRecognitionResult { repeated SpeechRecognitionAlternative alternatives = 1; int32 channel_tag = 2; }
message RecognizeResponse { repeated SpeechRecognitionResult results = 1; }
service RivaSpeechRecognition { rpc Recognize(RecognizeRequest) returns (RecognizeResponse); }
`;

interface RecognizeResponse {
  results?: { alternatives?: { transcript?: string; confidence?: number }[] }[];
}
type Recognize = (
  req: unknown,
  md: grpc.Metadata,
  opts: { deadline: Date },
  cb: (err: grpc.ServiceError | null, res?: RecognizeResponse) => void,
) => void;

let cached: { Recognize: Recognize } | undefined;

function client() {
  if (cached) return cached;
  const root = protobuf.parse(PROTO, { keepCase: true }).root;
  const def = protoLoader.fromJSON(root.toJSON(), { keepCase: true, defaults: true });
  const pkg = grpc.loadPackageDefinition(def) as unknown as {
    nvidia: { riva: { asr: { RivaSpeechRecognition: new (addr: string, creds: grpc.ChannelCredentials) => { Recognize: Recognize } } } };
  };
  const c = new pkg.nvidia.riva.asr.RivaSpeechRecognition(SPEECH.server, grpc.credentials.createSsl());
  cached = { Recognize: c.Recognize.bind(c) };
  return cached;
}

export class SpeechError extends Error {
  constructor(
    message: string,
    /** Worth trying another API key (rate limit, bad key, service busy). */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface Transcript {
  text: string;
  confidence: number | null;
  modelId: string;
  latencyMs: number;
}

/** Transcribe a 16 kHz mono 16-bit WAV file (header included). Tries each key until one works. */
export async function transcribeWav(wav: Buffer, apiKeys: string[], lang: Lang, timeoutMs = 25_000): Promise<Transcript> {
  let last: SpeechError | null = null;
  for (const key of apiKeys) {
    const started = Date.now();
    try {
      const md = new grpc.Metadata();
      md.set("function-id", SPEECH.functionId);
      md.set("authorization", `Bearer ${key}`);
      const res = await new Promise<RecognizeResponse>((resolve, reject) => {
        client().Recognize(
          { config: { encoding: 0, language_code: SPEECH.languageCode[lang], max_alternatives: 1, audio_channel_count: 1, enable_automatic_punctuation: true }, audio: wav },
          md,
          { deadline: new Date(Date.now() + timeoutMs) },
          (err, r) => (err ? reject(err) : resolve(r ?? {})),
        );
      });
      const alts = (res.results ?? []).flatMap((r) => (r.alternatives?.[0] ? [r.alternatives[0]] : []));
      const text = alts.map((a) => a.transcript ?? "").join(" ").replace(/\s+/g, " ").trim();
      const conf = alts.length ? alts.reduce((s, a) => s + (a.confidence ?? 0), 0) / alts.length : null;
      return { text, confidence: conf, modelId: SPEECH.model, latencyMs: Date.now() - started };
    } catch (e) {
      const code = (e as grpc.ServiceError).code;
      const retryable = [grpc.status.UNAUTHENTICATED, grpc.status.PERMISSION_DENIED, grpc.status.RESOURCE_EXHAUSTED, grpc.status.UNAVAILABLE, grpc.status.DEADLINE_EXCEEDED].includes(code);
      last = new SpeechError(e instanceof Error ? e.message.slice(0, 160) : "speech request failed", retryable);
      if (!retryable) break;
    }
  }
  throw last ?? new SpeechError("No NVIDIA key is configured.", false);
}
