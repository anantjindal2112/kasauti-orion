import { z } from "zod";
import { audit, fail, guard, json, plain, readBody } from "@/lib/api";
import { query, tx } from "@/lib/db";
import { STATUSES, type Status } from "@/lib/workflow";

const MAX_PER_USER = 100;

const createBody = z.object({
  title: z.string().trim().min(1).max(160),
  channel: z.string().trim().max(40).optional(),
  text: z.string().max(10_000).refine((s) => s.trim().length > 0, "Paste some copy first."),
  intent: z.object({ purpose: z.string().max(300).optional(), audience: z.string().max(300).optional(), mustKeep: z.string().max(300).optional() }).default({}),
  scan: z.object({ findings: z.number().int().min(0), high: z.number().int().min(0), medium: z.number().int().min(0), low: z.number().int().min(0), at: z.string().max(40) }).optional(),
});

export async function GET(request: Request) {
  const g = await guard(request);
  if ("response" in g) return g.response;
  const { user } = g;
  const status = new URL(request.url).searchParams.get("status");
  const filter = status && (STATUSES as readonly string[]).includes(status) ? (status as Status) : null;
  try {
    const rows = await query(
      `select s.id, s.title, s.channel, s.status, s.scan, s.created_at, s.updated_at, u.name as author_name, u.id as author_id,
              (select count(*)::int from kasauti.comments c where c.submission_id = s.id) as comments,
              (select count(*)::int from kasauti.versions v where v.submission_id = s.id) as versions
         from kasauti.submissions s join kasauti.users u on u.id = s.author_id
        where ($1::text is null or s.status = $1)
          and (s.author_id = $2 or $3::boolean)
        order by s.updated_at desc limit 200`,
      [filter, user.id, user.role !== "creator"],
    );
    return json({ submissions: plain(rows) });
  } catch (e) {
    return fail(`Couldn't load submissions (${e instanceof Error ? e.message.slice(0, 60) : "error"}).`, 503);
  }
}

export async function POST(request: Request) {
  const g = await guard(request, { write: true });
  if ("response" in g) return g.response;
  const { user } = g;
  const b = await readBody(request, createBody);
  if ("response" in b) return b.response;
  const d = b.data;
  try {
    const out = await tx(async (q) => {
      const count = await q<{ n: number }>("select count(*)::int as n from kasauti.submissions where author_id = $1", [user.id]);
      if (count[0].n >= MAX_PER_USER) return null;
      const rows = await q<{ id: string }>(
        "insert into kasauti.submissions (author_id, title, channel, text, intent, scan) values ($1, $2, $3, $4, $5, $6) returning id",
        [user.id, d.title, d.channel ?? null, d.text, JSON.stringify(d.intent), d.scan ? JSON.stringify(d.scan) : null],
      );
      const id = rows[0].id;
      await q("insert into kasauti.versions (submission_id, n, text, note, author_id) values ($1, 1, $2, 'Original draft', $3)", [id, d.text, user.id]);
      await audit(q, user, "submission.created", "submission", id, { title: d.title });
      return id;
    });
    if (!out) return fail(`You can keep up to ${MAX_PER_USER} submissions.`, 409);
    return json({ id: out }, 201);
  } catch (e) {
    return fail(`Couldn't save (${e instanceof Error ? e.message.slice(0, 60) : "error"}).`, 503);
  }
}
