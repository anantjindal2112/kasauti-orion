"use client";

import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/retro/Button";
import type { Evidence, Rule } from "@/lib/schemas/brand-pack";

/** Inline editors for the Rulebook and the Claim Ledger. Both save into this browser's custom brand pack. */

const INPUT = "w-full border-2 border-ink bg-paper p-2 font-mono text-sm";
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

function Field({ label, id, children, hint }: { label: string; id: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-mono text-xs font-bold uppercase tracking-wider">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Shell({ children, onSubmit }: { children: ReactNode; onSubmit: () => void }) {
  return (
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="space-y-3 overflow-hidden"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </motion.form>
  );
}

/* ---------------- Rules ---------------- */

export function RuleEditor({ rule, onSave, onCancel }: { rule: Rule; onSave: (r: Rule) => string | null; onCancel: () => void }) {
  const [f, setF] = useState({
    title: rule.title,
    body: rule.body,
    severity: rule.severity,
    good: rule.goodExamples.join("\n"),
    bad: rule.badExamples.join("\n"),
  });
  const [error, setError] = useState("");
  const id = (k: string) => `${rule.code}-${k}`;

  return (
    <Shell
      onSubmit={() => {
        if (!f.title.trim() || !f.body.trim()) return setError("Give the rule a title and a description.");
        if (!lines(f.good).length || !lines(f.bad).length) return setError("Keep at least one good and one bad example.");
        const err = onSave({
          ...rule,
          title: f.title.trim(),
          body: f.body.trim(),
          severity: f.severity,
          goodExamples: lines(f.good),
          badExamples: lines(f.bad),
          version: rule.version + 1,
        });
        if (err) setError(err);
      }}
    >
      <Field label="Title" id={id("title")}>
        <input id={id("title")} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={INPUT} />
      </Field>
      <Field label="Rule" id={id("body")} hint={rule.checkType === "code" ? "Code checks this rule; the wording guides people. AI-judged rules use this text directly." : "The AI reviewer reads this text, so make it specific."}>
        <textarea id={id("body")} rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} className={INPUT} />
      </Field>
      <Field label="Severity" id={id("sev")}>
        <select id={id("sev")} value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value as Rule["severity"] })} className={INPUT}>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Good examples (one per line)" id={id("good")}>
          <textarea id={id("good")} rows={3} value={f.good} onChange={(e) => setF({ ...f, good: e.target.value })} className={INPUT} />
        </Field>
        <Field label="Bad examples (one per line)" id={id("bad")}>
          <textarea id={id("bad")} rows={3} value={f.bad} onChange={(e) => setF({ ...f, bad: e.target.value })} className={INPUT} />
        </Field>
      </div>
      {error && <p className="font-mono text-sm text-red">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm">
          Save as v{rule.version + 1}
        </Button>
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Shell>
  );
}

/* ---------------- Evidence ---------------- */

type Kind = Evidence["value"]["kind"];
const KINDS: { kind: Kind; label: string }[] = [
  { kind: "price", label: "Price (₹)" },
  { kind: "threshold", label: "Threshold (₹)" },
  { kind: "percent", label: "Percent" },
  { kind: "count", label: "Count" },
  { kind: "rating", label: "Rating" },
  { kind: "days", label: "Days" },
  { kind: "year", label: "Year" },
  { kind: "certification", label: "Certificate" },
  { kind: "text", label: "Text" },
];

/** Every value field as a string, whatever the kind. */
function valueForm(v: Evidence["value"] | null) {
  const f = { kind: (v?.kind ?? "text") as Kind, n: "", unit: "", outOf: "5", reviews: "", certificate: "", number: "", text: "" };
  if (!v) return f;
  switch (v.kind) {
    case "price":
    case "threshold":
      return { ...f, n: String(v.amountInr) };
    case "percent":
      return { ...f, n: String(v.percent) };
    case "count":
      return { ...f, n: String(v.count), unit: v.unit };
    case "rating":
      return { ...f, n: String(v.rating), outOf: String(v.outOf), reviews: String(v.reviews) };
    case "days":
      return { ...f, n: String(v.days) };
    case "year":
      return { ...f, n: String(v.year) };
    case "certification":
      return { ...f, certificate: v.certificate, number: v.number };
    case "text":
      return { ...f, text: v.text };
  }
}

function toValue(f: ReturnType<typeof valueForm>): Evidence["value"] | string {
  const n = Number(f.n);
  const pos = Number.isFinite(n) && n > 0;
  switch (f.kind) {
    case "price":
    case "threshold":
      return pos ? { kind: f.kind, amountInr: n } : "Enter the amount in rupees.";
    case "percent":
      return pos && n <= 100 ? { kind: "percent", percent: n } : "Enter a percentage from 1 to 100.";
    case "count":
      return Number.isFinite(n) && n >= 0 && f.unit.trim() ? { kind: "count", count: n, unit: f.unit.trim() } : "Enter the count and its unit (e.g. artisans).";
    case "rating": {
      const outOf = Number(f.outOf);
      const reviews = Number(f.reviews);
      return pos && outOf > 0 && Number.isInteger(reviews) && reviews >= 0
        ? { kind: "rating", rating: n, outOf, reviews }
        : "Enter the rating, what it's out of, and the number of reviews.";
    }
    case "days":
      return pos && Number.isInteger(n) ? { kind: "days", days: n } : "Enter a whole number of days.";
    case "year":
      return Number.isInteger(n) && n > 1800 ? { kind: "year", year: n } : "Enter a year.";
    case "certification":
      return f.certificate.trim() && f.number.trim() ? { kind: "certification", certificate: f.certificate.trim(), number: f.number.trim() } : "Enter the certificate name and number.";
    case "text":
      return f.text.trim() ? { kind: "text", text: f.text.trim() } : "Enter the fact this entry proves.";
  }
}

export function EvidenceEditor({
  entry,
  code,
  today,
  onSave,
  onCancel,
}: {
  /** null = a new entry. */
  entry: Evidence | null;
  code: string;
  today: string;
  onSave: (e: Evidence) => string | null;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    title: entry?.title ?? "",
    claim: entry?.claim ?? "",
    source: entry?.source ?? "",
    ownerName: entry?.owner.name ?? "",
    ownerRole: entry?.owner.role ?? "",
    verifiedAt: entry?.verifiedAt ?? today,
    expiresAt: entry?.expiresAt ?? "",
    conditions: entry?.conditions ?? "",
  });
  const [v, setV] = useState(() => valueForm(entry?.value ?? null));
  const [error, setError] = useState("");
  const id = (k: string) => `${code}-ed-${k}`;
  const numLabel: Partial<Record<Kind, string>> = {
    price: "Amount (₹)",
    threshold: "Amount (₹)",
    percent: "Percent",
    count: "Count",
    rating: "Rating",
    days: "Days",
    year: "Year",
  };

  return (
    <Shell
      onSubmit={() => {
        const value = toValue(v);
        if (typeof value === "string") return setError(value);
        if (!f.claim.trim() || !f.source.trim() || !f.ownerName.trim() || !f.ownerRole.trim())
          return setError("Approved wording, source, owner and owner's role are all needed.");
        if (f.expiresAt && f.expiresAt < f.verifiedAt) return setError("Expiry can't be before the verified date.");
        const err = onSave({
          ...(entry ?? { tags: [] }),
          code,
          title: f.title.trim() || f.claim.trim().slice(0, 48),
          claim: f.claim.trim(),
          value,
          source: f.source.trim(),
          owner: { name: f.ownerName.trim(), role: f.ownerRole.trim() },
          verifiedAt: f.verifiedAt,
          expiresAt: f.expiresAt || null,
          conditions: f.conditions.trim() || undefined,
        });
        if (err) setError(err);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" id={id("title")}>
          <input id={id("title")} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Winter sale 2026" className={INPUT} />
        </Field>
        <Field label="Type of fact" id={id("kind")}>
          <select id={id("kind")} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as Kind })} className={INPUT}>
            {KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Approved wording" id={id("claim")} hint="How the claim may appear in copy.">
        <textarea id={id("claim")} rows={2} value={f.claim} onChange={(e) => setF({ ...f, claim: e.target.value })} className={INPUT} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        {numLabel[v.kind] && (
          <Field label={numLabel[v.kind]!} id={id("n")}>
            <input id={id("n")} inputMode="decimal" value={v.n} onChange={(e) => setV({ ...v, n: e.target.value })} className={INPUT} />
          </Field>
        )}
        {v.kind === "count" && (
          <Field label="Unit" id={id("unit")}>
            <input id={id("unit")} value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} placeholder="artisans" className={INPUT} />
          </Field>
        )}
        {v.kind === "rating" && (
          <>
            <Field label="Out of" id={id("outof")}>
              <input id={id("outof")} inputMode="numeric" value={v.outOf} onChange={(e) => setV({ ...v, outOf: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Reviews" id={id("reviews")}>
              <input id={id("reviews")} inputMode="numeric" value={v.reviews} onChange={(e) => setV({ ...v, reviews: e.target.value })} className={INPUT} />
            </Field>
          </>
        )}
        {v.kind === "certification" && (
          <>
            <Field label="Certificate" id={id("cert")}>
              <input id={id("cert")} value={v.certificate} onChange={(e) => setV({ ...v, certificate: e.target.value })} placeholder="GOTS" className={INPUT} />
            </Field>
            <Field label="Certificate no." id={id("certno")}>
              <input id={id("certno")} value={v.number} onChange={(e) => setV({ ...v, number: e.target.value })} className={INPUT} />
            </Field>
          </>
        )}
        {v.kind === "text" && (
          <div className="sm:col-span-3">
            <Field label="Fact proved" id={id("text")}>
              <input id={id("text")} value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })} placeholder="e.g. Handwoven in Panipat" className={INPUT} />
            </Field>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Source" id={id("source")}>
          <input id={id("source")} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="e.g. Price list, December 2026" className={INPUT} />
        </Field>
        <Field label="Condition (optional)" id={id("cond")}>
          <input id={id("cond")} value={f.conditions} onChange={(e) => setF({ ...f, conditions: e.target.value })} placeholder="e.g. Not valid on gift cards" className={INPUT} />
        </Field>
        <Field label="Owner" id={id("owner")}>
          <input id={id("owner")} value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} className={INPUT} />
        </Field>
        <Field label="Owner's role" id={id("role")}>
          <input id={id("role")} value={f.ownerRole} onChange={(e) => setF({ ...f, ownerRole: e.target.value })} className={INPUT} />
        </Field>
        <Field label="Verified on" id={id("ver")}>
          <input id={id("ver")} type="date" value={f.verifiedAt} onChange={(e) => setF({ ...f, verifiedAt: e.target.value })} className={INPUT} />
        </Field>
        <Field label="Expires (blank = never)" id={id("exp")}>
          <input id={id("exp")} type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} className={INPUT} />
        </Field>
      </div>

      {error && <p className="font-mono text-sm text-red">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm">
          {entry ? "Save entry" : `Add ${code}`}
        </Button>
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Shell>
  );
}
