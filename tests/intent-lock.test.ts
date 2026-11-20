import { describe, expect, it } from "vitest";
import type { NvidiaClient } from "@/lib/nvidia";
import { checkIntent, hasIntent, parseMustKeep } from "@/lib/pipeline/intent-lock";
import type { Finding } from "@/lib/schemas/finding";

const finding = (over: Partial<Finding>): Finding => ({
  id: "f1",
  rule: "KSR-1.6",
  quote: "Don't miss out",
  location: "text",
  span: { start: 0, end: 14 },
  explanation: "pressure",
  suggestedFix: "",
  confidence: 1,
  severity: "medium",
  source: "rule",
  modelId: null,
  ...over,
});

// A client whose every call fails: only the code check can answer.
const offline = { post: async () => Promise.reject(new Error("offline")), request: async () => Promise.reject(new Error("offline")) } as unknown as NvidiaClient;

describe("Intent Lock", () => {
  it("parses the must-keep list", () => {
    expect(parseMustKeep("urgency, the 20% offer; free shipping,  ")).toEqual(["urgency", "the 20% offer", "free shipping"]);
    expect(parseMustKeep(undefined)).toEqual([]);
    expect(hasIntent({ purpose: "  " })).toBe(false);
    expect(hasIntent({ mustKeep: "urgency" })).toBe(true);
  });

  it("flags a fix that removes a MUST KEEP phrase (code check, no model needed)", async () => {
    const draft = "Don't miss out on free shipping above ₹1,499.";
    const f = finding({ quote: "free shipping", span: { start: 17, end: 30 }, suggestedFix: "delivery" });
    const { verdicts, meta } = await checkIntent({ client: offline, draft, findings: [f], intent: { mustKeep: "free shipping" } });
    expect(verdicts.get("f1")).toMatchObject({ ok: false, changed: ["free shipping"], by: "code" });
    expect(meta).toMatchObject({ ran: false, codeOnly: true, checked: 1, flagged: 1 });
  });

  it("passes a fix that keeps every MUST KEEP phrase", async () => {
    const draft = "Don't miss out on free shipping above ₹1,499.";
    const f = finding({ span: { start: 0, end: 14 }, suggestedFix: "Enjoy" });
    const { verdicts } = await checkIntent({ client: offline, draft, findings: [f], intent: { mustKeep: "free shipping" } });
    expect(verdicts.get("f1")).toMatchObject({ ok: true, kept: ["free shipping"], changed: [] });
  });

  it("flags a fix that lowers a percentage offer, whatever the model thinks", async () => {
    const draft = "Enjoy 30% off everything this week.";
    const f = finding({ rule: "KSR-4.1", quote: "30%", span: { start: 6, end: 9 }, suggestedFix: "20%" });
    const { verdicts } = await checkIntent({ client: offline, draft, findings: [f], intent: { purpose: "sales" } });
    expect(verdicts.get("f1")).toMatchObject({ ok: false, changed: ["30% → 20%"], by: "code" });
    expect(verdicts.get("f1")?.note).toMatch(/lowers the discount/);
  });

  it("does not call a ledger correction a weaker discount", async () => {
    const draft = "Enjoy 30% off everything this week.";
    const f = finding({ rule: "KSR-4.1", evidence: "KLE-10", quote: "30%", span: { start: 6, end: 9 }, suggestedFix: "20%" });
    const { verdicts } = await checkIntent({ client: offline, draft, findings: [f], intent: { purpose: "sales" } });
    expect(verdicts.get("f1")).toMatchObject({ ok: true, changed: [] });
  });

  it("skips findings with no fix, and image findings", async () => {
    const draft = "Don't miss out.";
    const none = finding({ suggestedFix: null });
    const img = finding({ id: "f2", location: "image" });
    const { verdicts, meta } = await checkIntent({ client: offline, draft, findings: [none, img], intent: { purpose: "sales" } });
    expect(verdicts.size).toBe(0);
    expect(meta.checked).toBe(0);
  });
});

import { ruleStats, parseDecisions, type DecisionEntry } from "@/lib/decision-log";

describe("decision log stats", () => {
  const e = (rule: string, action: DecisionEntry["action"]): DecisionEntry => ({ t: "x", rule, action, source: "rule", quote: "q" });
  it("ranks rules people override and marks them unclear", () => {
    const stats = ruleStats([e("KSR-1.2", "disputed"), e("KSR-1.2", "edited"), e("KSR-1.2", "accepted"), e("KSR-4.1", "accepted"), e("KSR-4.1", "accepted"), e("KSR-4.1", "accepted")]);
    expect(stats[0]).toMatchObject({ rule: "KSR-1.2", total: 3, unclear: true });
    expect(stats[0].overrideRate).toBeCloseTo(2 / 3);
    expect(stats[1]).toMatchObject({ rule: "KSR-4.1", unclear: false });
  });
  it("needs at least three decisions before calling a rule unclear", () => {
    expect(ruleStats([e("KSR-1.2", "disputed"), e("KSR-1.2", "disputed")])[0].unclear).toBe(false);
  });
  it("reads a broken log as empty", () => {
    expect(parseDecisions("{not json")).toEqual([]);
    expect(parseDecisions(null)).toEqual([]);
  });
});
