# Workflow, roles and the shared database

Kasauti keeps people's work in a Postgres database (Supabase). Everything lives in its own `kasauti` schema, so it never touches other tables in the same database. The schema is in `supabase/migrations/0001_kasauti.sql`; `npx tsx scripts/db-migrate.mts` applies it and `npx tsx scripts/db-seed.mts` adds the demo accounts.

## What is stored

| Table | What it holds |
|---|---|
| `users` | email, name, role, salted `scrypt` password hash |
| `submissions` | a saved draft: text, Intent Card, status, last scan summary |
| `versions` | every saved version of the text (the diff on the submission page is computed from these) |
| `comments` | review comments, optionally tied to a finding |
| `decisions` | every accept / edit / dispute made while signed in; the Insights Radar reads this for the whole team |
| `audit_log` | who did what and when; written in the same transaction as the change it records |
| `notifications` | in-app notices: sent for review, commented, approved, changes requested |

## Roles and the status flow

`draft → in review → approved / changes requested`. The rules are in `lib/workflow.ts` and are unit-tested.

| | Creator | Reviewer | Manager | Admin |
|---|---|---|---|---|
| See submissions | their own | all | all | all |
| Edit text | author only, while draft or changes requested | no | no | no |
| Send for review | author | no | no | author, or admin |
| Approve / request changes | no | yes | yes | yes |
| Reopen an approved one | no | no | yes | yes |
| Audit log | their own actions | everyone's | everyone's | everyone's |

Nobody can approve or reject their own submission. A creator asking for someone else's draft gets "not found", the same as for one that does not exist.

## Sign-in and security

- Sign-in is our own: email and password, checked against a `scrypt` hash. The session is an HMAC-signed cookie (HttpOnly, SameSite=Lax, Secure on https, 7 days) holding only a user id and role; the user is looked up again on every request.
- We do not use Supabase Auth: the app talks to the database as the server, with a connection string, not through Supabase's public API. All tables have row level security switched on with no policies, and `anon` and `authenticated` have no access to the schema, so even if the schema were exposed through the REST API nothing would be readable. Authorisation is done in the API routes.
- Writes from another site are refused (Origin check). Wrong passwords are slowed down (8 tries per ten minutes per email and address, kept in memory, so it is per server instance).
- Each user can keep up to 100 submissions.

## Demo accounts

One account per role for the fictional brand, listed on the sign-in page (password shown there). They only hold demo data. `npx tsx scripts/db-reset-activity.mts` clears what people did and restores the two demo submissions.

## What this is not

A production identity system: no password reset, no email verification, no sign-up, and the demo password is public. The database tables are shared across everyone who uses the demo.
