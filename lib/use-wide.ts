"use client";

import { useSyncExternalStore } from "react";

/** True on screens wide enough for the two-column scan page (the Tailwind `lg` breakpoint by default). */
export function useWide(minWidth = 1024): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(`(min-width: ${minWidth}px)`);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(`(min-width: ${minWidth}px)`).matches,
    () => true,
  );
}
