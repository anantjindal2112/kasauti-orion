/**
 * Clears everything people did in the demo (their submissions, comments, decisions, notifications and audit trail)
 * and puts the two seeded demo submissions back to their starting state. Users stay.
 * Usage: set -a; . ./.env.local; set +a; npx tsx scripts/db-reset-activity.mts
 */
import { pool } from "../lib/db";

const p = pool();
const demo = "title like '%(demo)'";
await p.query("begin");
try {
  await p.query(`delete from kasauti.submissions where not (${demo})`);
  await p.query("delete from kasauti.decisions");
  await p.query("delete from kasauti.notifications");
  await p.query("delete from kasauti.comments");
  await p.query("delete from kasauti.versions where n > 1");
  await p.query(`update kasauti.submissions set status = case when title like 'Festive%' then 'in_review' else 'draft' end, text = (select v.text from kasauti.versions v where v.submission_id = submissions.id and v.n = 1), updated_at = now() where ${demo}`);
  await p.query("delete from kasauti.audit_log where (payload->>'seeded') is null");
  await p.query("commit");
} catch (e) {
  await p.query("rollback");
  throw e;
}
const n = async (t: string) => (await p.query(`select count(*)::int n from kasauti.${t}`)).rows[0].n;
console.log({ users: await n("users"), submissions: await n("submissions"), versions: await n("versions"), comments: await n("comments"), decisions: await n("decisions"), audit: await n("audit_log"), notifications: await n("notifications") });
await p.end();
