import { z } from "zod";
import { audit, fail, guard, isUuid, json, notify, readBody } from "@/lib/api";
import { tx } from "@/lib/db";
import { canView, STATUS_LABEL, STATUSES, transitionError, type Status } from "@/lib/workflow";

const body = z.object({ to: z.enum(STATUSES), note: z.string().trim().max(500).optional() });

/** Move a submission along: draft → in review → approved / changes requested. The rules live in lib/workflow.ts. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { write: true });
  if ("response" in g) return g.response;
  const { user } = g;
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail("Not found.", 404);
  const b = await readBody(request, body);
  if ("response" in b) return b.response;
  const { to, note } = b.data;
  try {
    const out = await tx(async (q) => {
      const rows = await q<{ author_id: string; status: Status; title: string }>("select author_id, status, title from kasauti.submissions where id = $1 for update", [id]);
      const s = rows[0];
      const isAuthor = !!s && s.author_id === user.id;
      if (!s || !canView(user.role, isAuthor)) return { error: "Not found.", code: 404 as const };
      const problem = transitionError({ role: user.role, isAuthor, from: s.status, to });
      if (problem) return { error: problem, code: 403 as const };
      await q("update kasauti.submissions set status = $2, updated_at = now() where id = $1", [id, to]);
      if (note) await q("insert into kasauti.comments (submission_id, author_id, body) values ($1, $2, $3)", [id, user.id, note]);
      await audit(q, user, "submission.status", "submission", id, { from: s.status, to, ...(note ? { note } : {}) });
      if (to === "in_review") {
        const reviewers = await q<{ id: string }>("select id from kasauti.users where role <> 'creator' and id <> $1", [user.id]);
        await notify(q, reviewers.map((r) => r.id), id, "review_requested", `“${s.title}” was sent for review.`);
      } else if (!isAuthor) {
        await notify(q, [s.author_id], id, to, `${user.name} marked “${s.title}” as ${STATUS_LABEL[to].toLowerCase()}.`);
      }
      return { status: to };
    });
    if (out.error !== undefined) return fail(out.error, out.code);
    return json(out);
  } catch (e) {
    return fail(`Couldn't update (${e instanceof Error ? e.message.slice(0, 60) : "error"}).`, 503);
  }
}
