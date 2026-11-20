-- Kasauti: workflow, roles, approvals and audit log.
-- Everything lives in its own schema so it never touches other tables in the database.
create schema if not exists kasauti;

create table if not exists kasauti.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  role text not null check (role in ('creator', 'manager', 'reviewer', 'admin')),
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists kasauti.submissions (
  id uuid primary key default gen_random_uuid(),
  brand text not null default 'dhaaga',
  author_id uuid not null references kasauti.users (id),
  title text not null check (char_length(title) between 1 and 160),
  channel text,
  text text not null check (char_length(text) between 1 and 10000),
  intent jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'changes_requested', 'approved')),
  scan jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists submissions_author_idx on kasauti.submissions (author_id, updated_at desc);
create index if not exists submissions_status_idx on kasauti.submissions (status, updated_at desc);

create table if not exists kasauti.versions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references kasauti.submissions (id) on delete cascade,
  n int not null,
  text text not null check (char_length(text) between 1 and 10000),
  note text not null default '',
  author_id uuid not null references kasauti.users (id),
  created_at timestamptz not null default now(),
  unique (submission_id, n)
);

create table if not exists kasauti.comments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references kasauti.submissions (id) on delete cascade,
  author_id uuid not null references kasauti.users (id),
  body text not null check (char_length(body) between 1 and 2000),
  finding_ref text,
  created_at timestamptz not null default now()
);
create index if not exists comments_submission_idx on kasauti.comments (submission_id, created_at);

-- Every accept / edit / dispute made in the scanner while signed in: this is what the Insights radar reads.
create table if not exists kasauti.decisions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references kasauti.submissions (id) on delete set null,
  actor_id uuid not null references kasauti.users (id),
  rule text not null,
  action text not null check (action in ('accepted', 'edited', 'disputed', 'noted')),
  source text not null check (source in ('rule', 'ai')),
  quote text not null default '',
  intent_override boolean not null default false,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists decisions_rule_idx on kasauti.decisions (rule, created_at desc);

create table if not exists kasauti.audit_log (
  id bigserial primary key,
  actor_id uuid references kasauti.users (id),
  actor_email text,
  action text not null,
  target_type text not null,
  target_id text,
  payload jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists audit_at_idx on kasauti.audit_log (at desc);

create table if not exists kasauti.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references kasauti.users (id) on delete cascade,
  submission_id uuid references kasauti.submissions (id) on delete cascade,
  kind text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on kasauti.notifications (user_id, read, created_at desc);

-- Only the server (the database owner role) uses these tables. Row level security is on with no policies and the
-- public API roles get nothing, so even if this schema were exposed through the REST API, no row would be readable.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'kasauti' loop
    execute format('alter table kasauti.%I enable row level security', t);
  end loop;
end $$;
revoke all on schema kasauti from anon, authenticated;
revoke all on all tables in schema kasauti from anon, authenticated;
revoke all on all sequences in schema kasauti from anon, authenticated;
