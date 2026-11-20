/**
 * Demo users (one per role) and two demo submissions, so the workflow can be tried straight away.
 * Safe to run again. Usage: set -a; . ./.env.local; set +a; npx tsx scripts/db-seed.mts
 */
import { hashPassword } from "../lib/auth";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../lib/demo-accounts";
import { pool } from "../lib/db";
import { showcaseDrafts } from "../lib/demo";

const p = pool();
const hash = await hashPassword(DEMO_PASSWORD);
const ids = new Map<string, string>();
for (const a of DEMO_ACCOUNTS) {
  const r = await p.query(
    `insert into kasauti.users (email, name, role, password_hash) values ($1, $2, $3, $4)
     on conflict (email) do update set name = excluded.name, role = excluded.role, password_hash = excluded.password_hash
     returning id`,
    [a.email, a.name, a.role, hash],
  );
  ids.set(a.role, r.rows[0].id as string);
}
console.log("users:", [...ids.keys()].join(", "));

const creator = ids.get("creator")!;
const drafts = showcaseDrafts();
const demos = [
  { d: drafts[0], title: "Festive sale post (demo)", status: "in_review" },
  { d: drafts[2], title: "Monsoon Weave restock post (demo)", status: "draft" },
];
for (const x of demos) {
  const exists = await p.query("select 1 from kasauti.submissions where author_id = $1 and title = $2", [creator, x.title]);
  if (exists.rowCount) continue;
  const intent = { purpose: x.d.intent.purpose, audience: x.d.intent.audience, mustKeep: x.d.intent.mustKeep.join(", ") };
  const s = await p.query(
    "insert into kasauti.submissions (author_id, title, channel, text, intent, status) values ($1, $2, $3, $4, $5, $6) returning id",
    [creator, x.title, x.d.channel, x.d.text, JSON.stringify(intent), x.status],
  );
  const id = s.rows[0].id as string;
  await p.query("insert into kasauti.versions (submission_id, n, text, note, author_id) values ($1, 1, $2, 'Original draft', $3)", [id, x.d.text, creator]);
  await p.query("insert into kasauti.audit_log (actor_id, actor_email, action, target_type, target_id, payload) values ($1, $2, 'submission.created', 'submission', $3, $4)", [
    creator,
    "creator@dhaaga.example",
    id,
    JSON.stringify({ title: x.title, seeded: true }),
  ]);
  if (x.status === "in_review") {
    await p.query("insert into kasauti.audit_log (actor_id, actor_email, action, target_type, target_id, payload) values ($1, $2, 'submission.status', 'submission', $3, $4)", [
      creator,
      "creator@dhaaga.example",
      id,
      JSON.stringify({ from: "draft", to: "in_review", seeded: true }),
    ]);
  }
  console.log("submission:", x.title, x.status);
}
await p.end();
