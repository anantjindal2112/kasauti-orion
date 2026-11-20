import { z } from "zod";
import { audit, fail, guard, isUuid, json, plain, readBody } from "@/lib/api";
import { query, tx } from "@/lib/db";
import { canView } from "@/lib/workflow";

const entry = z.object({
  rule: z.string().regex(/^KSR-\d\.\d$/),
  action: z.enum(["accepted", "edited", "disputed", "noted"]),
  source: z.enum(["rule", "ai"]),
  quote: z.string().max(200).default(""),
  intentOverride: z.boolean().optional(),
  reason: z.string().max(200).optional(),
});
const body = z.object({ submissionId: z.string().optional(), entries: z.array(entry).min(1).max(50) });

/** Log what a signed-in reviewer did with findings. The Insights radar is built from these, across the whole team. */
export async function POST(request: Request) {
  const g = await guard(request, { write: true });
  if ("response" in g) return g.response;
  const { user } = g;
  const b = await readBody(request, body);
  if ("response" in b) return b.response;
  const { submissionId, entries } = b.data;
  if (submissionId && !isUuid(submissionId)) return fail("Not found.", 404);
  try {
    const out = await tx(async (q) => {
      if (submissionId) {
        const r = await q<{ author_id: string }>("select author_id from kasauti.submissions where id = $1", [submissionId]);
        if (!r[0] || !canView(user.role, r[0].author_id === user.id)) return null;
      }
      for (const e of entries) {
        await q("insert into kasauti.decisions (submission_id, actor_id, rule, action, source, quote, intent_override, reason) values ($1, $2, $3, $4, $5, $6, $7, $8)", [
          submissionId ?? null,
          user.id,
          e.rule,
          e.action,
          e.source,
          e.quote,
          !!e.intentOverride,
          e.reason ?? null,
        ]);
        await audit(q, user, `decision.${e.action}`, submissionId ? "submission" : "scan", submissionId ?? null, { rule: e.rule, quote: e.quote.slice(0, 80), ...(e.intentOverride ? { intentOverride: true } : {}) });
      }
      return entries.length;
    });
    if (out === null) return fail("Not found.", 404);
    return json({ logged: out }, 201);
  } catch (e) {
    return fail(`Couldn't log (${e instanceof Error ? e.message.slice(0, 60) : "error"}).`, 503);
  }
}

/** Team-wide counts per rule, plus the latest decisions. */
export async function GET(request: Request) {
  const g = await guard(request);
  if ("response" in g) return g.response;
  try {
    const [rules, recent] = await Promise.all([
      query(
        `select rule,
                count(*)::int as total,
                count(*) filter (where action = 'accepted')::int as accepted,
                count(*) filter (where action = 'edited')::int as edited,
                count(*) filter (where action = 'disputed')::int as disputed,
                count(*) filter (where action = 'noted')::int as noted,
                count(*) filter (where intent_override)::int as intent_overrides
           from kasauti.decisions group by rule`,
      ),
      query("select d.rule, d.action, d.source, d.quote, d.intent_override, d.reason, d.created_at, u.name as actor_name from kasauti.decisions d join kasauti.users u on u.id = d.actor_id order by d.created_at desc limit 8"),
    ]);
    return json(plain({ rules, recent }));
  } catch (e) {
    return fail(`Couldn't load (${e instanceof Error ? e.message.slice(0, 60) : "error"}).`, 503);
  }
}
