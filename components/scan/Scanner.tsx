"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/retro/Badge";
import { Button } from "@/components/retro/Button";
import { Icon } from "@/components/retro/Icon";
import { TypeLines } from "@/components/retro/Motion";
import { Window } from "@/components/retro/Window";
import { ClaimLedger, type ProofDraft } from "@/components/scan/ClaimLedger";
import { FindingCard, type Decision } from "@/components/scan/FindingCard";
import { HighlightedDraft } from "@/components/scan/HighlightedDraft";
import Link from "next/link";
import { parseCustom, saveCustom, useCustomRaw, type CustomSettings } from "@/lib/custom-pack";
import type { DemoDraft, EvidenceInfo, RuleInfo, ScanResponse } from "@/lib/scan-types";
import type { BrandPackData, Evidence } from "@/lib/schemas/brand-pack";
import type { LedgerClaim } from "@/lib/schemas/claim";
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
const keyOf = (f: Finding) => `${f.rule}|${f.location}|${f.imageFile ?? ""}|${f.quote}`;

/** The ledger value for proof a reviewer adds from a claim: numbers stay numbers, so code can check them. */
function proofValue(c: LedgerClaim): Evidence["value"] {
  const n = /(\d+(?:,\d+)*(?:\.\d{1,2})?)/.exec(c.text);
  const value = n ? Number(n[1].replace(/,/g, "")) : NaN;
  if (c.kind === "price" && value > 0) return { kind: "price", amountInr: value };
  if (c.kind === "percent" && value > 0 && value <= 100) return { kind: "percent", percent: value };
  if (c.kind === "days" && Number.isInteger(value) && value > 0) return { kind: "days", days: value };
  return { kind: "text", text: c.text };
}

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
  basePack,
  demoToday,
}: {
  drafts: DemoDraft[];
  rules: Record<string, RuleInfo>;
  evidence: Record<string, EvidenceInfo>;
  /** The built-in brand pack — the starting point when a reviewer adds proof to the ledger. */
  basePack: BrandPackData;
  demoToday: string;
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

  // A brand pack customised on the Customise page (saved in this browser) overrides the built-in one.
  const customRaw = useCustomRaw();
  const custom = useMemo(() => parseCustom(customRaw), [customRaw]);
  const ruleInfo = useMemo<Record<string, RuleInfo>>(
    () =>
      custom
        ? Object.fromEntries(custom.pack.rules.map((r) => [r.code, { code: r.code, title: r.title, layer: r.layer, checkType: r.checkType }]))
        : rules,
    [custom, rules],
  );
  const evidenceInfo = useMemo<Record<string, EvidenceInfo>>(
    () =>
      custom
        ? Object.fromEntries(
            custom.pack.evidence.map((e) => [
              e.code,
              {
                code: e.code,
                title: e.title,
                claim: e.claim,
                source: e.source,
                expiresAt: e.expiresAt,
                expired: e.expiresAt !== null && e.expiresAt < custom.today,
                verifiedAt: e.verifiedAt,
                owner: `${e.owner.name} (${e.owner.role})`,
              },
            ]),
          )
        : evidence,
    [custom, evidence],
  );

  const [result, setResult] = useState<ScanResponse | null>(null);
  const [scannedText, setScannedText] = useState("");
  const [status, setStatus] = useState<"idle" | "scanning" | "error">("idle");
  const [error, setError] = useState("");
  const [view, setView] = useState<"edit" | "review">("edit");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [runs, setRuns] = useState(0);
  const [ledgerLog, setLedgerLog] = useState<string[]>([]);

  const scan = useCallback(
    async (overrides?: { text?: string; images?: DraftImage[]; pack?: BrandPackData; today?: string }) => {
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
          body: JSON.stringify({
            text: body,
            images: payloadImages,
            ocr,
            ai: aiOn,
            intent,
            ...(overrides?.pack
              ? { pack: overrides.pack, today: overrides.today }
              : custom
                ? { pack: custom.pack, today: custom.today }
                : {}),
          }),
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
    [text, images, ocr, aiOn, intent, custom],
  );

  const loadDraft = useCallback(
    (id: string, autoScan: boolean) => {
      const d = drafts.find((x) => x.id === id);
      setDraftId(d ? id : "");
      setResult(null);
      setVersions([]);
      setDecisions({});
      setLedgerLog([]);
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

  /** Every open text finding with a ready-made fix, minus any that overlap (the first, most severe, wins). */
  const batch = useMemo(() => {
    const picked: Finding[] = [];
    for (const f of sorted) {
      if (f.location !== "text" || f.suggestedFix === null || decisions[keyOf(f)]) continue;
      if (picked.some((p) => f.span.start < p.span.end && p.span.start < f.span.end)) continue;
      picked.push(f);
    }
    return picked;
  }, [sorted, decisions]);

  /** Apply every fix in one go (right to left so offsets stay valid), then re-check the whole draft once. */
  const applyAll = () => {
    if (!canApply || batch.length === 0) return;
    let next = scannedText;
    for (const f of [...batch].sort((a, b) => b.span.start - a.span.start)) {
      next = next.slice(0, f.span.start) + f.suggestedFix + next.slice(f.span.end);
    }
    setDecisions((d) => ({ ...d, ...Object.fromEntries(batch.map((f) => [keyOf(f), { action: "accepted" as const }])) }));
    setVersions((v) => [...v, { n: v.length + 1, text: next, note: `Accepted ${batch.length} fixes (${batch.map((f) => f.rule).join(", ")})` }]);
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

  /**
   * A reviewer accepts an unproven claim by adding proof: a new ledger entry with owner and expiry.
   * Until the database exists (Stage 2) it is saved in this browser's custom brand pack, then the draft is re-scanned.
   */
  const ledgerToday = custom?.today ?? demoToday;
  const addProof = (c: LedgerClaim, p: ProofDraft) => {
    const base: CustomSettings = custom ?? { rules: basePack.rules, disabled: [], pack: basePack, today: demoToday, savedAt: "" };
    const next = Math.max(0, ...base.pack.evidence.map((e) => Number(e.code.slice(4)) || 0)) + 1;
    if (next > 99) {
      setError("The ledger is full (KLE-99). Remove an old entry on the Customise page first.");
      setStatus("error");
      return;
    }
    const code = `KLE-${String(next).padStart(2, "0")}`;
    const entry: Evidence = {
      code,
      title: `Added in review: ${c.text.length > 40 ? `${c.text.slice(0, 40)}…` : c.text}`,
      claim: p.claim,
      value: proofValue(c),
      source: p.source,
      owner: { name: p.ownerName, role: p.ownerRole },
      verifiedAt: base.today,
      expiresAt: p.expiresAt,
      tags: ["added-in-review"],
    };
    const pack = { ...base.pack, evidence: [...base.pack.evidence, entry] };
    if (!saveCustom({ ...base, pack, savedAt: new Date().toISOString() })) {
      setError("Couldn't save to this browser's storage, so the proof wasn't added.");
      setStatus("error");
      return;
    }
    setLedgerLog((l) => [...l, `${code} added for “${c.text}” · owner ${p.ownerName} · ${p.expiresAt ? `expires ${p.expiresAt}` : "no expiry"}`]);
    void scan({ pack, today: base.today });
  };

  const scanning = status === "scanning";
  const current = drafts.find((d) => d.id === draftId);
  const showcase = drafts.filter((d) => d.shows);

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      {/* ---------------- Left: the draft ---------------- */}
      <Window title="C:\KASAUTI\DRAFT.TXT" color="teal" bodyClassName="relative p-4 sm:p-5 space-y-5">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-wider">1 · Pick an example, or paste your own</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {showcase.map((d, i) => {
              const on = draftId === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(d.id, true)}
                  className={`border-2 border-ink p-2 text-left shadow-hard-sm press ${on ? "bg-yellow" : "bg-card"}`}
                >
                  <span className="block font-pixel text-sm font-bold">Example {i + 1}</span>
                  <span className="mt-0.5 block text-sm leading-snug">{d.title}</span>
                  <span className="mt-1 block font-mono text-[11px] uppercase text-muted">{d.channel}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => pick("", false)}
            className={`mt-2 border-2 border-dashed border-ink px-2 py-1 font-mono text-xs press ${draftId === "" && text === "" ? "bg-sunk" : "bg-card"}`}
          >
            Blank draft — paste your own copy
          </button>
          {custom && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="ok">custom brand pack</Badge>
              Checking against your “{custom.pack.brand.name}” settings ({custom.pack.rules.length} rules on).
              <Link href="/customise" className="font-bold underline">
                Edit
              </Link>
            </p>
          )}
          {current?.shows && (
            <details className="mt-3 border-2 border-ink bg-card p-3" open>
              <summary className="cursor-pointer font-mono text-xs font-bold uppercase tracking-wider">What this example shows</summary>
              <ul className="mt-2 space-y-1 text-sm">
                {current.shows.map((s) => (
                  <li key={s} className="flex gap-2">
                    <Icon name="check" className="mt-0.5 h-3.5 w-3.5 text-teal" />
                    {s}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {current && !current.shows && (
            <p className="mt-2 text-sm text-muted">
              Test-set draft {current.id} · {current.title} · answer key lists {current.expectedCount} issue{current.expectedCount === 1 ? "" : "s"}
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
                          ? "[ OK ] No issues found."
                          : `${sorted.length} finding${sorted.length === 1 ? "" : "s"}: ${counts.high} high · ${counts.medium} medium · ${counts.low} low.`,
                      className: "pt-2 text-term-green",
                    },
                    // Only say what the AI did. If it didn't run, the code checks speak for themselves.
                    ...(result.ai.ran
                      ? [
                          {
                            text: `AI: ${result.ai.proposed ?? 0} proposed · ${result.ai.verified ?? 0} verified · ${result.ai.needsReview ?? 0} to a human · ${result.ai.dropped?.length ?? 0} dropped`,
                            className: "text-[#9db8f0]",
                          },
                        ]
                      : []),
                    ...(result.claims.length
                      ? [
                          {
                            text: `Ledger: ${result.claims.length} claim${result.claims.length === 1 ? "" : "s"} · ${result.claims.filter((c) => c.status === "verified").length} verified · ${result.claims.filter((c) => c.status === "stale" || c.status === "contradicted").length} stale/contradicted · ${result.claims.filter((c) => c.status === "no_evidence" || c.status === "unchecked").length} unproven`,
                            className: "text-yellow",
                          },
                        ]
                      : []),
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

          {result && !scanning && batch.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap items-center gap-3 border-2 border-ink bg-yellow p-3 shadow-hard-sm"
            >
              <Button variant="dark" onClick={applyAll} disabled={!canApply}>
                <Icon name="check" /> Accept all {batch.length} fix{batch.length === 1 ? "" : "es"}
              </Button>
              <span className="text-sm">
                Applies every suggested fix at once, then re-checks the whole draft in one pass. You can still accept, edit or dispute each
                one below.
              </span>
            </motion.div>
          )}

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
                    {img.textSource === "demo" && <Badge tone="neutral">text in image</Badge>}
                    {img.textSource === "none" && <Badge tone="neutral">no text</Badge>}
                  </p>
                  {img.text && <p className="mt-1 whitespace-pre-wrap font-mono">{img.text}</p>}
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
                      rule={ruleInfo[f.rule]}
                      evidence={f.evidence ? evidenceInfo[f.evidence] : undefined}
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

        </Window>

        {result && !scanning && (
          <Window title="C:\KASAUTI\CLAIMS.DAT" color="blue" className="mt-6" bodyClassName="p-4 sm:p-5 space-y-4" delay={0.12}>
            <div>
              <h2 className="font-pixel text-xl font-bold">Claim Ledger for this draft</h2>
              <p className="text-sm text-muted">
                Every price, offer, number, certificate and superlative, checked against proof with an expiry date. Verified claims stay; the rest need a fix
                or proof.
              </p>
            </div>
            {ledgerLog.length > 0 && (
              <ul className="space-y-1 border-2 border-ink bg-term p-3 font-mono text-xs text-term-green">
                {ledgerLog.map((l, i) => (
                  <li key={i}>&gt; {l}</li>
                ))}
                <li className="text-paper/60">Saved in this browser — see it on the Claim Ledger page.</li>
              </ul>
            )}
            <ClaimLedger
              claims={result.claims}
              evidence={evidenceInfo}
              ledgerAi={result.ai.ledger}
              today={ledgerToday}
              findingNumber={(id) => {
                const n = sorted.findIndex((f) => f.id === id);
                return n < 0 ? null : n + 1;
              }}
              onJump={(id) => {
                const f = sorted.find((x) => x.id === id);
                if (f) select(f);
              }}
              onAddProof={addProof}
              canAdd={canApply}
            />
          </Window>
        )}
      </div>
    </div>
  );
}
