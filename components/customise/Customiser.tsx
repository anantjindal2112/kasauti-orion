"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/retro/Badge";
import { Button, ButtonLink } from "@/components/retro/Button";
import { Icon } from "@/components/retro/Icon";
import { Window } from "@/components/retro/Window";
import { clearCustom, customSettingsSchema, effectivePack, parseCustom, saveCustom, useCustomRaw, type CustomSettings } from "@/lib/custom-pack";
import { brandPackSchema, type BrandPackData, type Evidence, type Rule } from "@/lib/schemas/brand-pack";

/* ---------------- form model: everything as editable strings ---------------- */

const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
const join = (a: string[]) => a.join("\n");

interface RuleForm {
  base: Rule;
  enabled: boolean;
  title: string;
  body: string;
  severity: Rule["severity"];
  good: string;
  bad: string;
}

interface EvidenceForm {
  base: Evidence | null;
  code: string;
  title: string;
  claim: string;
  kind: "price" | "threshold" | "percent" | "text" | "other";
  amount: string;
  source: string;
  verifiedAt: string;
  expiresAt: string;
  conditions: string;
}

interface Form {
  name: string;
  tagline: string;
  audience: string;
  voiceSummary: string;
  voiceDo: string;
  voiceDont: string;
  products: string;
  maxExclamationMarks: string;
  maxEmoji: string;
  readabilityMaxGrade: string;
  today: string;
  brandCorrect: string;
  brandWrong: string;
  productNames: string;
  banned: string;
  replace: string;
  competitors: string;
  approvedAcronyms: string;
  superlatives: string;
  claimCandidates: string;
  absoluteClaims: string;
  pressurePhrases: string;
  rules: RuleForm[];
  evidence: EvidenceForm[];
}

function evidenceForm(e: Evidence): EvidenceForm {
  const v = e.value;
  const kind = v.kind === "price" || v.kind === "threshold" ? v.kind : v.kind === "percent" ? "percent" : v.kind === "text" ? "text" : "other";
  const amount = v.kind === "price" || v.kind === "threshold" ? String(v.amountInr) : v.kind === "percent" ? String(v.percent) : "";
  return {
    base: e,
    code: e.code,
    title: e.title,
    claim: e.claim,
    kind,
    amount,
    source: e.source,
    verifiedAt: e.verifiedAt,
    expiresAt: e.expiresAt ?? "",
    conditions: e.conditions ?? "",
  };
}

function toForm(pack: BrandPackData, allRules: Rule[], disabled: string[], today: string): Form {
  const { brand, terms } = pack;
  const off = new Set(disabled);
  return {
    name: brand.name,
    tagline: brand.tagline,
    audience: brand.audience,
    voiceSummary: brand.voice.summary,
    voiceDo: join(brand.voice.do),
    voiceDont: join(brand.voice.dont),
    products: join(brand.products),
    maxExclamationMarks: String(brand.limits.maxExclamationMarks),
    maxEmoji: String(brand.limits.maxEmoji),
    readabilityMaxGrade: String(brand.limits.readabilityMaxGrade),
    today,
    brandCorrect: terms.brandName.correct,
    brandWrong: join(terms.brandName.wrong),
    productNames: join(terms.productNames.map((p) => `${p.correct}: ${p.wrong.join(", ")}`)),
    banned: join(terms.banned.map((b) => `${b.term} — ${b.reason}`)),
    replace: join(terms.replace.map((r) => `${r.term} → ${r.with}`)),
    competitors: join(terms.competitors),
    approvedAcronyms: join(terms.approvedAcronyms),
    superlatives: join(terms.superlatives),
    claimCandidates: join(terms.claimCandidates),
    absoluteClaims: join(terms.absoluteClaims),
    pressurePhrases: join(terms.pressurePhrases),
    rules: allRules.map((r) => ({
      base: r,
      enabled: !off.has(r.code),
      title: r.title,
      body: r.body,
      severity: r.severity,
      good: join(r.goodExamples),
      bad: join(r.badExamples),
    })),
    evidence: pack.evidence.map(evidenceForm),
  };
}

function fromForm(f: Form, defaults: BrandPackData): { settings?: CustomSettings; errors: string[] } {
  const num = (s: string, label: string, errors: string[]) => {
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) errors.push(`${label} must be a number of 0 or more.`);
    return n;
  };
  const errors: string[] = [];
  const knownRule = new Map(defaults.terms.replace.map((r) => [r.term.toLowerCase(), r.rule]));

  const rules: Rule[] = f.rules.map((r) => ({
    ...r.base,
    title: r.title.trim(),
    body: r.body.trim(),
    severity: r.severity,
    goodExamples: lines(r.good),
    badExamples: lines(r.bad),
  }));
  const disabled = f.rules.filter((r) => !r.enabled).map((r) => r.base.code);

  const evidence: Evidence[] = f.evidence.map((e) => {
    const amount = Number(e.amount);
    const value: Evidence["value"] =
      e.kind === "price" || e.kind === "threshold"
        ? { kind: e.kind, amountInr: amount }
        : e.kind === "percent"
          ? { kind: "percent", percent: amount }
          : e.kind === "text"
            ? { kind: "text", text: e.claim }
            : e.base!.value;
    return {
      ...(e.base ?? { owner: { name: "Brand team", role: "Owner" }, tags: [] }),
      code: e.code,
      title: e.title.trim() || e.code,
      claim: e.claim.trim(),
      value,
      source: e.source.trim() || "Added in Customise",
      verifiedAt: e.verifiedAt,
      expiresAt: e.expiresAt || null,
      ...(e.conditions.trim() ? { conditions: e.conditions.trim() } : { conditions: undefined }),
    };
  });

  const base: Omit<BrandPackData, "rules"> = {
    brand: {
      ...defaults.brand,
      name: f.name.trim(),
      tagline: f.tagline.trim(),
      audience: f.audience.trim(),
      products: lines(f.products),
      voice: { summary: f.voiceSummary.trim(), do: lines(f.voiceDo), dont: lines(f.voiceDont) },
      limits: {
        maxExclamationMarks: num(f.maxExclamationMarks, "Max exclamation marks", errors),
        maxEmoji: num(f.maxEmoji, "Max emoji", errors),
        readabilityMaxGrade: num(f.readabilityMaxGrade, "Reading grade", errors),
      },
    },
    evidence,
    terms: {
      ...defaults.terms,
      brandName: { correct: f.brandCorrect.trim(), wrong: lines(f.brandWrong) },
      productNames: lines(f.productNames).map((l) => {
        const [correct, wrong = ""] = l.split(":");
        return { correct: correct.trim(), wrong: wrong.split(",").map((w) => w.trim()).filter(Boolean) };
      }),
      banned: lines(f.banned).map((l) => {
        const [term, ...reason] = l.split(/\s+[—–-]\s+/);
        return { term: term.trim(), rule: "KSR-2.3", reason: reason.join(" — ").trim() || "Not on brand." };
      }),
      replace: lines(f.replace).map((l) => {
        const [term, w = ""] = l.split(/\s*(?:→|->|=>)\s*/);
        const rule = knownRule.get(term.trim().toLowerCase()) ?? (w.trim().startsWith("₹") ? "KSR-2.5" : "KSR-2.2");
        return { term: term.trim(), with: w.trim(), rule };
      }),
      competitors: lines(f.competitors),
      approvedAcronyms: lines(f.approvedAcronyms),
      superlatives: lines(f.superlatives),
      claimCandidates: lines(f.claimCandidates),
      absoluteClaims: lines(f.absoluteClaims),
      pressurePhrases: lines(f.pressurePhrases),
    },
    assets: defaults.assets,
  };

  const pack = effectivePack(base, rules, disabled);
  const parsed = brandPackSchema.safeParse(pack);
  if (!parsed.success) errors.push(...parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(" › ")}: ${i.message}`));
  if (errors.length) return { errors };

  const settings = { rules, disabled, pack: parsed.data!, today: f.today, savedAt: new Date().toISOString() };
  const check = customSettingsSchema.safeParse(settings);
  if (!check.success) return { errors: check.error.issues.slice(0, 6).map((i) => `${i.path.join(" › ")}: ${i.message}`) };
  return { settings: check.data, errors: [] };
}

/* ---------------- small field components ---------------- */

const LABEL = "block font-mono text-xs font-bold uppercase tracking-wider";
const INPUT = "mt-1 w-full border-2 border-ink bg-card px-3 py-2";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

function ListField({ label, hint, value, onChange, rows = 4 }: { label: string; hint?: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <Field label={label} hint={hint ?? "One per line."}>
      <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className={`${INPUT} font-mono text-sm`} />
    </Field>
  );
}

const TABS = [
  ["brand", "Brand"],
  ["limits", "Limits & date"],
  ["words", "Words"],
  ["rules", "Rules"],
  ["ledger", "Claim Ledger"],
] as const;
type Tab = (typeof TABS)[number][0];

/* ---------------- page ---------------- */

export function Customiser({ defaults, defaultToday }: { defaults: BrandPackData; defaultToday: string }) {
  const raw = useCustomRaw();
  const saved = useMemo(() => parseCustom(raw), [raw]);
  // Tab and messages live out here so they survive the editor reloading after a reset or import.
  const [tab, setTab] = useState<Tab>("brand");
  const [flash, setFlash] = useState("");
  const [version, setVersion] = useState(0);
  return (
    <Editor
      key={`${saved ? "custom" : "default"}-${version}`}
      defaults={defaults}
      defaultToday={defaultToday}
      saved={saved}
      tab={tab}
      setTab={setTab}
      flash={flash}
      setFlash={setFlash}
      reload={() => setVersion((v) => v + 1)}
    />
  );
}

function Editor({
  defaults,
  defaultToday,
  saved,
  tab,
  setTab,
  flash,
  setFlash,
  reload,
}: {
  defaults: BrandPackData;
  defaultToday: string;
  saved: CustomSettings | null;
  tab: Tab;
  setTab: (t: Tab) => void;
  flash: string;
  setFlash: (m: string) => void;
  reload: () => void;
}) {
  const [form, setForm] = useState<Form>(() =>
    saved ? toForm(saved.pack, saved.rules, saved.disabled, saved.today) : toForm(defaults, defaults.rules, [], defaultToday),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };
  const setRule = (i: number, patch: Partial<RuleForm>) => set("rules", form.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setEv = (i: number, patch: Partial<EvidenceForm>) => set("evidence", form.evidence.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  const say = (m: string) => {
    setFlash(m);
    setTimeout(() => setFlash(""), 2500);
  };

  const save = () => {
    const { settings, errors } = fromForm(form, defaults);
    setErrors(errors);
    if (!settings) return;
    if (saveCustom(settings)) {
      setDirty(false);
      say("Saved. Every scan now uses your custom brand pack.");
    }
    else setErrors(["This browser blocked saving (private mode?). Use Export to keep a copy."]);
  };

  const reset = () => {
    if (!window.confirm("Reset everything to the built-in Dhaaga & Co. brand pack? Your custom settings in this browser will be removed.")) return;
    clearCustom();
    reload();
    say("Back to the built-in Dhaaga & Co. brand pack.");
  };

  const exportJson = () => {
    const { settings, errors } = fromForm(form, defaults);
    setErrors(errors);
    if (!settings) return;
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "kasauti-brand-pack.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    const parsed = parseCustom(await file.text());
    if (!parsed) {
      setErrors(["That file isn't a Kasauti brand pack export."]);
      return;
    }
    saveCustom(parsed);
    reload();
    say("Imported and saved.");
  };

  const addEvidence = () => {
    const next = Math.max(0, ...form.evidence.map((e) => Number(e.code.slice(4)) || 0)) + 1;
    set("evidence", [
      ...form.evidence,
      {
        base: null,
        code: `KLE-${String(next).padStart(2, "0")}`,
        title: "",
        claim: "",
        kind: "price",
        amount: "",
        source: "",
        verifiedAt: form.today,
        expiresAt: "",
        conditions: "",
      },
    ]);
  };

  const enabledCount = form.rules.filter((r) => r.enabled).length;

  return (
    <div className="space-y-6">
      <Window
        title="C:\KASAUTI\SETTINGS.CFG"
        color="yellow"
        bodyClassName="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="flex flex-wrap items-center gap-3">
          {saved ? <Badge tone="ok">custom pack active</Badge> : <Badge tone="neutral">using built-in pack</Badge>}
          {dirty && <Badge tone="warn">unsaved changes</Badge>}
          <span className="text-sm text-muted">Saved in this browser. Scans send it to the server, which checks it before use.</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={save}>
            <Icon name="check" /> Save
          </Button>
          <Button onClick={exportJson}>Export JSON</Button>
          <Button onClick={() => fileRef.current?.click()}>Import JSON</Button>
          <input ref={fileRef} type="file" accept="application/json" className="sr-only" onChange={(e) => void importJson(e.target.files?.[0])} />
          <Button variant="ghost" onClick={reset}>
            Reset to default
          </Button>
          <ButtonLink href="/scan" variant="dark">
            <Icon name="scan" /> Try it in Scan
          </ButtonLink>
        </div>
      </Window>

      <AnimatePresence>
        {flash && (
          <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="border-2 border-ink bg-teal px-4 py-2 font-bold text-paper">
            {flash}
          </motion.p>
        )}
        {errors.length > 0 && (
          <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="alert" className="space-y-1 border-2 border-ink bg-mark-high p-4">
            <li className="font-bold">Not saved — fix these first:</li>
            {errors.map((e) => (
              <li key={e} className="font-mono text-sm">
                • {e}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <div>
        <div role="tablist" aria-label="Settings sections" className="flex flex-wrap gap-2 border-b-2 border-ink">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`-mb-0.5 border-2 border-b-0 border-ink px-4 py-2 font-mono text-sm font-bold ${tab === key ? "bg-paper" : "bg-sunk"}`}
            >
              {label}
              {key === "rules" && ` (${enabledCount}/${form.rules.length})`}
              {key === "ledger" && ` (${form.evidence.length})`}
            </button>
          ))}
        </div>

        <div className="border-2 border-t-0 border-ink bg-paper p-4 shadow-hard sm:p-6">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-5">
              {tab === "brand" && (
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Brand name">
                    <input value={form.name} onChange={(e) => set("name", e.target.value)} className={INPUT} />
                  </Field>
                  <Field label="Tagline">
                    <input value={form.tagline} onChange={(e) => set("tagline", e.target.value)} className={INPUT} />
                  </Field>
                  <Field label="Audience">
                    <input value={form.audience} onChange={(e) => set("audience", e.target.value)} className={INPUT} />
                  </Field>
                  <ListField label="Products" value={form.products} onChange={(v) => set("products", v)} rows={3} />
                  <div className="md:col-span-2">
                    <Field label="Voice in one line" hint="The AI reviewer reads this to judge tone.">
                      <textarea rows={2} value={form.voiceSummary} onChange={(e) => set("voiceSummary", e.target.value)} className={INPUT} />
                    </Field>
                  </div>
                  <ListField label="Voice — do" value={form.voiceDo} onChange={(v) => set("voiceDo", v)} />
                  <ListField label="Voice — don't" value={form.voiceDont} onChange={(v) => set("voiceDont", v)} />
                </div>
              )}

              {tab === "limits" && (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Max exclamation marks" hint="KSR-1.3 — per piece.">
                    <input type="number" min={0} value={form.maxExclamationMarks} onChange={(e) => set("maxExclamationMarks", e.target.value)} className={`${INPUT} font-num`} />
                  </Field>
                  <Field label="Max emoji" hint="KSR-1.5 — per piece.">
                    <input type="number" min={0} value={form.maxEmoji} onChange={(e) => set("maxEmoji", e.target.value)} className={`${INPUT} font-num`} />
                  </Field>
                  <Field label="Reading grade (max)" hint="KSR-2.4 — 8 = easy for most adults.">
                    <input type="number" min={1} value={form.readabilityMaxGrade} onChange={(e) => set("readabilityMaxGrade", e.target.value)} className={`${INPUT} font-num`} />
                  </Field>
                  <Field label="Date for expiry checks" hint="Move it forward to watch proofs expire.">
                    <input type="date" value={form.today} onChange={(e) => set("today", e.target.value)} className={`${INPUT} font-num`} />
                  </Field>
                </div>
              )}

              {tab === "words" && (
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Correct brand name" hint="KSR-2.1">
                    <input value={form.brandCorrect} onChange={(e) => set("brandCorrect", e.target.value)} className={INPUT} />
                  </Field>
                  <ListField label="Wrong spellings of the brand" value={form.brandWrong} onChange={(v) => set("brandWrong", v)} rows={3} />
                  <ListField
                    label="Product names"
                    hint="KSR-2.6 — one per line: Correct name: wrong, wrong"
                    value={form.productNames}
                    onChange={(v) => set("productNames", v)}
                  />
                  <ListField label="Banned words" hint="KSR-2.3 — one per line: word — why it's banned" value={form.banned} onChange={(v) => set("banned", v)} />
                  <ListField label="Replacements" hint="One per line: say this → instead of that (e.g. workers → artisans)" value={form.replace} onChange={(v) => set("replace", v)} />
                  <ListField label="Competitors (never name them)" hint="KSR-6.3 — one per line." value={form.competitors} onChange={(v) => set("competitors", v)} />
                  <ListField label="Superlatives that need proof" hint="KSR-4.2 — one per line." value={form.superlatives} onChange={(v) => set("superlatives", v)} />
                  <ListField label="Absolute promises (never allowed)" hint="KSR-4.4 — one per line." value={form.absoluteClaims} onChange={(v) => set("absoluteClaims", v)} />
                  <ListField label="Pressure phrases" hint="KSR-1.6 — one per line." value={form.pressurePhrases} onChange={(v) => set("pressurePhrases", v)} />
                  <ListField label="Possible-claim words (sent to AI)" hint="One per line." value={form.claimCandidates} onChange={(v) => set("claimCandidates", v)} />
                  <ListField label="Allowed acronyms in capitals" hint="KSR-1.4 — one per line." value={form.approvedAcronyms} onChange={(v) => set("approvedAcronyms", v)} rows={3} />
                </div>
              )}

              {tab === "rules" && (
                <ul className="space-y-4">
                  {form.rules.map((r, i) => (
                    <li key={r.base.code} className={`border-2 border-ink ${r.enabled ? "bg-card" : "bg-sunk opacity-70"} shadow-hard-sm`}>
                      <div className="flex flex-wrap items-center gap-3 border-b-2 border-ink bg-sunk px-3 py-2">
                        <label className="flex items-center gap-2 font-mono text-sm font-bold">
                          <input type="checkbox" checked={r.enabled} onChange={(e) => setRule(i, { enabled: e.target.checked })} className="h-4 w-4 accent-teal" />
                          {r.base.code}
                        </label>
                        <input
                          value={r.title}
                          onChange={(e) => setRule(i, { title: e.target.value })}
                          aria-label={`${r.base.code} title`}
                          className="min-w-0 flex-1 border-2 border-ink bg-paper px-2 py-1 font-bold"
                        />
                        <select
                          value={r.severity}
                          onChange={(e) => setRule(i, { severity: e.target.value as Rule["severity"] })}
                          aria-label={`${r.base.code} severity`}
                          className="border-2 border-ink bg-paper px-2 py-1 font-mono text-sm"
                        >
                          <option value="high">high</option>
                          <option value="medium">medium</option>
                          <option value="low">low</option>
                        </select>
                        <Badge tone={r.base.checkType === "code" ? "neutral" : r.base.checkType === "ai" ? "info" : "dark"}>
                          {r.base.checkType === "hybrid" ? "code + AI" : r.base.checkType === "ai" ? "AI check" : "code check"}
                        </Badge>
                      </div>
                      {r.enabled && (
                        <div className="grid gap-4 p-3 md:grid-cols-3">
                          <Field label="Rule text" hint="The AI reviewer reads this.">
                            <textarea rows={4} value={r.body} onChange={(e) => setRule(i, { body: e.target.value })} className={`${INPUT} text-sm`} />
                          </Field>
                          <ListField label="Good examples" value={r.good} onChange={(v) => setRule(i, { good: v })} />
                          <ListField label="Bad examples" value={r.bad} onChange={(v) => setRule(i, { bad: v })} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {tab === "ledger" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted">
                    Prices, thresholds and percentages are matched by code; everything else is judged by the AI reviewer. Leave “expires” empty for
                    proof that never expires.
                  </p>
                  <ul className="space-y-4">
                    {form.evidence.map((e, i) => (
                      <li key={e.code} className="border-2 border-ink bg-card p-3 shadow-hard-sm">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-mono text-sm font-bold">{e.code}</span>
                          <input
                            value={e.title}
                            onChange={(x) => setEv(i, { title: x.target.value })}
                            placeholder="Title"
                            aria-label={`${e.code} title`}
                            className="min-w-0 flex-1 border-2 border-ink bg-paper px-2 py-1 font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => set("evidence", form.evidence.filter((_, j) => j !== i))}
                            className="font-mono text-xs underline"
                          >
                            Delete
                          </button>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-6">
                          <div className="md:col-span-3">
                            <Field label="Approved claim">
                              <input value={e.claim} onChange={(x) => setEv(i, { claim: x.target.value })} className={INPUT} />
                            </Field>
                          </div>
                          <Field label="Type">
                            <select
                              value={e.kind}
                              disabled={e.kind === "other"}
                              onChange={(x) => setEv(i, { kind: x.target.value as EvidenceForm["kind"] })}
                              className={INPUT}
                            >
                              <option value="price">price ₹</option>
                              <option value="threshold">threshold ₹</option>
                              <option value="percent">percent %</option>
                              <option value="text">other claim</option>
                              {e.kind === "other" && <option value="other">kept as is</option>}
                            </select>
                          </Field>
                          {(e.kind === "price" || e.kind === "threshold" || e.kind === "percent") && (
                            <Field label={e.kind === "percent" ? "Percent" : "Amount (₹)"}>
                              <input type="number" min={0} value={e.amount} onChange={(x) => setEv(i, { amount: x.target.value })} className={`${INPUT} font-num`} />
                            </Field>
                          )}
                          <Field label="Source">
                            <input value={e.source} onChange={(x) => setEv(i, { source: x.target.value })} className={INPUT} />
                          </Field>
                          <Field label="Verified">
                            <input type="date" value={e.verifiedAt} onChange={(x) => setEv(i, { verifiedAt: x.target.value })} className={`${INPUT} font-num`} />
                          </Field>
                          <Field label="Expires">
                            <input type="date" value={e.expiresAt} onChange={(x) => setEv(i, { expiresAt: x.target.value })} className={`${INPUT} font-num`} />
                          </Field>
                          <div className="md:col-span-4">
                            <Field label="Condition (optional)">
                              <input value={e.conditions} onChange={(x) => setEv(i, { conditions: x.target.value })} className={INPUT} />
                            </Field>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Button onClick={addEvidence}>
                    <Icon name="ledger" /> Add a proof
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
