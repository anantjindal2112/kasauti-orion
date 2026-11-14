"use client";

import { animate, motion, useInView } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Children pop in one after another when the group scrolls into view. */
export function Stagger({ children, className, gap = 0.06, as = "div" }: { children: ReactNode; className?: string; gap?: number; as?: "div" | "ul" | "ol" }) {
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </Comp>
  );
}

export function Pop({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" }) {
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp
      className={className}
      variants={{
        hidden: { opacity: 0, y: 16, scale: 0.96 },
        show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 420, damping: 26 } },
      }}
    >
      {children}
    </Comp>
  );
}

/** Ticks up to `value` like an odometer the first time it is seen. */
export function Counter({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, value, { duration: 1.2, ease: "easeOut", onUpdate: (v) => setShown(Math.round(v)) });
    return () => c.stop();
  }, [inView, value]);
  return (
    <span ref={ref} className={className}>
      {shown}
    </span>
  );
}

/** Terminal lines that print one at a time, like an old console. */
export function TypeLines({
  lines,
  className,
  start = 0.2,
  step = 0.35,
}: {
  lines: { text: string; className?: string }[];
  className?: string;
  start?: number;
  step?: number;
}) {
  return (
    <ul className={className}>
      {lines.map((l, i) => (
        <motion.li
          key={`${i}-${l.text}`}
          className={l.className}
          initial={{ opacity: 0, clipPath: "inset(0 100% 0 0)" }}
          animate={{ opacity: 1, clipPath: "inset(0 0% 0 0)" }}
          transition={{ duration: 0.45, delay: start + i * step, ease: "linear" }}
        >
          {l.text}
        </motion.li>
      ))}
    </ul>
  );
}
