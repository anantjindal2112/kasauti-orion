"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

export type BadgeTone = "ok" | "warn" | "fail" | "info" | "neutral" | "dark";

const TONE: Record<BadgeTone, string> = {
  ok: "bg-teal text-paper",
  warn: "bg-yellow text-ink",
  fail: "bg-red text-paper",
  info: "bg-blue text-paper",
  neutral: "bg-card text-ink",
  dark: "bg-term text-term-green",
};

const BASE = "inline-flex items-center gap-1 border-2 border-ink px-2 py-0.5 font-mono text-xs font-medium uppercase tracking-wide";

/** With `stamp`, the badge thumps down like a rubber stamp. */
export function Badge({
  tone = "neutral",
  children,
  className = "",
  stamp = false,
  delay = 0,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  stamp?: boolean;
  delay?: number;
}) {
  if (!stamp) return <span className={`${BASE} ${TONE[tone]} ${className}`}>{children}</span>;
  return (
    <motion.span
      className={`${BASE} ${TONE[tone]} ${className}`}
      initial={{ opacity: 0, scale: 1.8, rotate: -10 }}
      animate={{ opacity: 1, scale: 1, rotate: -2 }}
      transition={{ type: "spring", stiffness: 600, damping: 18, delay }}
    >
      {children}
    </motion.span>
  );
}

export const SEVERITY_TONE = { high: "fail", medium: "warn", low: "info" } as const satisfies Record<string, BadgeTone>;

export function SeverityBadge({ severity, stamp, delay }: { severity: "high" | "medium" | "low"; stamp?: boolean; delay?: number }) {
  return (
    <Badge tone={SEVERITY_TONE[severity]} stamp={stamp} delay={delay}>
      {severity === "medium" ? "med" : severity}
    </Badge>
  );
}
