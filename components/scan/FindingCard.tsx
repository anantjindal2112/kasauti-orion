"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Badge, SeverityBadge } from "@/components/retro/Badge";
import { Button } from "@/components/retro/Button";
import { Icon } from "@/components/retro/Icon";
import type { EvidenceInfo, RuleInfo } from "@/lib/scan-types";
import type { Finding } from "@/lib/schemas/finding";

export type Decision = { action: "accepted" | "edited" | "disputed" | "noted"; note?: string };

const LOCATION_LABEL = { text: "In the copy", image: "Text inside an image", alt: "Image alt text" } as const;

export function FindingCard({
  finding: f,
  number,
  rule,
  evidence,
  decision,
  canApply,
  selected,
  onSelect,
  onApply,
  onDispute,
  onSetAlt,
  onNote,
}: {
  finding: Finding;
  number: number;
  rule?: RuleInfo;
  evidence?: EvidenceInfo;
  decision?: Decision;
  /** False when the draft changed since the scan — spans would be stale. */
  canApply: boolean;
  selected: boolean;
  onSelect: () => void;
  onApply: (replacement: string, how: "accepted" | "edited") => void;
  onDispute: (reason: string) => void;
  onSetAlt: (alt: string) => void;
  onNote: (note: string) => void;
}) {
  const [mode, setMode] = useState<null | "edit" | "dispute" | "alt">(null);
  const [draft, setDraft] = useState("");
  const disputed = decision?.action === "disputed";
  const noted = decision?.action === "noted";

  const open = (m: "edit" | "dispute" | "alt") => {
    setMode(m);
    setDraft(m === "edit" ? (f.suggestedFix ?? f.quote) : "");
  };

  return (
    <motion.article
      layout
      id={`finding-${f.id}`}
      onClick={onSelect}
      initial={{ opacity: 0, x: 30, rotate: 1 }}
      animate={{ opacity: disputed || noted ? 0.75 : 1, x: 0, rotate: 0 }}
      exit={{ opacity: 0, x: -30, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 380, damping: 30, delay: Math.min(number * 0.07, 0.5) }}
      className={`scroll-mt-6 border-2 border-ink bg-card transition-shadow ${selected ? "shadow-hard" : "shadow-hard-sm"}`}
    >
      <header className="flex flex-wrap items-center gap-2 border-b-2 border-ink bg-sunk px-3 py-2">
        <span className="grid h-6 min-w-6 place-items-center border-2 border-ink bg-ink px-1 font-num text-xs font-bold text-paper">{number}</span>
        <SeverityBadge severity={f.severity} stamp delay={0.25 + Math.min(number * 0.07, 0.5)} />
        <span className="font-mono text-sm font-bold">{f.rule}</span>
        <span className="font-medium">{rule?.title ?? ""}</span>
        <span className="ml-auto">
          {f.source === "rule" ? <Badge tone="neutral">code check</Badge> : <Badge tone="info">AI · {f.modelId?.split("/").at(-1)}</Badge>}
        </span>
      </header>

      <div className="space-y-3 p-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted">
            {LOCATION_LABEL[f.location]}
            {f.imageFile ? ` · ${f.imageFile}` : ""}
          </p>
          <p className="mt-1 font-mono text-base">
            <mark className="bg-mark-high px-1 text-ink">“{f.quote}”</mark>
          </p>
        </div>

        <p className="leading-relaxed">{f.explanation}</p>

        {f.review === "needs_review" && (
          <p className="flex items-start gap-2 border-2 border-dashed border-ink bg-mark-medium px-3 py-2 text-sm">
            <Icon name="warn" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <b>Needs human review.</b> {f.reviewNote}
            </span>
          </p>
        )}
        {f.source === "ai" && f.review === "verified" && (
          <p className="flex items-center gap-2 font-mono text-xs text-teal">
            <Icon name="check" className="h-3.5 w-3.5" /> Passed all 3 Verifier tests · confidence {Math.round(f.confidence * 100)}%
          </p>
        )}

        {f.evidence && evidence && (
          <Link
            href={`/ledger#${f.evidence}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-2 border-2 border-ink bg-paper px-2 py-1 text-sm underline-offset-2 hover:underline"
          >
            <Icon name="ledger" />
            <span className="font-mono font-bold">{f.evidence}</span>
            <span>{evidence.title}</span>
            <Badge tone={evidence.expired ? "fail" : "ok"}>{evidence.expired ? "expired" : "valid"}</Badge>
          </Link>
        )}

        {f.location !== "alt" && (
          <div className="border-2 border-ink bg-term px-3 py-2 font-mono text-sm">
            <p className="text-yellow">
              SUGGESTED FIX
              {f.fixBy && <span className="text-paper/60"> · written by AI ({f.fixBy.split("/").at(-1)}), checked by code</span>}
            </p>
            {f.suggestedFix === null ? (
              <p className="mt-1 text-paper/80">{f.location === "image" ? "This text is inside the image — update the banner." : "This one needs a person to rewrite it."}</p>
            ) : f.suggestedFix === "" ? (
              <p className="mt-1 text-term-green">Remove “{f.quote}”.</p>
            ) : (
              <p className="mt-1 text-term-green">“{f.suggestedFix}”</p>
            )}
          </div>
        )}

        {f.intent && f.location === "text" && f.suggestedFix !== null && (
          <div
            className={`border-2 px-3 py-2 text-sm ${f.intent.ok ? "border-ink bg-card" : "border-ink bg-mark-medium"}`}
            aria-label="Intent Lock"
          >
            <p className="flex flex-wrap items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider">
              <Icon name={f.intent.ok ? "check" : "warn"} className={`h-3.5 w-3.5 ${f.intent.ok ? "text-teal" : ""}`} />
              Intent Lock · {f.intent.ok ? "fix keeps your message" : "a person decides"}
              <span className="font-normal normal-case text-muted">checked by {f.intent.by === "code" ? "code" : "AI"}</span>
            </p>
            <p className="mt-1.5 flex flex-wrap gap-1.5 font-mono text-xs">
              {f.intent.kept.map((k) => (
                <span key={`k-${k}`} className="border-2 border-ink bg-term px-1.5 py-0.5 text-term-green">
                  Kept: {k}
                </span>
              ))}
              <span className="border-2 border-ink bg-yellow px-1.5 py-0.5 text-ink">
                Changed: “{f.quote.length > 28 ? `${f.quote.slice(0, 28)}…` : f.quote}” ({f.rule})
              </span>
              {f.intent.changed.map((c) => (
                <span key={`c-${c}`} className="border-2 border-ink bg-mark-high px-1.5 py-0.5 text-ink">
                  Also changed: {c}
                </span>
              ))}
            </p>
            {f.intent.note && <p className="mt-1.5 text-sm text-muted">{f.intent.note}</p>}
          </div>
        )}

        {decision && (
          <p className="flex items-center gap-2 font-mono text-sm">
            <Badge tone={disputed ? "warn" : "ok"} stamp>
              {disputed ? "disputed" : noted ? "noted" : "fixed"}
            </Badge>
            {decision.note}
          </p>
        )}

        {!decision && mode === null && (
          <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
            {f.location === "text" && f.suggestedFix !== null && (
              <Button
                variant={f.intent && !f.intent.ok ? "default" : "primary"}
                size="sm"
                disabled={!canApply}
                onClick={() => onApply(f.suggestedFix!, "accepted")}
              >
                <Icon name="check" /> {f.intent && !f.intent.ok ? "Accept anyway" : "Accept fix"}
              </Button>
            )}
            {f.location === "text" && (
              <Button size="sm" disabled={!canApply} onClick={() => open("edit")}>
                Edit
              </Button>
            )}
            {f.location === "alt" && (
              <Button variant="primary" size="sm" onClick={() => open("alt")}>
                Add alt text
              </Button>
            )}
            {f.location === "image" && (
              <Button size="sm" onClick={() => onNote("Image will be replaced")}>
                Will replace image
              </Button>
            )}
            <Button size="sm" onClick={() => open("dispute")}>
              Dispute
            </Button>
          </div>
        )}
        {!canApply && !decision && f.location === "text" && (
          <p className="text-sm text-muted">The draft changed since this scan — run the scan again to apply fixes.</p>
        )}

        <AnimatePresence>
          {mode && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                const value = draft.trim();
                if (mode === "edit") onApply(draft, "edited");
                else if (!value) return;
                else if (mode === "dispute") onDispute(value);
                else onSetAlt(value);
                setMode(null);
              }}
            >
              <label className="block font-mono text-xs font-bold uppercase tracking-wider" htmlFor={`in-${f.id}`}>
                {mode === "edit" ? `Replace “${f.quote}” with` : mode === "dispute" ? "Why is this wrong?" : "Describe the image"}
              </label>
              <textarea
                id={`in-${f.id}`}
                autoFocus
                rows={mode === "edit" ? 2 : 3}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={mode === "dispute" ? "e.g. We have proof — see the 2026 survey." : undefined}
                className="w-full border-2 border-ink bg-paper p-2 font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button type="submit" variant="primary" size="sm">
                  {mode === "edit" ? "Apply" : mode === "dispute" ? "Submit dispute" : "Save alt text"}
                </Button>
                <Button size="sm" onClick={() => setMode(null)}>
                  Cancel
                </Button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}
