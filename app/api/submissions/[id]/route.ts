import { fail, guard, isUuid, json, plain } from "@/lib/api";
import { query } from "@/lib/db";
import { canEditText, canView, type Status } from "@/lib/workflow";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(request);
  if ("response" in g) return g.response;
  const { user } = g;
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail("Not found.", 404);
  try {
    const subs = await query<{ author_id: string; status: Status }>(
      `select s.*, u.name as author_name from kasauti.submissions s join kasauti.users u on u.id = s.author_id where s.id = $1`,
      [id],
    );
    const s = subs[0];
    // A creator asking for someone else's draft gets the same answer as for one that does not exist.
    if (!s || !canView(user.role, s.author_id === user.id)) return fail("Not found.", 404);
    const [versions, comments, decisions, trail] = await Promise.all([
      query("select v.n, v.text, v.note, v.created_at, u.name as author_name from kasauti.versions v join kasauti.users u on u.id = v.author_id where v.submission_id = $1 order by v.n", [id]),
      query("select c.id, c.body, c.finding_ref, c.created_at, u.name as author_name, u.role as author_role from kasauti.comments c join kasauti.users u on u.id = c.author_id where c.submission_id = $1 order by c.created_at", [id]),
      query("select d.rule, d.action, d.source, d.quote, d.intent_override, d.reason, d.created_at, u.name as actor_name from kasauti.decisions d join kasauti.users u on u.id = d.actor_id where d.submission_id = $1 order by d.created_at desc limit 100", [id]),
      query("select a.action, a.actor_email, a.payload, a.at from kasauti.audit_log a where a.target_type = 'submission' and a.target_id = $1 order by a.at desc limit 100", [id]),
    ]);
    const isAuthor = s.author_id === user.id;
    return json(plain({ submission: s, versions, comments, decisions, audit: trail, you: { role: user.role, isAuthor, canEdit: canEditText(isAuthor, s.status) } }));
  } catch (e) {
    return fail(`Couldn't load (${e instanceof Error ? e.message.slice(0, 60) : "error"}).`, 503);
  }
}
