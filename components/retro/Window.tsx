"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type WindowColor = "teal" | "blue" | "red" | "yellow" | "ink";
/** The title-bar buttons a window can have. Windows without any keep the decorative trio. */
export type WindowControl = "min" | "max" | "close";

const BAR: Record<WindowColor, string> = {
  teal: "bg-teal text-paper",
  blue: "bg-blue text-paper",
  red: "bg-red text-paper",
  yellow: "bg-yellow text-ink",
  ink: "bg-term text-term-green",
};

const TAG = { section: motion.section, div: motion.div, article: motion.article, aside: motion.aside };

const GLYPH = { min: "_", max: "□", restore: "❐", close: "×" } as const;

/**
 * A retro OS window: coloured title bar with a file path, hard shadow, cream body.
 * It "pops open" the first time it scrolls into view.
 *
 * `controls` makes the title-bar buttons real, for the windows where that helps:
 * minimize folds the body up to the title bar, maximize fills the screen (Esc or the button puts it back),
 * and close tucks the window into a one-line bar with a Reopen button. The content stays mounted the whole
 * time, so nothing typed or recorded in a window is lost when it is folded, closed or enlarged.
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
  controls,
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
  controls?: WindowControl[];
}) {
  const Tag = TAG[as];
  const ref = useRef<HTMLElement>(null);
  const maxBtn = useRef<HTMLButtonElement>(null);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [closed, setClosed] = useState(false);
  const [spacer, setSpacer] = useState(0);

  const can = (c: WindowControl) => !!controls?.includes(c);
  const live = !!controls?.length && !actions;

  const maximize = () => {
    setSpacer(ref.current?.offsetHeight ?? 0); // hold the window's place in the page while it is enlarged
    setMinimized(false);
    setMaximized(true);
  };
  const restore = () => {
    setMaximized(false);
    requestAnimationFrame(() => maxBtn.current?.focus());
  };

  // Enlarged: Esc puts it back, and the page behind does not scroll.
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && restore();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [maximized]);

  const btn =
    "grid h-6 w-6 shrink-0 place-items-center border-2 border-ink bg-paper font-mono text-[11px] font-bold leading-none text-ink hover:bg-yellow focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink active:translate-y-px";

  return (
    <>
      {closed && (
        <div className={`flex items-center justify-between gap-3 border-2 border-dashed border-ink bg-sunk px-3 py-2 ${className}`}>
          <span className="min-w-0 truncate font-mono text-xs text-muted">{title} · closed</span>
          <button type="button" onClick={() => setClosed(false)} className="shrink-0 border-2 border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold hover:bg-yellow">
            Reopen
          </button>
        </div>
      )}
      {maximized && (
        <>
          <div className="fixed inset-0 z-[65] bg-ink/60" aria-hidden onClick={restore} />
          <div aria-hidden style={{ height: spacer }} />
        </>
      )}
      <Tag
        // @ts-expect-error the four motion tags share these props; the union of their ref types is the only mismatch
        ref={ref}
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ type: "spring", stiffness: 380, damping: 28, delay }}
        hidden={closed}
        role={maximized ? "dialog" : undefined}
        aria-modal={maximized ? true : undefined}
        aria-label={maximized ? title : undefined}
        className={`border-2 border-ink shadow-hard ${dark ? "bg-term text-paper" : "bg-paper"} ${
          maximized ? "fixed inset-2 z-[70] flex flex-col overflow-y-auto sm:inset-6" : ""
        } ${maximized ? "" : className}`}
      >
        <div
          className={`flex min-h-10 shrink-0 items-center justify-between gap-3 border-b-2 border-ink px-3 py-1.5 ${BAR[color]} ${live && can("max") ? "cursor-default select-none" : ""}`}
          onDoubleClick={live && can("max") ? () => (maximized ? restore() : maximize()) : undefined}
        >
          <span className="truncate font-pixel text-sm tracking-wider sm:text-[15px]">{title}</span>
          {actions ??
            (live ? (
              <span className="flex shrink-0 gap-1">
                {can("min") && !maximized && (
                  <button type="button" className={btn} aria-label={minimized ? `Unfold ${title}` : `Minimize ${title}`} aria-expanded={!minimized} onClick={() => setMinimized((m) => !m)}>
                    {minimized ? "▢" : GLYPH.min}
                  </button>
                )}
                {can("max") && (
                  <button ref={maxBtn} type="button" className={btn} aria-label={maximized ? `Restore ${title}` : `Maximize ${title}`} onClick={() => (maximized ? restore() : maximize())}>
                    {maximized ? GLYPH.restore : GLYPH.max}
                  </button>
                )}
                {can("close") && (
                  <button
                    type="button"
                    className={btn}
                    aria-label={`Close ${title}`}
                    onClick={() => {
                      setMaximized(false);
                      setClosed(true);
                    }}
                  >
                    {GLYPH.close}
                  </button>
                )}
              </span>
            ) : (
              <span aria-hidden className="flex shrink-0 gap-1">
                {["_", "□", "×"].map((c) => (
                  <span key={c} className="grid h-5 w-5 place-items-center border-2 border-ink bg-paper text-[10px] leading-none text-ink">
                    {c}
                  </span>
                ))}
              </span>
            ))}
        </div>
        {/* Folding is a plain CSS transition on the grid row height, so it never depends on a script animation frame. */}
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
            minimized ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
          } ${maximized ? "min-h-0 flex-1" : ""}`}
          inert={minimized}
        >
          <div className={`min-h-0 ${minimized ? "overflow-hidden" : ""}`}>
            <div className={bodyClassName}>{children}</div>
          </div>
        </div>
      </Tag>
    </>
  );
}
