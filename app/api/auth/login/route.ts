import { z } from "zod";
import { connection } from "next/server";
import { clearAttempts, noteFailedAttempt, sameOrigin, sessionCookie, sessionSecret, signSession, SESSION_SECONDS, tooManyAttempts, verifyPassword } from "@/lib/auth";
import { audit, fail, readBody } from "@/lib/api";
import { hasDatabase, tx } from "@/lib/db";
import type { Role } from "@/lib/workflow";

const body = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(200) });

export async function POST(request: Request) {
  await connection();
  if (!hasDatabase()) return fail("The shared database is not configured on this server.", 503);
  if (!sameOrigin(request)) return fail("Cross-site requests are not allowed.", 403);
  const b = await readBody(request, body);
  if ("response" in b) return b.response;
  const { email, password } = b.data;

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const key = `${email}|${ip}`;
  if (tooManyAttempts(key)) return fail("Too many wrong passwords. Wait ten minutes and try again.", 429);

  try {
    const result = await tx(async (q) => {
      const rows = await q<{ id: string; email: string; name: string; role: Role; password_hash: string }>(
        "select id, email, name, role, password_hash from kasauti.users where email = $1",
        [email],
      );
      const u = rows[0];
      // Same work and the same answer whether the email exists or not.
      const ok = u ? await verifyPassword(password, u.password_hash) : (await verifyPassword(password, "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), false);
      if (!u || !ok) return null;
      await audit(q, { id: u.id, email: u.email, name: u.name, role: u.role }, "auth.login", "user", u.id);
      return u;
    });
    if (!result) {
      noteFailedAttempt(key);
      return fail("That email and password don't match.", 401);
    }
    clearAttempts(key);
    const token = signSession({ uid: result.id, role: result.role, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }, sessionSecret());
    const secure = new URL(request.url).protocol === "https:";
    return Response.json(
      { user: { id: result.id, email: result.email, name: result.name, role: result.role } },
      { headers: { "Set-Cookie": sessionCookie(token, secure), "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(`Couldn't sign in right now (${e instanceof Error ? e.message.slice(0, 60) : "error"}).`, 503);
  }
}
