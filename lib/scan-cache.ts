import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Saved scan results. A scan of the exact same input (text, images, intent, settings) returns the
 * saved result of an earlier real run instead of waiting on the models again.
 *
 * - Results from this server process are kept in memory.
 * - The three showcase examples ship as files in `lib/scan-fixtures/`, recorded from real runs.
 *   Set KASAUTI_RECORD=1 and scan an example once to (re)record its file.
 */
const DIR = path.join(process.cwd(), "lib", "scan-fixtures");
const memory = new Map<string, unknown>();

export interface CacheKeyInput {
  text: string;
  images: { name: string; alt: string | null; demoText?: string; dataUrl?: string }[];
  ocr: boolean;
  ai: boolean;
  intent?: { purpose?: string; audience?: string; mustKeep?: string };
  /** Present only for a customised brand pack or a re-check; those are never served from the cache. */
  custom: boolean;
  today: string;
}

/** Same input → same key. Images count by name, alt text, known text and a hash of their bytes. */
export function scanKey(i: CacheKeyInput): string {
  const stable = JSON.stringify({
    t: i.text,
    im: i.images.map((x) => [x.name, x.alt, x.demoText ?? "", x.dataUrl ? createHash("sha256").update(x.dataUrl).digest("hex").slice(0, 16) : ""]),
    o: i.ocr,
    a: i.ai,
    in: [i.intent?.purpose ?? "", i.intent?.audience ?? "", i.intent?.mustKeep ?? ""],
    d: i.today,
  });
  return createHash("sha256").update(stable).digest("hex").slice(0, 24);
}

export function readSaved(key: string): unknown | null {
  if (memory.has(key)) return memory.get(key)!;
  const file = path.join(DIR, `${key}.json`);
  if (!existsSync(file)) return null;
  try {
    const saved = JSON.parse(readFileSync(file, "utf8")) as unknown;
    memory.set(key, saved);
    return saved;
  } catch {
    return null;
  }
}

/** Keep a finished real run. Only runs where the AI actually answered are worth keeping. */
export function save(key: string, result: unknown) {
  memory.set(key, result);
  if (process.env.KASAUTI_RECORD !== "1") return;
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(path.join(DIR, `${key}.json`), JSON.stringify(result, null, 2));
  } catch {
    // Read-only filesystem (e.g. a deploy): the in-memory copy is enough.
  }
}
