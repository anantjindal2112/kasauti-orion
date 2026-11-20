import { useSyncExternalStore } from "react";

/**
 * Every Accept, Edit, Dispute and note a reviewer makes in the scanner, kept in this browser so the Insights page can show
 * which rules people argue with. (A shared database would keep it for the whole team; that is on the roadmap.)
 */
export interface DecisionEntry {
  t: string;
  rule: string;
  action: "accepted" | "edited" | "disputed" | "noted";
  source: "rule" | "ai";
  quote: string;
  /** The creator accepted a fix that the Intent Check had flagged. */
  intentOverride?: boolean;
  reason?: string;
}

const KEY = "kasauti.decisions.v1";
const EVENT = "kasauti-decisions";
const MAX = 500;

export function parseDecisions(raw: string | null): DecisionEntry[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as DecisionEntry[]).filter((e) => e && typeof e.rule === "string" && typeof e.action === "string") : [];
  } catch {
    return [];
  }
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function logDecisions(entries: Omit<DecisionEntry, "t">[]) {
  if (!entries.length) return;
  try {
    const now = new Date().toISOString();
    const next = [...parseDecisions(readRaw()), ...entries.map((e) => ({ ...e, quote: e.quote.slice(0, 120), t: now }))].slice(-MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Storage blocked: the scanner keeps working, Insights just has nothing to show.
  }
}

export function clearDecisions() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

/** The raw JSON string is the snapshot, so it stays referentially stable between renders. */
export function useDecisionsRaw(): string | null {
  return useSyncExternalStore(subscribe, readRaw, () => null);
}

export interface RuleStat {
  rule: string;
  total: number;
  accepted: number;
  edited: number;
  disputed: number;
  noted: number;
  intentOverrides: number;
  /** (edits + disputes) / decisions: how often people do not simply take the suggestion. */
  overrideRate: number;
  /** At least 3 decisions and a quarter or more overridden. */
  unclear: boolean;
}

export const UNCLEAR_RATE = 0.25;
export const UNCLEAR_MIN = 3;

type Counts = Pick<RuleStat, "rule" | "total" | "accepted" | "edited" | "disputed" | "noted" | "intentOverrides">;

/** Add the override rate and the "unclear" verdict to raw counts, most-argued rule first. */
export function withVerdicts(rows: Counts[]): RuleStat[] {
  return rows
    .map((s) => {
      const overrideRate = s.total ? (s.edited + s.disputed) / s.total : 0;
      return { ...s, overrideRate, unclear: s.total >= UNCLEAR_MIN && overrideRate >= UNCLEAR_RATE };
    })
    .sort((a, b) => Number(b.unclear) - Number(a.unclear) || b.overrideRate - a.overrideRate || b.total - a.total);
}

export function ruleStats(entries: DecisionEntry[]): RuleStat[] {
  const by = new Map<string, Counts>();
  for (const e of entries) {
    const s = by.get(e.rule) ?? { rule: e.rule, total: 0, accepted: 0, edited: 0, disputed: 0, noted: 0, intentOverrides: 0 };
    s.total++;
    s[e.action]++;
    if (e.intentOverride) s.intentOverrides++;
    by.set(e.rule, s);
  }
  return withVerdicts([...by.values()]);
}
