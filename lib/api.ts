import { connection } from "next/server";
import { z } from "zod";
import { currentUser, sameOrigin, type User } from "@/lib/auth";
import { hasDatabase } from "@/lib/db";
import type { Role } from "@/lib/workflow";

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export const fail = (error: string, status: number) => json({ error }, status);

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** The same query-result row as plain JSON: dates become ISO strings. */
export const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Every protected route starts here: the database must be configured, writes must come from this site,
 * and the caller must be signed in (and hold one of `roles` when given).
 */
export async function guard(request: Request, opts: { write?: boolean; roles?: Role[] } = {}): Promise<{ user: User } | { response: Response }> {
  await connection();
  if (!hasDatabase()) return { response: fail("The shared database is not configured on this server.", 503) };
  if (opts.write && !sameOrigin(request)) return { response: fail("Cross-site requests are not allowed.", 403) };
  let user: User | null;
  try {
    user = await currentUser(request);
  } catch {
    return { response: fail("The session could not be checked.", 503) };
  }
  if (!user) return { response: fail("Sign in first.", 401) };
  if (opts.roles && !opts.roles.includes(user.role)) return { response: fail("Your role can't do this.", 403) };
  return { user };
}

export async function readBody<S extends z.ZodType>(request: Request, schema: S): Promise<{ data: z.infer<S> } | { response: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { response: fail("Request body must be JSON.", 400) };
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    return { response: fail(i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message, 400) };
  }
  return { data: r.data };
}

export type Q = <R extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;

/** Append to the audit log. Always inside the same transaction as the change it records. */
export async function audit(q: Q, actor: User, action: string, targetType: string, targetId: string | null, payload: Record<string, unknown> = {}) {
  await q("insert into kasauti.audit_log (actor_id, actor_email, action, target_type, target_id, payload) values ($1, $2, $3, $4, $5, $6)", [
    actor.id,
    actor.email,
    action,
    targetType,
    targetId,
    JSON.stringify(payload),
  ]);
}

export async function notify(q: Q, userIds: string[], submissionId: string, kind: string, body: string) {
  for (const id of userIds) await q("insert into kasauti.notifications (user_id, submission_id, kind, body) values ($1, $2, $3, $4)", [id, submissionId, kind, body]);
}
