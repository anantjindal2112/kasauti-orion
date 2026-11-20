import { fail, guard, json, plain } from "@/lib/api";
import { query } from "@/lib/db";

export async function GET(request: Request) {
  const g = await guard(request);
  if ("response" in g) return g.response;
  try {
    const rows = await query("select id, submission_id, kind, body, read, created_at from kasauti.notifications where user_id = $1 order by created_at desc limit 30", [g.user.id]);
    return json(plain({ notifications: rows, unread: rows.filter((r) => !r.read).length }));
  } catch (e) {
    return fail(`Couldn't load (${e instanceof Error ? e.message.slice(0, 60) : "error"}).`, 503);
  }
}

/** Mark everything as read. */
export async function POST(request: Request) {
  const g = await guard(request, { write: true });
  if ("response" in g) return g.response;
  try {
    await query("update kasauti.notifications set read = true where user_id = $1 and not read", [g.user.id]);
    return json({ ok: true });
  } catch (e) {
    return fail(`Couldn't update (${e instanceof Error ? e.message.slice(0, 60) : "error"}).`, 503);
  }
}
