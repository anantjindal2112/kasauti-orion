import { parseNvidiaEnv } from "@/lib/env";
import { DEFAULT_TIMEOUT_MS } from "@/lib/nvidia/config";

export class NvidiaError extends Error {
  constructor(
    message: string,
    readonly opts: { status?: number; retryable: boolean; model?: string; code?: string } = { retryable: false },
  ) {
    super(message);
    this.name = "NvidiaError";
  }
  get status() {
    return this.opts.status;
  }
  get retryable() {
    return this.opts.retryable;
  }
}

/** Every call reports which model answered and how long it took (for AI disclosure + logs). */
export interface NvidiaResult<T> {
  data: T;
  modelId: string;
  latencyMs: number;
  attempts: number;
}

export interface ClientOptions {
  apiKeys: string[];
  baseUrl: string;
  fetch?: typeof fetch;
  /** Retries after the first attempt. */
  maxRetries?: number;
  timeoutMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  baseDelayMs?: number;
}

export interface RequestOptions {
  timeoutMs?: number;
  /** Full URL instead of baseUrl + path (some NVIDIA services live on other hosts). */
  url?: string;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
/** A bad or unauthorised key: worth trying the next key once. */
const KEY_STATUS = new Set([401, 403]);

export class NvidiaClient {
  private keyIndex = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: ClientOptions) {
    if (typeof window !== "undefined") throw new Error("NvidiaClient is server-only: never ship API keys to the browser.");
    if (!opts.apiKeys.length) throw new Error("NvidiaClient needs at least one API key.");
    this.fetchImpl = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  get keyCount() {
    return this.opts.apiKeys.length;
  }

  private rotateKey() {
    this.keyIndex = (this.keyIndex + 1) % this.opts.apiKeys.length;
  }

  /**
   * POST JSON with timeout, retry + exponential backoff (honouring Retry-After),
   * and key rotation on 429 / 401 / 403.
   */
  async post<T>(path: string, body: Record<string, unknown>, ro: RequestOptions = {}): Promise<NvidiaResult<T>> {
    const model = typeof body.model === "string" ? body.model : "unknown";
    const maxRetries = this.opts.maxRetries ?? 3;
    const url = ro.url ?? `${this.opts.baseUrl}${path}`;
    const started = Date.now();
    let keyFailures = 0;
    let lastError: NvidiaError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.opts.apiKeys[this.keyIndex]}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(ro.timeoutMs ?? this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });
      } catch (e) {
        const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        lastError = new NvidiaError(timedOut ? `${model} timed out` : `Network error calling ${model}: ${String(e)}`, {
          retryable: true,
          model,
          code: timedOut ? "timeout" : "network",
        });
        await this.backoff(attempt);
        continue;
      }

      if (res.ok) {
        const data = (await res.json()) as T;
        return { data, modelId: model, latencyMs: Date.now() - started, attempts: attempt + 1 };
      }

      const detail = await readDetail(res);
      if (KEY_STATUS.has(res.status) && keyFailures < this.opts.apiKeys.length - 1) {
        keyFailures++;
        this.rotateKey();
        attempt--; // a bad key isn't the model's fault; don't spend a retry on it
        continue;
      }
      const retryable = RETRYABLE_STATUS.has(res.status);
      lastError = new NvidiaError(`${model} → HTTP ${res.status}: ${detail}`, { status: res.status, retryable, model });
      if (!retryable) throw lastError;
      if (res.status === 429) this.rotateKey();
      await this.backoff(attempt, res.headers.get("retry-after"));
    }
    throw lastError ?? new NvidiaError(`${model} failed`, { retryable: false, model });
  }

  private async backoff(attempt: number, retryAfter?: string | null) {
    const fromHeader = retryAfter ? Number(retryAfter) * 1000 : NaN;
    const base = this.opts.baseDelayMs ?? 500;
    const ms = Number.isFinite(fromHeader) ? Math.min(fromHeader, 20_000) : base * 2 ** attempt + Math.random() * base;
    await this.sleep(ms);
  }
}

async function readDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text);
    return String(j.detail ?? j.message ?? j.error?.message ?? j.title ?? text).slice(0, 300);
  } catch {
    return text.slice(0, 300) || res.statusText;
  }
}

let shared: NvidiaClient | undefined;

/** The app-wide client, built from env on first use. */
export function getNvidiaClient(): NvidiaClient {
  shared ??= new NvidiaClient(parseNvidiaEnv());
  return shared;
}
