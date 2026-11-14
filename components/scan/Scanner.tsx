"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/retro/Badge";
import { Button } from "@/components/retro/Button";
import { Icon } from "@/components/retro/Icon";
import { TypeLines } from "@/components/retro/Motion";
import { Window } from "@/components/retro/Window";
import { FindingCard, type Decision } from "@/components/scan/FindingCard";
import { HighlightedDraft } from "@/components/scan/HighlightedDraft";
import type { DemoDraft, EvidenceInfo, RuleInfo, ScanResponse } from "@/lib/scan-types";
import type { Finding } from "@/lib/schemas/finding";

interface DraftImage {
  name: string;
  src: string;
  alt: string | null;
  demoText?: string;
  /** Set for images the user uploaded. */
  dataUrl?: string;
}

interface Version {
  n: number;
  text: string;
  note: string;
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;
const QUICK = ["D01", "D02", "D07", "D16", "D17"];
const keyOf = (f: Finding) => `${f.rule}|${f.location}|${f.imageFile ?? ""}|${f.quote}`;

async function toDataUrl(img: DraftImage): Promise<string | undefined> {
  if (img.dataUrl) return img.dataUrl;
  try {
    const blob = await (await fetch(img.src)).blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

export function Scanner({
  drafts,
  rules,
  evidence,
}: {
  drafts: DemoDraft[];
  rules: Record<string, RuleInfo>;
  evidence: Record<string, EvidenceInfo>;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const findingsRef = useRef<HTMLDivElement>(null);

  const [draftId, setDraftId] = useState<string>("");
  const [text, setText] = useState("");
  const [intent, setIntent] = useState({ purpose: "", audience: "", mustKeep: "" });
  const [images, setImages] = useState<DraftImage[]>([]);
  const [ocr, setOcr] = useState(true);
  const [aiOn, setAiOn] = useState(true);

  const [result, setResult] = useState<ScanResponse | null>(null);
  const [scannedText, setScannedText] = useState("");
  const [status, setStatus] = useState<"idle" | "scanning" | "error">("idle");
  const [error, setError] = useState("");
  const [view, setView] = useState<"edit" | "review">("edit");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [runs, setRuns] = useState(0);

  const scan = useCallback(
    async (overrides?: { text?: string; images?: DraftImage[] }) => {
      const body = overrides?.text ?? text;
      const imgs = overrides?.images ?? images;
      if (!body.trim()) {
        setError("Paste some copy, or load a demo draft first.");
        setStatus("error");
        return;
      }
      setStatus("scanning");
      setError("");
      const started = Date.now();
      try {
        const payloadImages = await Promise.all(
          imgs.map(async (i) => ({ name: i.name, alt: i.alt, demoText: i.demoText, dataUrl: ocr ? await toDataUrl(i) : undefined })),
        );
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: body, images: payloadImages, ocr, ai: aiOn, intent }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Scan failed (${res.status})`);
        // Let the scan animation play for a beat, even when the checks are instant.
        const wait = 700 - (Date.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        setResult(json as ScanResponse);
        setScannedText(body);
        setView("review");
        setStatus("idle");
        setRuns((n) => n + 1);
        setVersions((v) => (v.length ? v : [{ n: 1, text: body, note: "Original draft" }]));
        if (window.matchMedia("(max-width: 1023px)").matches) {
          findingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Scan failed.");
        setStatus("error");
      }
    },
    [text, images, ocr, aiOn, intent],
  );

  const loadDraft = useCallback(
    (id: string, autoScan: boolean) => {
      const d = drafts.find((x) => x.id === id);
      setDraftId(d ? id : "");
      setResult(null);
      setVersions([]);
      setDecisions({});
      setSelectedId(null);
      setView("edit");
      setStatus("idle");
      setError("");
      if (!d) {
        setText("");
        setIntent({ purpose: "", audience: "", mustKeep: "" });
        setImages([]);
        return;
      }
      const imgs = d.images.map((i) => ({ ...i }));
      setText(d.text);
      setIntent({ purpose: d.intent.purpose, audience: d.intent.audience, mustKeep: d.intent.mustKeep.join(", ") });
      setImages(imgs);
      if (autoScan) void scan({ text: d.text, images: imgs });
    },
    [drafts, scan],
  );

  // Deep link: /scan?draft=D01 loads and scans straight away.
  const initial = params.get("draft");
  const loadedFromUrl = useRef(false);
  useEffect(() => {
    if (loadedFromUrl.current || !initial) return;
    loadedFromUrl.current = true;
    loadDraft(initial.toUpperCase(), true);
  }, [initial, loadDraft]);

  const pick = (id: string, autoScan: boolean) => {
    loadedFromUrl.current = true; // the URL change below must not trigger a second load
    loadDraft(id, autoScan);
    router.replace(id ? `/scan?draft=${id}` : "/scan", { scroll: false });
  };

  // Verified findings first (by severity), then anything the Verifier sent to a human.
  const sorted = useMemo(
    () =>
      [...(result?.findings ?? [])].sort(
        (a, b) =>
          Number(a.review === "needs_review") - Number(b.review === "needs_review") ||
          SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
          a.span.start - b.span.start,
      ),
    [result],
  );
  const numberOf = useCallback((f: Finding) => sorted.findIndex((x) => x.id === f.id) + 1, [sorted]);
  const counts = useMemo(
    () => ({
      high: sorted.filter((f) => f.severity === "high").length,
      medium: sorted.filter((f) => f.severity === "medium").length,
      low: sorted.filter((f) => f.severity === "low").length,
    }),
    [sorted],
  );
  const open = sorted.filter((f) => !decisions[keyOf(f)]);
  const canApply = result !== null && text === scannedText;

  const select = (f: Finding) => {
    setSelectedId(f.id);
    document.getElementById(`finding-${f.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const applyFix = (f: Finding, replacement: string, how: "accepted" | "edited") => {
    const next = scannedText.slice(0, f.span.start) + replacement + scannedText.slice(f.span.end);
    setDecisions((d) => ({ ...d, [keyOf(f)]: { action: how } }));
    setVersions((v) => [...v, { n: v.length + 1, text: next, note: `${how === "accepted" ? "Accepted fix" : "Edited"} ${f.rule}` }]);
    setText(next);
    void scan({ text: next });
  };

  const setAlt = (f: Finding, alt: string) => {
    const next = images.map((i) => (i.name === f.imageFile ? { ...i, alt } : i));
    setImages(next);
    setDecisions((d) => ({ ...d, [keyOf(f)]: { action: "edited" } }));
    void scan({ images: next });
  };

  const upload = (files: FileList | null) => {
    if (!files) return;
    [...files].slice(0, 4 - images.length).forEach((file) => {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        setError("Images must be PNG, JPEG or WebP.");
        setStatus("error");
        return;
      }
      const r = new FileReader();
      r.onload = () => setImages((prev) => [...prev, { name: file.name, src: String(r.result), dataUrl: String(r.result), alt: "" }]);
      r.readAsDataURL(file);
    });
  };

  const scanning = status === "scanning";
  const current = drafts.find((d) => d.id === draftId);

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      {/* ---------------- Left: the draft ---------------- */}
      <Window title="C:\KASAUTI\DRAFT.TXT" color="teal" bodyClassName="relative p-4 sm:p-5 space-y-5">
        <div>
          <label htmlFor="demo-picker" className="font-mono text-xs font-bold uppercase tracking-wider">
            1 · Load a demo draft
          </label>
          <select
            id="demo-picker"
            value={draftId}
            onChange={(e) => pick(e.target.value, true)}
            className="mt-1 w-full border-2 border-ink bg-card px-3 py-2.5 text-base shadow-hard-sm"
          >
            <option value="">— Blank draft (paste your own copy) —</option>
            {drafts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.id} · {d.title}
              </option>
            ))}
          </select>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="self-center font-mono text-xs text-muted">Quick picks:</span>
            {QUICK.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => pick(id, true)}
                className={`border-2 border-ink px-2 py-1 font-mono text-xs shadow-hard-sm press ${draftId === id ? "bg-yellow" : "bg-card"}`}
              >
                {id}
              </button>
            ))}
          </div>
          {current && (
            <p className="mt-2 text-sm text-muted">
              {current.channel} · by {current.author} · answer key lists {current.expectedCount} issue{current.expectedCount === 1 ? "" : "s"}
            </p>
          )}
        </div>

        <div role="tablist" aria-label="Draft view" className="flex gap-2 border-b-2 border-ink">
          {(["edit", "review"] as const).map((v) => {
            const on = view === v || (v === "edit" && !result);
            return (
              <button
                key={v}
                role="tab"
                type="button"
                aria-selected={on}
                disabled={v === "review" && !result}
                onClick={() => setView(v)}
                className={`relative -mb-0.5 border-2 border-b-0 border-ink px-4 py-2 font-mono text-sm font-bold disabled:opacity-40 ${on ? "bg-card" : "bg-sunk"}`}
              >
                {v === "edit" ? "2 · Edit copy" : `Highlights${result ? ` (${sorted.filter((f) => f.location === "text").length})` : ""}`}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {view === "edit" || !result ? (
            <motion.div key="edit" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
              <div>
                <label htmlFor="draft-text" className="sr-only">
                  Draft copy
                </label>
                <textarea
                  id="draft-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void scan();
                  }}
                  rows={7}
                  placeholder="Paste a post, email or banner copy here…"
                  className="w-full border-2 border-ink bg-card p-3 text-lg leading-relaxed"
                />
                <p className="mt-1 text-right font-mono text-xs text-muted">{text.length} characters · Ctrl/⌘ + Enter to scan</p>
              </div>

              <fieldset className="border-2 border-ink bg-term p-4 text-paper">
                <legend className="bg-term px-2 font-mono text-xs font-bold uppercase tracking-wider text-yellow">intent_card.txt · set by creator</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ["purpose", "Purpose", "e.g. Festive-sale sign-ups"],
                      ["audience", "Audience", "e.g. Existing customers, casual"],
                      ["mustKeep", "Must keep", "e.g. urgency, the 20% offer"],
                    ] as const
                  ).map(([k, label, ph]) => (
                    <label key={k} className="block">
                      <span className="font-mono text-xs uppercase tracking-wider text-term-green">{label}</span>
                      <input
                        value={intent[k]}
                        onChange={(e) => setIntent((s) => ({ ...s, [k]: e.target.value }))}
                        placeholder={ph}
                        className="mt-1 w-full border-2 border-term-green/60 bg-[#152019] px-2 py-1.5 text-sm text-paper placeholder:text-paper/40"
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-3 text-xs text-paper/70">Intent Lock (Round 3) will test every suggested fix against this card so fixes never flatten your message.</p>
              </fieldset>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-xs font-bold uppercase tracking-wider">Images ({images.length}/4)</p>
                  <label className="inline-flex cursor-pointer items-center gap-2 border-2 border-ink bg-card px-3 py-1.5 text-sm font-bold shadow-hard-sm press">
                    <Icon name="image" /> Add image
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      className="sr-only"
                      disabled={images.length >= 4}
                      onChange={(e) => {
                        upload(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {images.length > 0 && (
                  <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                    {images.map((img, i) => (
                      <motion.li key={`${img.name}-${i}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="border-2 border-ink bg-card p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element -- user uploads are data URLs */}
                        <img src={img.src} alt={img.alt ?? ""} className="aspect-video w-full border-2 border-ink bg-paper object-contain" />
                        <p className="mt-2 truncate font-mono text-xs">{img.name}</p>
                        <label className="mt-1 block text-xs">
                          <span className="font-bold">Alt text</span>
                          <input
                            value={img.alt ?? ""}
                            onChange={(e) => setImages((prev) => prev.map((p, j) => (j === i ? { ...p, alt: e.target.value } : p)))}
                            placeholder="Describe the image (missing = finding)"
                            className="mt-1 w-full border-2 border-ink bg-paper px-2 py-1 text-sm"
                          />
                        </label>
                        <button type="button" onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))} className="mt-2 font-mono text-xs underline">
                          Remove
                        </button>
                      </motion.li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-col gap-2 border-2 border-ink bg-card p-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={aiOn} onChange={(e) => setAiOn(e.target.checked)} className="h-4 w-4 accent-teal" />
                    <span>
                      <b>AI review</b> — NVIDIA model judges tone, claim scope and offers; every finding passes the Verifier
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={ocr} onChange={(e) => setOcr(e.target.checked)} className="h-4 w-4 accent-teal" />
                    <span>
                      <b>Read image text</b> — NVIDIA vision reads words inside images
                    </span>
                  </label>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key={`review-${runs}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-3">
              <HighlightedDraft text={scannedText} findings={sorted} numberOf={numberOf} selectedId={selectedId} onSelect={select} />
              <p className="text-sm text-muted">Click a highlight to jump to its finding. Switch to “Edit copy” to change the text.</p>
              {versions.length > 1 && (
                <details className="border-2 border-ink bg-card p-3">
                  <summary className="cursor-pointer font-mono text-sm font-bold">Version history ({versions.length})</summary>
                  <ol className="mt-2 space-y-1 text-sm">
                    {versions.map((v) => (
                      <li key={v.n} className="flex items-center justify-between gap-2">
                        <span>
                          <span className="font-mono font-bold">v{v.n}</span> · {v.note}
                        </span>
                        {v.text !== text && (
                          <button
                            type="button"
                            className="font-mono text-xs underline"
                            onClick={() => {
                              setText(v.text);
                              void scan({ text: v.text });
                            }}
                          >
                            restore
                          </button>
                        )}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-wrap items-center gap-3 border-t-2 border-dashed border-ink pt-4">
          <Button variant="primary" size="lg" onClick={() => void scan()} disabled={scanning} className="grow sm:grow-0">
            <Icon name="scan" className="h-5 w-5" />
            {scanning ? "Scanning…" : result ? "3 · Scan again" : "3 · Run Kasauti scan"}
          </Button>
          {(text || result) && (
            <Button variant="ghost" onClick={() => pick("", false)}>
              Clear
            </Button>
          )}
        </div>
        <AnimatePresence>
          {scanning && (
            <motion.div
              initial={{ opacity: 0, scaleX: 0.6 }}
              animate={{ opacity: 1, scaleX: 1 }}
              exit={{ opacity: 0 }}
              className="progress-stripes progress-run h-4 origin-left border-2 border-ink"
              aria-hidden
            />
          )}
        </AnimatePresence>
        {status === "error" && (
          <motion.p role="alert" initial={{ x: -6 }} animate={{ x: [6, -4, 2, 0] }} className="border-2 border-ink bg-mark-high px-3 py-2 font-medium">
            {error}
          </motion.p>
        )}

        {/* scanline sweeping the draft while the checks run */}
        <AnimatePresence>
          {scanning && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
              <motion.div
                className="absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-teal/25 to-transparent"
                animate={{ top: ["-10%", "100%"] }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <div className="absolute inset-x-0 top-1/2 h-0.5 bg-teal" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Window>

      {/* ---------------- Right: findings ---------------- */}
      <div ref={findingsRef} className="scroll-mt-6">
        <Window title="C:\KASAUTI\FINDINGS.LOG" color={!result ? "ink" : sorted.length ? "red" : "teal"} bodyClassName="p-4 sm:p-5 space-y-4" delay={0.08}>
          <div aria-live="polite" className="border-2 border-ink bg-term p-4 font-mono text-sm text-paper sm:text-base">
            <p className="text-yellow">&gt; kasauti scan {draftId ? `draft_${draftId}.txt` : "draft.txt"}</p>
            {!result && !scanning && (
              <>
                <p className="mt-2 text-term-green">Ready.</p>
                <p className="text-paper/80">Load a demo draft or paste copy, then press Run scan.</p>
              </>
            )}
            {scanning && (
              <TypeLines
                className="mt-2 space-y-1"
                start={0}
                step={0.9}
                lines={[
                  { text: "Running code checks…", className: "text-term-green" },
                  ...(aiOn
                    ? [
                        { text: "Masking personal data…", className: "text-term-green" },
                        { text: "Retrieving rules + proof…", className: "text-term-green" },
                        { text: "Asking the NVIDIA reviewer…", className: "text-yellow" },
                        { text: "Verifier testing each finding…", className: "text-yellow" },
                      ]
                    : []),
                ]}
              />
            )}
            {result && !scanning && (
              <div key={runs}>
                <TypeLines
                  className="mt-2 space-y-1"
                  start={0.05}
                  step={0.12}
                  lines={[
                    ...sorted.slice(0, 6).map((f) => ({
                      text: `[${f.severity === "high" ? "FAIL" : "WARN"}] ${f.rule} · ${f.quote.length > 34 ? `${f.quote.slice(0, 34)}…` : f.quote}`,
                      className: f.severity === "high" ? "text-term-red" : f.severity === "medium" ? "text-yellow" : "text-[#9db8f0]",
                    })),
                    ...(sorted.length > 6 ? [{ text: `…and ${sorted.length - 6} more`, className: "text-paper/70" }] : []),
                    {
                      text:
                        sorted.length === 0
                          ? "[ OK ] No issues found by code checks."
                          : `${sorted.length} finding${sorted.length === 1 ? "" : "s"}: ${counts.high} high · ${counts.medium} medium · ${counts.low} low.`,
                      className: "pt-2 text-term-green",
                    },
                    {
                      text: result.ai.ran
                        ? `AI: ${result.ai.proposed ?? 0} proposed · ${result.ai.verified ?? 0} verified · ${result.ai.needsReview ?? 0} to a human · ${result.ai.dropped?.length ?? 0} dropped`
                        : `AI: off — ${result.ai.error ?? "code checks only"}`,
                      className: result.ai.ran ? "text-[#9db8f0]" : "text-paper/60",
                    },
                    {
                      text: sorted.length === 0 ? "Clean." : open.length ? "Human review required." : "All findings handled.",
                      className: "text-term-green",
                    },
                  ]}
                />
                <p className="mt-1 text-paper/60">
                  scanned in {result.timings.totalMs} ms<span className="cursor-blink"> _</span>
                </p>
              </div>
            )}
          </div>

          {result && !scanning && result.images.length > 0 && (
            <div className="space-y-2">
              <p className="font-mono text-xs font-bold uppercase tracking-wider">Text read from images</p>
              {result.images.map((img) => (
                <div key={img.name} className="border-2 border-ink bg-card p-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-mono text-xs">
                    <span className="font-bold">{img.name}</span>
                    {img.textSource === "nvidia" && (
                      <Badge tone="info">
                        AI · {img.modelId?.split("/").at(-1)} · {img.latencyMs} ms
                      </Badge>
                    )}
                    {img.textSource === "demo" && <Badge tone="warn">demo text</Badge>}
                    {img.textSource === "none" && <Badge tone="neutral">no text</Badge>}
                  </p>
                  {img.text && <p className="mt-1 whitespace-pre-wrap font-mono">{img.text}</p>}
                  {img.note && <p className="mt-1 text-xs text-muted">{img.note}</p>}
                </div>
              ))}
            </div>
          )}

          {result && !scanning && sorted.length > 0 && (
            <ol className="space-y-4">
              <AnimatePresence initial={false}>
                {sorted.map((f, i) => (
                  <li key={f.id}>
                    {f.review === "needs_review" && sorted.findIndex((x) => x.review === "needs_review") === i && (
                      <p className="mb-3 mt-2 flex items-center gap-2 border-y-2 border-dashed border-ink py-2 font-pixel text-lg font-bold">
                        <Icon name="warn" className="h-5 w-5 text-mustard" /> Needs human review
                        <span className="font-sans text-sm font-normal text-muted">— the Verifier wasn&rsquo;t sure enough to show these as verified</span>
                      </p>
                    )}
                    <FindingCard
                      finding={f}
                      number={i + 1}
                      rule={rules[f.rule]}
                      evidence={f.evidence ? evidence[f.evidence] : undefined}
                      decision={decisions[keyOf(f)]}
                      canApply={canApply}
                      selected={selectedId === f.id}
                      onSelect={() => setSelectedId(f.id)}
                      onApply={(rep, how) => applyFix(f, rep, how)}
                      onDispute={(note) => setDecisions((d) => ({ ...d, [keyOf(f)]: { action: "disputed", note } }))}
                      onSetAlt={(alt) => setAlt(f, alt)}
                      onNote={(note) => setDecisions((d) => ({ ...d, [keyOf(f)]: { action: "noted", note } }))}
                    />
                  </li>
                ))}
              </AnimatePresence>
            </ol>
          )}

          {result && !scanning && sorted.length === 0 && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex items-start gap-3 border-2 border-ink bg-card p-4">
              <Icon name="check" className="mt-0.5 h-6 w-6 text-teal" />
              <div>
                <p className="font-bold">Clean on every code check.</p>
                <p className="text-sm text-muted">Terms, prices, expiry dates, superlatives, punctuation, readability and accessibility all pass.</p>
              </div>
            </motion.div>
          )}

          {result && !scanning && result.ai.ran && (
            <details className="border-2 border-ink bg-term p-3 font-mono text-sm text-paper">
              <summary className="cursor-pointer font-bold text-yellow">ai_disclosure.txt — what the AI saw and did</summary>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-term-green">model</dt>
                <dd>
                  {result.ai.modelId} · {result.ai.latencyMs} ms
                </dd>
                <dt className="text-term-green">rules</dt>
                <dd>{result.ai.rulesConsidered?.join(", ")}</dd>
                <dt className="text-term-green">proof</dt>
                <dd>{result.ai.evidenceConsidered?.join(", ") || "—"}</dd>
                <dt className="text-term-green">masked</dt>
                <dd>{result.ai.maskedItems ?? 0} personal detail(s) hidden before the call</dd>
                <dt className="text-term-green">safety</dt>
                <dd>
                  {result.ai.safety
                    ? `${result.ai.safety.safe ? "safe" : `unsafe: ${result.ai.safety.categories.join(", ")}`} · ${result.ai.safety.modelId.split("/").at(-1)}`
                    : "not checked"}
                </dd>
              </dl>
              {result.ai.dropped && result.ai.dropped.length > 0 && (
                <>
                  <p className="mt-3 text-yellow">Dropped by the Verifier (never shown as findings):</p>
                  <ul className="mt-1 space-y-1">
                    {result.ai.dropped.map((d, i) => (
                      <li key={i} className="text-paper/80">
                        <span className="text-term-red">[DROP]</span> {d.rule} “{d.quote}” — {d.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </details>
          )}

          {result && !scanning && !result.ai.ran && result.candidates.length > 0 && (
            <details className="border-2 border-dashed border-ink bg-card p-3">
              <summary className="cursor-pointer font-mono text-sm font-bold">
                Waiting for AI review · {result.candidates.length} possible claim{result.candidates.length === 1 ? "" : "s"}
              </summary>
              <p className="mt-2 text-sm text-muted">
                Code can’t decide these alone. Turn on AI review and the NVIDIA reviewer checks each one against the Claim Ledger; the Verifier drops anything it can’t ground.
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {result.candidates.map((c, i) => (
                  <li key={`${c.text}-${i}`} title={c.note} className="border-2 border-ink bg-paper px-2 py-1 font-mono text-xs">
                    {c.type} · “{c.text}”{c.evidence.length ? ` → ${c.evidence.join(", ")}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Window>
      </div>
    </div>
  );
}
