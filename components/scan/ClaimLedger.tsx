"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Badge, type BadgeTone } from "@/components/retro/Badge";
import { Button } from "@/components/retro/Button";
import { Icon } from "@/components/retro/Icon";
import type { AiMeta, EvidenceInfo } from "@/lib/scan-types";
import type { ClaimStatus, LedgerClaim } from "@/lib/schemas/claim";

const STATUS: Record<ClaimStatus, { label: string; tone: BadgeTone; order: number }> = {
  contradicted: { label: "contradicted", tone: "fail", order: 0 },
  stale: { label: "stale", tone: "warn", order: 1 },
  no_evidence: { label: "no proof", tone: "dark", order: 2 },
  unchecked: { label: "unchecked", tone: "neutral", order: 3 },
  verified: { label: "verified", tone: "ok", order: 4 },
};

const KIND_LABEL: Record<LedgerClaim["kind"], string> = {
  price: "price",
  percent: "offer",
  rating: "rating",
  count: "number",
  days: "days",
  year: "year",
  certification: "certificate",
  superlative: "superlative",
  absolute: "absolute promise",
  trigger: "claim word",
  implicit: "claim",
};

const EXPIRING_DAYS = 45;
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
const formatDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export interface ProofDraft {
  claim: string;
  source: string;
  ownerName: string;
  ownerRole: string;
  expiresAt: string | null;
}

export function ClaimLedger({
  claims,
  evidence,
  ledgerAi,
  today,
  findingNumber,
  onJump,
  onAddProof,
  canAdd,
}: {
  claims: LedgerClaim[];
  evidence: Record<string, EvidenceInfo>;
  ledgerAi?: AiMeta["ledger"];
  today: string;
  /** Finding number (as shown in the findings list) for a linked finding id. */
  findingNumber: (id: string) => number | null;
  onJump: (findingId: string) => void;
  onAddProof: (claim: LedgerClaim, proof: ProofDraft) => void;
  canAdd: boolean;
}) {
  const sorted = [...claims].sort((a, b) => STATUS[a.status].order - STATUS[b.status].order || a.span.start - b.span.start);
  const count = (s: ClaimStatus) => claims.filter((c) => c.status === s).length;

  if (claims.length === 0) {
    return (
      <p className="text-sm text-muted">
        No checkable claims found — no prices, offers, numbers, certificates or superlatives in this copy.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(STATUS) as ClaimStatus[])
          .sort((a, b) => STATUS[a].order - STATUS[b].order)
          .filter((s) => count(s) > 0)
          .map((s) => (
            <Badge key={s} tone={STATUS[s].tone}>
              {count(s)} {STATUS[s].label}
            </Badge>
          ))}
        <span className="ml-auto font-mono text-xs text-muted">
          {ledgerAi?.ran ? `AI pass · ${ledgerAi.modelId?.split("/").at(-1)} · ${ledgerAi.latencyMs} ms · ${ledgerAi.added ?? 0} found in plain words` : ""}
        </span>
      </div>

      <ol className="space-y-3">
        {sorted.map((c, i) => (
          <ClaimRow
            key={c.id}
            claim={c}
            index={i}
            entry={c.evidence ? evidence[c.evidence] : undefined}
            today={today}
            findingNumber={c.findingId ? findingNumber(c.findingId) : null}
            onJump={onJump}
            onAddProof={onAddProof}
            canAdd={canAdd}
          />
        ))}
      </ol>

      {ledgerAi?.dropped && ledgerAi.dropped.length > 0 && (
        <p className="font-mono text-xs text-muted">
          Dropped {ledgerAi.dropped.length} AI claim{ledgerAi.dropped.length === 1 ? "" : "s"} that didn&rsquo;t quote the draft exactly.
        </p>
      )}
    </div>
  );
}

function ClaimRow({
  claim: c,
  index,
  entry,
  today,
  findingNumber,
  onJump,
  onAddProof,
  canAdd,
}: {
  claim: LedgerClaim;
  index: number;
  entry?: EvidenceInfo;
  today: string;
  findingNumber: number | null;
  onJump: (findingId: string) => void;
  onAddProof: (claim: LedgerClaim, proof: ProofDraft) => void;
  canAdd: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<ProofDraft>({
    claim: c.sentence,
    source: "",
    ownerName: "",
    ownerRole: "",
    expiresAt: addDays(today, 180),
  });
  const s = STATUS[c.status];
  const daysLeft = entry?.expiresAt && !entry.expired ? dayDiff(entry.expiresAt, today) : null;
  // Absolute promises can never be proven; everything else unproven can be added by a reviewer.
  const addable = (c.status === "no_evidence" || c.status === "unchecked") && c.kind !== "absolute";
  const valid = form.claim.trim() && form.source.trim() && form.ownerName.trim() && form.ownerRole.trim();

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 32, delay: Math.min(index * 0.05, 0.4) }}
      className="border-2 border-ink bg-card shadow-hard-sm"
    >
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-ink bg-sunk px-3 py-1.5">
        <Badge tone={s.tone} stamp delay={0.15 + Math.min(index * 0.05, 0.4)}>
          {s.label}
        </Badge>
        <span className="font-mono text-xs uppercase tracking-wider text-muted">
          {KIND_LABEL[c.kind]}
          {c.location === "image" ? ` · in image ${c.imageFile ?? ""}` : ""}
        </span>
        <span className="ml-auto">
          {c.source === "ai" ? (
            <Badge tone="info">AI · {c.modelId?.split("/").at(-1)}</Badge>
          ) : (
            <Badge tone="neutral">code</Badge>
          )}
        </span>
      </div>

      <div className="space-y-2 p-3">
        <p className="font-mono text-base">“{c.text}”</p>
        {c.sentence !== c.text && <p className="text-sm text-muted">in: {c.sentence}</p>}
        <p className="text-sm leading-relaxed">{c.note}</p>
        {c.review === "needs_review" && (
          <p className="flex items-center gap-2 font-mono text-xs text-mustard">
            <Icon name="warn" className="h-3.5 w-3.5" /> Low confidence ({Math.round(c.confidence * 100)}%) — a person should confirm
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {entry && (
            <Link
              href={`/ledger#${entry.code}`}
              className="inline-flex items-center gap-2 border-2 border-ink bg-paper px-2 py-1 underline-offset-2 hover:underline"
            >
              <Icon name="ledger" className="h-3.5 w-3.5" />
              <span className="font-mono font-bold">{entry.code}</span>
              <span className="text-muted">
                verified {formatDay(entry.verifiedAt)}
                {entry.expired && entry.expiresAt ? ` · expired ${formatDay(entry.expiresAt)}` : ""}
              </span>
            </Link>
          )}
          {daysLeft !== null && daysLeft <= EXPIRING_DAYS && (
            <Badge tone="warn">
              expires in {daysLeft} day{daysLeft === 1 ? "" : "s"}
            </Badge>
          )}
          {c.suggestedFix && (
            <span className="border-2 border-ink bg-term px-2 py-1 font-mono text-term-green">→ “{c.suggestedFix}”</span>
          )}
          {findingNumber !== null && c.findingId && (
            <button
              type="button"
              onClick={() => onJump(c.findingId!)}
              className="border-2 border-ink bg-yellow px-2 py-1 font-mono text-xs font-bold shadow-hard-sm press"
            >
              Finding #{findingNumber} →
            </button>
          )}
          {addable && !adding && (
            <Button size="sm" onClick={() => setAdding(true)} disabled={!canAdd}>
              <Icon name="ledger" /> Add proof to ledger
            </Button>
          )}
        </div>

        <AnimatePresence>
          {adding && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2 overflow-hidden border-t-2 border-dashed border-ink pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!valid) return;
                onAddProof(c, { ...form, claim: form.claim.trim(), source: form.source.trim(), ownerName: form.ownerName.trim(), ownerRole: form.ownerRole.trim() });
                setAdding(false);
              }}
            >
              <p className="text-sm text-muted">
                Only add proof you actually hold. The new entry gets an owner and an expiry date, and every later scan checks against it.
              </p>
              <Field label="Approved wording" id={`${c.id}-claim`}>
                <textarea
                  id={`${c.id}-claim`}
                  rows={2}
                  value={form.claim}
                  onChange={(e) => setForm({ ...form, claim: e.target.value })}
                  className="w-full border-2 border-ink bg-paper p-2 font-mono text-sm"
                />
              </Field>
              <Field label="Source (report, invoice, certificate…)" id={`${c.id}-source`}>
                <input
                  id={`${c.id}-source`}
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  placeholder="e.g. Customer survey Oct 2026, n=2,400"
                  className="w-full border-2 border-ink bg-paper p-2 font-mono text-sm"
                />
              </Field>
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="Owner" id={`${c.id}-owner`}>
                  <input
                    id={`${c.id}-owner`}
                    value={form.ownerName}
                    onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                    className="w-full border-2 border-ink bg-paper p-2 font-mono text-sm"
                  />
                </Field>
                <Field label="Owner's role" id={`${c.id}-role`}>
                  <input
                    id={`${c.id}-role`}
                    value={form.ownerRole}
                    onChange={(e) => setForm({ ...form, ownerRole: e.target.value })}
                    placeholder="e.g. Insights lead"
                    className="w-full border-2 border-ink bg-paper p-2 font-mono text-sm"
                  />
                </Field>
                <Field label="Expires" id={`${c.id}-exp`}>
                  <input
                    id={`${c.id}-exp`}
                    type="date"
                    min={today}
                    value={form.expiresAt ?? ""}
                    onChange={(e) => setForm({ ...form, expiresAt: e.target.value || null })}
                    className="w-full border-2 border-ink bg-paper p-2 font-mono text-sm"
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary" size="sm" disabled={!valid}>
                  Add entry and re-scan
                </Button>
                <Button size="sm" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-mono text-xs font-bold uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}
