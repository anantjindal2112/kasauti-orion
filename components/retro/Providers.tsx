"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** Snappy, slightly bouncy motion — like windows popping open — and respect reduced-motion. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 420, damping: 30 }}>
      {children}
    </MotionConfig>
  );
}
