"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/retro/Icon";
import { NAV } from "@/components/retro/links";

/** Fixed bottom taskbar — the one navigation bar, visible on every page. */
export function Taskbar({ demoDate }: { demoDate: string }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <motion.nav
      aria-label="Main"
      initial={{ y: 80 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.1 }}
      className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-ink bg-[#c9c0aa]"
    >
      <div className="no-scrollbar mx-auto flex h-16 max-w-7xl items-center gap-2 overflow-x-auto px-3">
        {NAV.map((item, i) => {
          const active = isActive(item.href);
          const start = i === 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex h-11 shrink-0 items-center gap-2 border-2 border-ink px-3 font-mono text-sm font-medium ${
                start ? "bg-yellow font-pixel text-base font-bold tracking-wider shadow-hard-sm press" : active ? "text-term-green" : "bg-paper shadow-hard-sm press"
              }`}
            >
              {active && !start && (
                <motion.span
                  layoutId="taskbar-active"
                  className="absolute inset-0 bg-term shadow-[inset_2px_2px_0_0_rgb(0_0_0/0.5)]"
                  transition={{ type: "spring", stiffness: 500, damping: 36 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <Icon name={start ? "arrow" : item.icon} className="h-4 w-4" />
                <span className={start ? "" : "hidden sm:inline"}>{start ? "START" : item.label}</span>
                {!start && <span className="sm:hidden">{item.short}</span>}
              </span>
            </Link>
          );
        })}
        <div className="ml-auto hidden shrink-0 items-center gap-2 border-2 border-ink bg-paper px-3 py-2 font-mono text-xs lg:flex">
          <span className="text-muted">demo date</span>
          <span className="font-medium">{demoDate}</span>
        </div>
      </div>
    </motion.nav>
  );
}
