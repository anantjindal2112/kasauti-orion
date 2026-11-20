import { z } from "zod";
import { NvidiaError, type NvidiaClient, type NvidiaResult } from "@/lib/nvidia/client";
import { resolveModel, type ModelRole } from "@/lib/nvidia/config";

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface ChatOptions {
  model?: ModelRole | string;
  maxTokens?: number;
  temperature?: number;
  /**
   * Let reasoning models "think" before answering. Off by default: on our account it turns
   * 4–33 s answers into 1–4 s ones with the same verdicts (docs/nvidia-models.md).
   */
  thinking?: boolean;
  timeoutMs?: number;
  /** Model to try once if the main one fails. Defaults to `fast` when the main model is `reasoning`. */
  fallback?: ModelRole | string | null;
  /** Extra body fields (e.g. response_format). */
  extra?: Record<string, unknown>;
}

interface ChatResponse {
  choices?: { message?: { content?: string | null; reasoning_content?: string | null } }[];
}

/** Some models inline their reasoning as <think>…</think>; never show that to users. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "").trim();
}

async function chatOnce(
  client: NvidiaClient,
  model: string,
  messages: ChatMessage[],
  opts: ChatOptions,
): Promise<NvidiaResult<string>> {
  const res = await client.post<ChatResponse>(
    "/chat/completions",
    {
      model,
      messages,
      max_tokens: opts.maxTokens ?? (opts.thinking ? 4000 : 1200),
      temperature: opts.temperature ?? 0,
      chat_template_kwargs: { enable_thinking: opts.thinking ?? false },
      ...opts.extra,
    },
    { timeoutMs: opts.timeoutMs },
  );
  const content = res.data.choices?.[0]?.message?.content;
  if (content == null || !stripThinking(content)) {
    throw new NvidiaError(`${model} returned no content (it may have spent max_tokens thinking)`, {
      retryable: false,
      model,
      code: "empty",
    });
  }
  return { ...res, data: stripThinking(content) };
}

/** Plain text chat, with one fallback model. */
export async function chat(
  client: NvidiaClient,
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<NvidiaResult<string>> {
  const role = opts.model ?? "fast";
  const model = resolveModel(role);
  const fallbackRole = opts.fallback === undefined ? (role === "reasoning" ? "fast" : null) : opts.fallback;
  try {
    return await chatOnce(client, model, messages, opts);
  } catch (e) {
    if (!fallbackRole || (e instanceof NvidiaError && (e.status === 400 || e.status === 401))) throw e;
    return chatOnce(client, resolveModel(fallbackRole), messages, opts);
  }
}

/**
 * Models sometimes write JSON with escapes JSON does not allow (\' for an apostrophe, or a lone backslash).
 * Fix just those, so a good answer is not thrown away over punctuation.
 */
export function repairJson(text: string): string {
  return text.replace(/\\'/g, "'").replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

const parseLoose = (t: string): unknown => {
  try {
    return JSON.parse(t);
  } catch {
    return JSON.parse(repairJson(t));
  }
};

/** Pull a JSON value out of a reply that may be wrapped in prose or ``` fences. */
export function extractJson(text: string): unknown {
  const unfenced = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  try {
    return parseLoose(unfenced);
  } catch {
    const start = unfenced.search(/[[{]/);
    const end = Math.max(unfenced.lastIndexOf("}"), unfenced.lastIndexOf("]"));
    if (start < 0 || end <= start) throw new Error("No JSON found in reply");
    return parseLoose(unfenced.slice(start, end + 1));
  }
}

export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema; // the server only wants the schema body
  return json;
}

/**
 * Chat that must return JSON matching `schema`. Uses the server's JSON-schema mode,
 * validates with Zod, and retries once with the validation error. Still invalid → throws
 * (callers drop the finding; raw model output is never shown).
 */
export async function chatJson<T>(
  client: NvidiaClient,
  messages: ChatMessage[],
  schema: z.ZodType<T>,
  opts: ChatOptions & {
    schemaName?: string;
    /**
     * "server": the server's JSON-schema mode (constrained decoding). "prompt": the schema goes in the
     * system prompt and Zod checks the reply. On long prompts the Ultra model under constrained decoding
     * collapses to the shortest valid answer ({"findings": []}) in under a second, so the reviewer uses "prompt".
     */
    schemaMode?: "server" | "prompt";
  } = {},
): Promise<NvidiaResult<T>> {
  const jsonSchema = jsonSchemaFor(schema);
  const responseFormat = { type: "json_schema", json_schema: { name: opts.schemaName ?? "result", schema: jsonSchema, strict: false } };
  if (opts.schemaMode === "prompt") {
    const rule = `Reply with one JSON object only — no prose, no code fences — matching this JSON Schema exactly (same field names):\n${JSON.stringify(jsonSchema)}`;
    const i = messages.findIndex((m) => m.role === "system");
    messages =
      i >= 0
        ? messages.map((m, j) => (j === i ? { ...m, content: `${String(m.content)}\n\n${rule}` } : m))
        : [{ role: "system", content: rule }, ...messages];
  }
  const ask = (msgs: ChatMessage[]) =>
    chat(client, msgs, opts.schemaMode === "prompt" ? opts : { ...opts, extra: { ...opts.extra, response_format: responseFormat } });

  let res = await ask(messages);
  let problem = validate(res.data, schema);
  if (problem.ok) return { ...res, data: problem.value };

  const retryMessages: ChatMessage[] = [
    ...messages,
    { role: "assistant", content: res.data },
    { role: "user", content: `That reply was not valid: ${problem.error}. Reply again with JSON only, matching the schema exactly.` },
  ];
  const attempts = res.attempts;
  res = await ask(retryMessages);
  problem = validate(res.data, schema);
  if (problem.ok) return { ...res, data: problem.value, attempts: attempts + res.attempts };
  throw new NvidiaError(`${res.modelId} returned invalid JSON twice: ${problem.error}`, {
    retryable: false,
    model: res.modelId,
    code: "invalid_json",
  });
}

function validate<T>(text: string, schema: z.ZodType<T>): { ok: true; value: T } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unparseable JSON" };
  }
  const r = schema.safeParse(parsed);
  return r.success
    ? { ok: true, value: r.data }
    : { ok: false, error: r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") };
}
