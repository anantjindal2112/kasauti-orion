"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";
import { brandPackSchema, ruleSchema, type BrandPackData, type Rule } from "@/lib/schemas/brand-pack";

/**
 * The customised brand pack lives in this browser (localStorage) until the database exists
 * (Stage 2). The scanner sends it with each scan; the server validates it in full.
 */
export const STORAGE_KEY = "kasauti.customPack.v1";
const EVENT = "kasauti-custom-pack";

export const customSettingsSchema = z.object({
  /** Every rule as edited, including switched-off ones (so they can be switched back on). */
  rules: z.array(ruleSchema),
  disabled: z.array(z.string()),
  pack: brandPackSchema,
  today: z.iso.date(),
  savedAt: z.string(),
});
export type CustomSettings = z.infer<typeof customSettingsSchema>;

/** The pack the scanner should use: edited rules minus the switched-off ones. */
export function effectivePack(base: Omit<BrandPackData, "rules">, rules: Rule[], disabled: string[]): BrandPackData {
  const off = new Set(disabled);
  return { ...base, rules: rules.filter((r) => !off.has(r.code)) };
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // private mode / blocked storage: behave as "no custom pack"
  }
}

export function parseCustom(raw: string | null): CustomSettings | null {
  if (!raw) return null;
  try {
    const r = customSettingsSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export function saveCustom(settings: CustomSettings): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

export function clearCustom() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
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

/** The saved custom settings (raw JSON string is the snapshot, so it stays referentially stable). */
export function useCustomRaw(): string | null {
  return useSyncExternalStore(subscribe, readRaw, () => null);
}
