import { z } from "zod";
import { audit, fail, guard, isUuid, json, notify, readBody } from "@/lib/api";
import { tx } from "@/lib/db";
import { canView } from "@/lib/workflow";

const body = z.object({ body: z.string().trim().min(1).max(2000), findingRef: z.string().max(120).optional() });

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { write: true });
  if ("response" in g) return g.response;
  const { user } = g;
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail("Not found.", 404);
  const b = await readBody(request, body);
  if ("response" in b) return b.response;
  try {
    const out = await tx(async (q) => {
      const rows = await q<{ author_id: string; title: string }>("select author_id, title from kasauti.submissions where id = $1", [id]);
      const s = rows[0];
      if (!s || !canView(user.role, s.author_id === user.id)) return null;
      const c = await q<{ id: string }>("insert into kasauti.comments (submission_id, author_id, body, finding_ref) values ($1, $2, $3, $4) returning id", [id, user.id, b.data.body, b.data.findingRef ?? null]);
      await audit(q, user, "comment.created", "submission", id, { comment: c[0].id, findingRef: b.data.findingRef ?? null });
      if (s.author_id !== user.id) await notify(q, [s.author_id], id, "comment", `${user.name} commented on “${s.title}”.`);
      return c[0].id;
    });
    if (!out) return fail("Not found.", 404);
    return json({ id: out }, 201);
  } catch (e) {
    return fail(`Couldn't comment (${e instanceof Error ? e.message.slice(0, 60) : "error"}).`, 503);
  }
}
