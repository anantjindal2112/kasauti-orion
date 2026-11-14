"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

export type WindowColor = "teal" | "blue" | "red" | "yellow" | "ink";

const BAR: Record<WindowColor, string> = {
  teal: "bg-teal text-paper",
  blue: "bg-blue text-paper",
  red: "bg-red text-paper",
  yellow: "bg-yellow text-ink",
  ink: "bg-term text-term-green",
};

const TAG = { section: motion.section, div: motion.div, article: motion.article, aside: motion.aside };

/**
 * A retro OS window: coloured title bar with a file path, hard shadow, cream body.
 * It "pops open" the first time it scrolls into view.
 */
export function Window({
  title,
  color = "teal",
  children,
  className = "",
  bodyClassName = "p-5 sm:p-6",
  actions,
  dark = false,
  as = "section",
  delay = 0,
}: {
  title: string;
  color?: WindowColor;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Rendered at the right of the title bar instead of the decorative buttons. */
  actions?: ReactNode;
  /** Terminal-style dark body. */
  dark?: boolean;
  as?: keyof typeof TAG;
  delay?: number;
}) {
  const Tag = TAG[as];
  return (
    <Tag
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ type: "spring", stiffness: 380, damping: 28, delay }}
      className={`border-2 border-ink shadow-hard ${dark ? "bg-term text-paper" : "bg-paper"} ${className}`}
    >
      <div className={`flex min-h-10 items-center justify-between gap-3 border-b-2 border-ink px-3 py-1.5 ${BAR[color]}`}>
        <span className="truncate font-pixel text-sm tracking-wider sm:text-[15px]">{title}</span>
        {actions ?? (
          <span aria-hidden className="flex shrink-0 gap-1">
            {["_", "□", "×"].map((c) => (
              <span key={c} className="grid h-5 w-5 place-items-center border-2 border-ink bg-paper text-[10px] leading-none text-ink">
                {c}
              </span>
            ))}
          </span>
        )}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Tag>
  );
}
