import { describe, expect, it } from "vitest";
import { hashPassword, noteFailedAttempt, readCookie, signSession, tooManyAttempts, verifyPassword, verifySession } from "@/lib/auth";
import { wordDiff } from "@/lib/diff";
import { canEditText, canView, transitionError } from "@/lib/workflow";

const secret = "x".repeat(40);

describe("passwords", () => {
  it("hashes with a salt and verifies", async () => {
    const h = await hashPassword("correct horse");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await hashPassword("correct horse")).not.toBe(h); // new salt each time
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
});

describe("session tokens", () => {
  const now = 1_700_000_000_000;
  const good = { uid: "u1", role: "manager" as const, exp: now / 1000 + 100 };
  it("round-trips and expires", () => {
    const t = signSession(good, secret);
    expect(verifySession(t, secret, now)).toEqual(good);
    expect(verifySession(t, secret, now + 200_000)).toBeNull();
  });
  it("rejects tampering, another secret, and junk", () => {
    const t = signSession(good, secret);
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...good, role: "admin" })).toString("base64url");
    expect(verifySession(`${forged}.${sig}`, secret, now)).toBeNull();
    expect(verifySession(t, "y".repeat(40), now)).toBeNull();
    expect(verifySession(`${body}.`, secret, now)).toBeNull();
    expect(verifySession("nonsense", secret, now)).toBeNull();
    expect(verifySession(null, secret, now)).toBeNull();
  });
  it("reads a named cookie", () => {
    expect(readCookie("a=1; kasauti_session=abc%3Ddef; b=2", "kasauti_session")).toBe("abc=def");
    expect(readCookie("a=1", "kasauti_session")).toBeNull();
    expect(readCookie(null, "x")).toBeNull();
  });
  it("slows repeated wrong passwords", () => {
    for (let i = 0; i < 8; i++) noteFailedAttempt("k@x|1.2.3.4");
    expect(tooManyAttempts("k@x|1.2.3.4")).toBe(true);
    expect(tooManyAttempts("other@x|1.2.3.4")).toBe(false);
  });
});

describe("workflow rules", () => {
  it("lets the author send a draft for review, nobody else", () => {
    expect(transitionError({ role: "creator", isAuthor: true, from: "draft", to: "in_review" })).toBeNull();
    expect(transitionError({ role: "creator", isAuthor: false, from: "draft", to: "in_review" })).toMatch(/author/);
    expect(transitionError({ role: "reviewer", isAuthor: false, from: "draft", to: "in_review" })).toMatch(/author/);
  });
  it("lets reviewers decide, but never on their own work", () => {
    expect(transitionError({ role: "reviewer", isAuthor: false, from: "in_review", to: "approved" })).toBeNull();
    expect(transitionError({ role: "manager", isAuthor: false, from: "in_review", to: "changes_requested" })).toBeNull();
    expect(transitionError({ role: "manager", isAuthor: true, from: "in_review", to: "approved" })).toMatch(/own/);
    expect(transitionError({ role: "creator", isAuthor: false, from: "in_review", to: "approved" })).toMatch(/manager, reviewer or admin/);
  });
  it("needs review before a decision, and only managers reopen approvals", () => {
    expect(transitionError({ role: "manager", isAuthor: false, from: "draft", to: "approved" })).toMatch(/in review first/);
    expect(transitionError({ role: "reviewer", isAuthor: false, from: "approved", to: "changes_requested" })).toMatch(/manager or admin/);
    expect(transitionError({ role: "manager", isAuthor: false, from: "approved", to: "changes_requested" })).toBeNull();
    expect(transitionError({ role: "admin", isAuthor: false, from: "draft", to: "draft" })).toMatch(/already/);
  });
  it("controls who sees and edits", () => {
    expect(canView("creator", false)).toBe(false);
    expect(canView("creator", true)).toBe(true);
    expect(canView("reviewer", false)).toBe(true);
    expect(canEditText(true, "draft")).toBe(true);
    expect(canEditText(true, "in_review")).toBe(false);
    expect(canEditText(false, "draft")).toBe(false);
  });
});

describe("wordDiff", () => {
  it("marks what was added and removed", () => {
    const d = wordDiff("Free shipping above Rs. 999 today", "Free shipping above ₹1,499 today");
    expect(d.filter((p) => p.type === "del").map((p) => p.text.trim())).toEqual(["Rs. 999"]);
    expect(d.filter((p) => p.type === "add").map((p) => p.text.trim())).toEqual(["₹1,499"]);
    expect(d.map((p) => p.text).join("")).toContain("Free shipping above");
  });
  it("is all-same for equal text", () => {
    expect(wordDiff("a b c", "a b c")).toEqual([{ type: "same", text: "a b c" }]);
  });
});
