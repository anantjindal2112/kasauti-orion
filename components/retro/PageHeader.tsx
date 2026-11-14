"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/retro/Icon";

/** Page title block: pixel heading, one-line purpose, and an optional tip. */
export function PageHeader({
  icon,
  title,
  subtitle,
  tip,
  children,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  tip?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        <h1 className="flex items-center gap-3 font-pixel text-3xl font-bold leading-tight sm:text-4xl">
          <motion.span
            initial={{ rotate: -90, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            className="grid h-11 w-11 shrink-0 place-items-center border-2 border-ink bg-yellow shadow-hard-sm"
          >
            <Icon name={icon} className="h-6 w-6" />
          </motion.span>
          <motion.span initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 }}>
            {title}
          </motion.span>
        </h1>
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-3 text-lg text-muted">
          {subtitle}
        </motion.p>
        {tip && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
            className="mt-3 inline-flex items-start gap-2 border-2 border-dashed border-ink bg-card px-3 py-2 text-sm"
          >
            <span className="font-mono font-bold text-teal">TIP</span>
            <span>{tip}</span>
          </motion.p>
        )}
      </div>
      {children && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="flex flex-wrap gap-3">
          {children}
        </motion.div>
      )}
    </header>
  );
}
