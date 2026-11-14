"use client";

import { motion } from "motion/react";
import type { Finding } from "@/lib/schemas/finding";

const RANK = { high: 3, medium: 2, low: 1 } as const;
const UNDERLINE = { high: "decoration-red", medium: "decoration-mustard", low: "decoration-blue" } as const;
/** Drawn as a background image so each highlight can sweep in like a marker pen. */
const TINT = { high: "var(--mark-high)", medium: "var(--mark-medium)", low: "var(--mark-low)" } as const;

/**
 * The scanned draft with every text finding highlighted. Overlapping findings share a
 * segment; the colour follows the most severe one. Click a highlight to jump to its finding.
 */
export function HighlightedDraft({
  text,
  findings,
  numberOf,
  selectedId,
  onSelect,
}: {
  text: string;
  findings: Finding[];
  numberOf: (f: Finding) => number;
  selectedId: string | null;
  onSelect: (f: Finding) => void;
}) {
  const inText = findings.filter((f) => f.location === "text");
  const cuts = [...new Set([0, text.length, ...inText.flatMap((f) => [f.span.start, f.span.end])])].sort((a, b) => a - b);

  return (
    <div className="whitespace-pre-wrap break-words border-2 border-ink bg-card p-4 text-lg leading-[2.1]">
      {cuts.slice(0, -1).map((start, i) => {
        const end = cuts[i + 1];
        const piece = text.slice(start, end);
        const covering = inText.filter((f) => f.span.start <= start && f.span.end >= end);
        if (!covering.length) return <span key={start}>{piece}</span>;

        const top = covering.reduce((a, b) => (RANK[b.severity] > RANK[a.severity] ? b : a));
        const starts = covering.filter((f) => f.span.start === start);
        const selected = covering.some((f) => f.id === selectedId);
        return (
          <motion.button
            key={start}
            type="button"
            onClick={() => onSelect(top)}
            title={covering.map((f) => `${f.rule}: ${f.explanation}`).join("\n")}
            aria-label={`Finding ${covering.map(numberOf).join(", ")}: ${piece}`}
            style={{ backgroundImage: `linear-gradient(${TINT[top.severity]}, ${TINT[top.severity]})`, backgroundRepeat: "no-repeat" }}
            initial={{ backgroundSize: "0% 100%" }}
            animate={{ backgroundSize: "100% 100%" }}
            transition={{ duration: 0.45, ease: "easeOut", delay: 0.15 + numberOf(top) * 0.08 }}
            className={`relative cursor-pointer px-0.5 text-left underline decoration-2 underline-offset-4 ${UNDERLINE[top.severity]} ${
              selected ? "outline-2 outline-offset-1 outline-ink" : ""
            }`}
          >
            {starts.map((f) => (
              <sup key={f.id} className="mr-0.5 border border-ink bg-ink px-1 font-mono text-[10px] font-bold text-paper no-underline">
                {numberOf(f)}
              </sup>
            ))}
            {piece}
          </motion.button>
        );
      })}
    </div>
  );
}
