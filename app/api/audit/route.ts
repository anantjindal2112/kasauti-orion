import { fail, guard, json, plain } from "@/lib/api";
import { query } from "@/lib/db";

/** The audit log: everyone sees their own actions, reviewers and admins see everything. */
export async function GET(request: Request) {
  const g = await guard(request);
  if ("response" in g) return g.response;
  const { user } = g;
  const limit = Math.min(200, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 100));
  try {
    const rows = await query(
      `select a.id::text, a.action, a.actor_email, u.name as actor_name, a.target_type, a.target_id, a.payload, a.at
         from kasauti.audit_log a left join kasauti.users u on u.id = a.actor_id
        where ($1::boolean or a.actor_id = $2)
        order by a.at desc, a.id desc limit $3`,
      [user.role !== "creator", user.id, limit],
    );
    return json(plain({ entries: rows, scope: user.role === "creator" ? "yours" : "everyone" }));
  } catch (e) {
    return fail(`Couldn't load (${e instanceof Error ? e.message.slice(0, 60) : "error"}).`, 503);
  }
}
