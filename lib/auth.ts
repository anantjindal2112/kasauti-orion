import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { query } from "@/lib/db";
import { ROLES, type Role } from "@/lib/workflow";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;
const N = 16384;

/** `scrypt$N$salt$hash`: a slow, salted hash, so a leaked table is not a list of passwords. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, { N, r: 8, p: 1 });
  return `scrypt$${N}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !n || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: 8, p: 1 });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const SESSION_COOKIE = "kasauti_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 7;

export interface SessionPayload {
  uid: string;
  role: Role;
  exp: number;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

/** A signed, expiring token. The cookie holds only a user id and role; the user is looked up again on every request. */
export function signSession(payload: SessionPayload, secret: string): string {
  const body = b64(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

export function verifySession(token: string | null | undefined, secret: string, now = Date.now()): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const good = Buffer.from(sign(body, secret));
  const given = Buffer.from(sig);
  if (good.length !== given.length || !timingSafeEqual(good, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof p.uid !== "string" || typeof p.exp !== "number" || !(ROLES as readonly string[]).includes(p.role)) return null;
    return p.exp * 1000 > now ? p : null;
  } catch {
    return null;
  }
}

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (at least 32 characters)");
  return s;
}

export function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure ? "; Secure" : ""}`;
}
export const clearedCookie = (secure: boolean) => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** The signed-in user for this request, or null. */
export async function currentUser(request: Request): Promise<User | null> {
  const payload = verifySession(readCookie(request.headers.get("cookie"), SESSION_COOKIE), sessionSecret());
  if (!payload) return null;
  const rows = await query<User>("select id, email, name, role from kasauti.users where id = $1", [payload.uid]);
  return rows[0] ?? null;
}

/** Browsers always send Origin on a cross-site POST; if it is there it must be this site. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  } catch {
    return false;
  }
}

/** Wrong password attempts per email and address, kept in memory: slows guessing without needing a table. */
const attempts = new Map<string, { n: number; first: number }>();
export function tooManyAttempts(key: string, now = Date.now()): boolean {
  const a = attempts.get(key);
  if (!a || now - a.first > 10 * 60_000) return false;
  return a.n >= 8;
}
export function noteFailedAttempt(key: string, now = Date.now()) {
  const a = attempts.get(key);
  if (!a || now - a.first > 10 * 60_000) attempts.set(key, { n: 1, first: now });
  else a.n++;
}
export function clearAttempts(key: string) {
  attempts.delete(key);
}
