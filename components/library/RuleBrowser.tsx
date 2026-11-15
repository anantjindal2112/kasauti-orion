"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { RuleEditor } from "@/components/library/Editors";
import { Badge, SeverityBadge } from "@/components/retro/Badge";
import type { Rule } from "@/lib/schemas/brand-pack";

const LAYERS = [
  { key: "voice", label: "Voice", prefix: "1" },
  { key: "terminology", label: "Terminology", prefix: "2" },
  { key: "visual", label: "Visual", prefix: "3" },
  { key: "claims", label: "Claims & proof", prefix: "4" },
  { key: "accessibility", label: "Accessibility", prefix: "5" },
  { key: "messaging", label: "Messaging", prefix: "6" },
] as const;

const CHECK = {
  code: { label: "code check", tone: "neutral" },
  ai: { label: "AI check", tone: "info" },
  hybrid: { label: "code + AI", tone: "dark" },
} as const;

export interface RuleEditing {
  disabled: Set<string>;
  onSave: (rule: Rule) => string | null;
  onToggle: (code: string) => string | null;
}

export function RuleBrowser({ rules, editing }: { rules: Rule[]; editing?: RuleEditing }) {
  const [layer, setLayer] = useState<string>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState("");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rules.filter(
      (r) => (layer === "all" || r.layer === layer) && (!needle || `${r.code} ${r.title} ${r.body} ${r.tags.join(" ")}`.toLowerCase().includes(needle)),
    );
  }, [rules, layer, q]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label="Filter by layer" className="flex flex-wrap gap-2">
          {[{ key: "all", label: "All", prefix: "" }, ...LAYERS].map((l) => {
            const n = l.key === "all" ? rules.length : rules.filter((r) => r.layer === l.key).length;
            const on = layer === l.key;
            return (
              <button
                key={l.key}
                type="button"
                aria-pressed={on}
                onClick={() => setLayer(l.key)}
                className={`relative border-2 border-ink px-3 py-1.5 font-mono text-sm shadow-hard-sm press ${on ? "text-term-green" : "bg-card"}`}
              >
                {on && <motion.span layoutId="rule-layer" className="absolute inset-0 bg-term" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
                <span className="relative">
                  {l.prefix && `${l.prefix}.x `}
                  {l.label} ({n})
                </span>
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold">Search</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. price, logo, KSR-4.2"
            className="w-full min-w-0 border-2 border-ink bg-card px-3 py-2 lg:w-64"
          />
        </label>
      </div>

      {toggleError && <p className="font-mono text-sm text-red">{toggleError}</p>}
      {shown.length === 0 && <p className="border-2 border-dashed border-ink bg-card p-4">No rules match “{q}”.</p>}

      <motion.ul layout className="grid gap-4 md:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {shown.map((r, i) => (
            <motion.li
              layout
              key={r.code}
              id={r.code}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 420, damping: 30, delay: Math.min(i * 0.03, 0.3) }}
              className={`scroll-mt-6 border-2 border-ink bg-card shadow-hard-sm target:shadow-hard target:outline-4 target:outline-yellow ${
                editing?.disabled.has(r.code) ? "opacity-60" : ""
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 border-b-2 border-ink bg-sunk px-3 py-2">
                <span className="font-mono text-sm font-bold">{r.code}</span>
                <span className="font-bold">{r.title}</span>
                {editing && (
                  <span className="ml-auto flex gap-2">
                    <button
                      type="button"
                      onClick={() => setToggleError(editing.onToggle(r.code) ?? "")}
                      aria-pressed={!editing.disabled.has(r.code)}
                      className={`border-2 border-ink px-2 py-0.5 font-mono text-xs font-bold shadow-hard-sm press ${editing.disabled.has(r.code) ? "bg-paper" : "bg-teal text-paper"}`}
                    >
                      {editing.disabled.has(r.code) ? "OFF" : "ON"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(open === r.code ? null : r.code)}
                      className="border-2 border-ink bg-yellow px-2 py-0.5 font-mono text-xs font-bold shadow-hard-sm press"
                    >
                      {open === r.code ? "Close" : "Edit"}
                    </button>
                  </span>
                )}
              </div>
              {editing && open === r.code ? (
                <div className="p-4">
                  <RuleEditor
                    rule={r}
                    onCancel={() => setOpen(null)}
                    onSave={(next) => {
                      const err = editing.onSave(next);
                      if (!err) setOpen(null);
                      return err;
                    }}
                  />
                </div>
              ) : (
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap gap-2">
                  <SeverityBadge severity={r.severity} />
                  <Badge tone={CHECK[r.checkType].tone}>{CHECK[r.checkType].label}</Badge>
                  <Badge>v{r.version}</Badge>
                  {r.knownUnclear && <Badge tone="warn">vague on purpose · radar demo</Badge>}
                  {editing?.disabled.has(r.code) && <Badge tone="fail">switched off</Badge>}
                </div>
                <p className="leading-relaxed">{r.body}</p>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div className="border-2 border-ink bg-paper p-2">
                    <p className="font-mono text-xs font-bold text-teal">✓ GOOD</p>
                    {r.goodExamples.map((g) => (
                      <p key={g} className="mt-1">
                        {g}
                      </p>
                    ))}
                  </div>
                  <div className="border-2 border-ink bg-paper p-2">
                    <p className="font-mono text-xs font-bold text-red">✗ BAD</p>
                    {r.badExamples.map((b) => (
                      <p key={b} className="mt-1">
                        {b}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
    </div>
  );
}
