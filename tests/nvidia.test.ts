import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseNvidiaEnv } from "@/lib/env";
import {
  NvidiaClient,
  NvidiaError,
  chat,
  chatJson,
  cosine,
  embed,
  extractJson,
  parseSafety,
  rankVectors,
  stripThinking,
  MODELS,
} from "@/lib/nvidia";
import { maskPII, unmaskPII } from "@/lib/privacy/mask";

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | Error;

/** A fake fetch that replays scripted replies and records each request. */
function fakeFetch(replies: Reply[]) {
  const calls: { url: string; auth: string; body: Record<string, unknown> }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      auth: (init.headers as Record<string, string>).Authorization,
      body: JSON.parse(String(init.body)),
    });
    const r = replies.shift();
    if (!r) throw new Error("no more scripted replies");
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: r.headers });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const client = (replies: Reply[], keys = ["k1", "k2"]) => {
  const f = fakeFetch(replies);
  return { c: new NvidiaClient({ apiKeys: keys, baseUrl: "https://x/v1", fetch: f.impl, sleep: async () => {} }), calls: f.calls };
};
const msg = (content: string | null, reasoning?: string) => ({
  body: { choices: [{ message: { content, reasoning_content: reasoning } }] },
});

describe("env", () => {
  it("collects primary + spare keys, de-duplicated, without needing Supabase", () => {
    const env = parseNvidiaEnv({ NVIDIA_API_KEY: "a", NVIDIA_API_KEY_2: "b", NVIDIA_API_KEY_3: "a", NVIDIA_API_KEY_4: "" });
    expect(env.apiKeys).toEqual(["a", "b"]);
    expect(env.baseUrl).toBe("https://integrate.api.nvidia.com/v1");
  });
});

describe("NvidiaClient", () => {
  it("retries 429 with the next key and reports attempts + model", async () => {
    const { c, calls } = client([{ status: 429, body: { detail: "slow down" } }, msg("OK")]);
    const res = await chat(c, [{ role: "user", content: "hi" }], { model: "fast" });
    expect(res.data).toBe("OK");
    expect(res.modelId).toBe(MODELS.fast);
    expect(res.attempts).toBe(2);
    expect(calls.map((x) => x.auth)).toEqual(["Bearer k1", "Bearer k2"]);
  });

  it("rotates past a bad key without spending a retry", async () => {
    const { c, calls } = client([{ status: 401 }, msg("OK")]);
    const res = await chat(c, [{ role: "user", content: "hi" }]);
    expect(res.attempts).toBe(1);
    expect(calls[1].auth).toBe("Bearer k2");
  });

  it("retries timeouts and 5xx, then gives up with a retryable error", async () => {
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    const { c } = client([timeout, { status: 503 }, { status: 503 }, { status: 503 }]);
    await expect(c.post("/chat/completions", { model: "m" })).rejects.toMatchObject({ retryable: true, status: 503 });
  });

  it("does not retry a 404 (model not available to the account)", async () => {
    const { c, calls } = client([{ status: 404, body: { detail: "Function not found for account" } }]);
    await expect(c.post("/chat/completions", { model: "m" })).rejects.toThrow(/404.*not found/i);
    expect(calls).toHaveLength(1);
  });

  it("refuses to run with no keys", () => {
    expect(() => new NvidiaClient({ apiKeys: [], baseUrl: "x" })).toThrow();
  });
});

describe("chat", () => {
  it("turns thinking off by default and strips inline <think> blocks", async () => {
    const { c, calls } = client([msg("<think>hmm</think> Hello")]);
    const res = await chat(c, [{ role: "user", content: "hi" }]);
    expect(res.data).toBe("Hello");
    expect(calls[0].body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("falls back from reasoning to fast when the main model fails", async () => {
    const { c, calls } = client([{ status: 404 }, msg("from fast")]);
    const res = await chat(c, [{ role: "user", content: "hi" }], { model: "reasoning" });
    expect(res.data).toBe("from fast");
    expect(calls.map((x) => x.body.model)).toEqual([MODELS.reasoning, MODELS.fast]);
  });

  it("treats empty content (all tokens spent thinking) as an error", async () => {
    const { c } = client([msg(null, "lots of thinking")]);
    await expect(chat(c, [{ role: "user", content: "hi" }])).rejects.toMatchObject({ opts: { code: "empty" } });
  });
});

describe("chatJson", () => {
  const Verdict = z.object({ verdict: z.enum(["ok", "issue"]), reason: z.string() });

  it("sends a JSON schema and returns validated data", async () => {
    const { c, calls } = client([msg('```json\n{"verdict":"issue","reason":"needs proof"}\n```')]);
    const res = await chatJson(c, [{ role: "user", content: "?" }], Verdict, { schemaName: "verdict" });
    expect(res.data).toEqual({ verdict: "issue", reason: "needs proof" });
    const rf = calls[0].body.response_format as { type: string; json_schema: { name: string; schema: { type: string } } };
    expect(rf.type).toBe("json_schema");
    expect(rf.json_schema.schema.type).toBe("object");
  });

  it("retries once with the validation error, then succeeds", async () => {
    const { c, calls } = client([msg('{"verdict":"maybe"}'), msg('{"verdict":"ok","reason":"fine"}')]);
    const res = await chatJson(c, [{ role: "user", content: "?" }], Verdict);
    expect(res.data.verdict).toBe("ok");
    const retry = calls[1].body.messages as { content: string }[];
    expect(retry.at(-1)!.content).toMatch(/not valid/);
  });

  it("throws invalid_json after two bad replies — never returns raw output", async () => {
    const { c } = client([msg("nope"), msg("still nope")]);
    await expect(chatJson(c, [{ role: "user", content: "?" }], Verdict)).rejects.toMatchObject({
      opts: { code: "invalid_json" },
    });
  });

  it("extractJson finds JSON inside prose", () => {
    expect(extractJson('Sure! {"a": 1} hope that helps')).toEqual({ a: 1 });
    expect(stripThinking("reasoning...</think>answer")).toBe("answer");
  });
});

describe("embeddings and ranking", () => {
  it("batches, keeps order, and asks for 1024 dimensions", async () => {
    const { c, calls } = client([
      { body: { data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] } },
      { body: { data: [{ index: 0, embedding: [1, 1] }] } },
    ]);
    const res = await embed(c, ["a", "b", "c"], "passage", { batchSize: 2 });
    expect(res.data).toEqual([[1, 0], [0, 1], [1, 1]]);
    expect(calls[0].body).toMatchObject({ input: ["a", "b"], input_type: "passage", dimensions: 1024 });
  });

  it("cosine and rankVectors order by similarity", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(rankVectors([1, 0], [[0, 1], [1, 0.1], [0.5, 0.5]]).map((r) => r.index)).toEqual([1, 2, 0]);
  });
});

describe("safety parsing", () => {
  it("reads both guard formats", () => {
    expect(parseSafety('{"User Safety": "safe"}')).toEqual({ safe: true, categories: [] });
    expect(parseSafety('{"User Safety": "unsafe", "Safety Categories": "Violence, Hate"}')).toEqual({
      safe: false,
      categories: ["Violence", "Hate"],
    });
    expect(parseSafety("unsafe\nS1,S10")).toEqual({ safe: false, categories: ["S1", "S10"] });
    expect(() => parseSafety("maybe")).toThrow();
  });
});

describe("PII masking", () => {
  it("masks emails, phones, PAN, Aadhaar, cards, UPI and marked spans — not prices", () => {
    const text =
      "Mail meera@dhaaga.example or call +91 98765 43210. PAN ABCDE1234F, Aadhaar 2345 6789 0123, " +
      "card 4111 1111 1111 1111, UPI meera@okaxis. Secret: [[launch on 1 Dec]]. Now ₹1,499, free above ₹2299.";
    const { masked, tokens } = maskPII(text);
    expect(masked).not.toMatch(/meera@|98765|ABCDE1234F|2345 6789|4111|launch on/);
    expect(masked).toContain("₹1,499");
    expect(masked).toContain("₹2299");
    expect(tokens.map((t) => t.type).sort()).toEqual(["AADHAAR", "CARD", "EMAIL", "MARKED", "PAN", "PHONE", "UPI"]);
    expect(unmaskPII(masked, tokens)).toBe(text.replace("[[launch on 1 Dec]]", "launch on 1 Dec"));
  });

  it("leaves clean copy untouched", () => {
    const text = "Free shipping on orders above ₹1,499. Rated 4.6 out of 5 by 18,000 customers.";
    expect(maskPII(text)).toEqual({ masked: text, tokens: [] });
  });
});

describe("errors", () => {
  it("NvidiaError exposes status and retryable", () => {
    const e = new NvidiaError("x", { status: 429, retryable: true });
    expect(e.status).toBe(429);
    expect(e.retryable).toBe(true);
  });
});
