import { NvidiaError, type NvidiaClient, type NvidiaResult } from "@/lib/nvidia/client";
import { chat } from "@/lib/nvidia/chat";
import { MODELS } from "@/lib/nvidia/config";

export interface SafetyVerdict {
  safe: boolean;
  /** Category labels the guard model reported, if any (e.g. "Violence", "S1"). */
  categories: string[];
}

/**
 * Parse either guard format:
 *  - Nemotron safety guard: {"User Safety": "unsafe", "Safety Categories": "Violence, Hate"}
 *  - Llama Guard: "unsafe\nS1,S10" or "safe"
 */
export function parseSafety(text: string): SafetyVerdict {
  const trimmed = text.trim();
  try {
    const j = JSON.parse(trimmed.replace(/^```(?:json)?|```$/g, "").trim());
    const verdict = String(j["User Safety"] ?? j["Response Safety"] ?? j.safety ?? "").toLowerCase();
    if (verdict === "safe" || verdict === "unsafe") {
      const cats = String(j["Safety Categories"] ?? "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      return { safe: verdict === "safe", categories: cats };
    }
  } catch {
    // not JSON — try the Llama Guard text format
  }
  const [first, second = ""] = trimmed.split(/\n+/);
  const word = first.trim().toLowerCase();
  if (word === "safe") return { safe: true, categories: [] };
  if (word === "unsafe") return { safe: false, categories: second.split(",").map((c) => c.trim()).filter(Boolean) };
  throw new Error(`Unrecognised safety reply: ${trimmed.slice(0, 80)}`);
}

/** Content-safety check on draft copy. Falls back to the backup guard model. */
export async function safetyCheck(client: NvidiaClient, text: string): Promise<NvidiaResult<SafetyVerdict>> {
  const run = async (model: string) => {
    const res = await chat(client, [{ role: "user", content: text }], { model, maxTokens: 80, fallback: null });
    try {
      return { ...res, data: parseSafety(res.data) };
    } catch (e) {
      throw new NvidiaError(String(e), { retryable: false, model, code: "unparseable" });
    }
  };
  try {
    return await run(MODELS.safety);
  } catch {
    return run(MODELS.safetyBackup);
  }
}
