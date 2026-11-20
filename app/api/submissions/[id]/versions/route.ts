import { z } from "zod";
import { audit, fail, guard, isUuid, json, readBody } from "@/lib/api";
import { tx } from "@/lib/db";
import { canEditText, type Status } from "@/lib/workflow";

const body = z.object({
  text: z.string().max(10_000).refine((s) => s.trim().length > 0, "The text can't be empty."),
  note: z.string().trim().max(120).default("Edited"),
  intent: z.object({ purpose: z.string().max(300).optional(), audience: z.string().max(300).optional(), mustKeep: z.string().max(300).optional() }).optional(),
});

/** Save a new version of the text. Only the author, and only while it is a draft or changes were requested. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(request, { write: true });
  if ("response" in g) return g.response;
  const { user } = g;
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail("Not found.", 404);
  const b = await readBody(request, body);
  if ("response" in b) return b.response;
  const { text, note, intent } = b.data;
  try {
    const out = await tx(async (q) => {
      const rows = await q<{ author_id: string; status: Status; text: string }>("select author_id, status, text from kasauti.submissions where id = $1 for update", [id]);
      const s = rows[0];
      if (!s || s.author_id !== user.id) return { error: "Not found.", code: 404 as const };
      if (!canEditText(true, s.status)) return { error: "It can't be edited while it is in review or approved.", code: 409 as const };
      if (s.text === text) return { error: "Nothing changed.", code: 409 as const };
      const n = (await q<{ n: number }>("select coalesce(max(n), 0)::int + 1 as n from kasauti.versions where submission_id = $1", [id]))[0].n;
      await q("insert into kasauti.versions (submission_id, n, text, note, author_id) values ($1, $2, $3, $4, $5)", [id, n, text, note, user.id]);
      await q("update kasauti.submissions set text = $2, intent = coalesce($3::jsonb, intent), updated_at = now() where id = $1", [id, text, intent ? JSON.stringify(intent) : null]);
      await audit(q, user, "submission.version", "submission", id, { n, note });
      return { n };
    });
    if (out.error !== undefined) return fail(out.error, out.code);
    return json(out, 201);
  } catch (e) {
    return fail(`Couldn't save (${e instanceof Error ? e.message.slice(0, 60) : "error"}).`, 503);
  }
}
