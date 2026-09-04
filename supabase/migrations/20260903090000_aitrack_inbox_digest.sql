-- AITrack Custom Scheduled Agent: a daily digest of a lawyer's unread
-- Outlook mail (priority, summary, suggested reply text -- not a real
-- Outlook draft, since the app's current Graph consent is read-only:
-- Files.Read Mail.Read Sites.Read.All offline_access, no Mail.ReadWrite).
-- Opt-in, off by default -- connecting Microsoft 365 for DocTrack linking
-- doesn't imply consent to a daily AI summary of the whole inbox.
alter table public.microsoft_graph_tokens add column if not exists ai_inbox_digest_enabled boolean not null default false;

-- Operational log, not a user-facing history feed in v1 -- lets a cron
-- run actually be audited (did it run, how many unread, did sending
-- fail) without grepping Vercel logs.
create table if not exists public.ai_inbox_digest_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id),
  run_date date not null,
  unread_count integer not null,
  sent boolean not null,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists ai_inbox_digest_runs_tenant_idx on public.ai_inbox_digest_runs (tenant_id, user_id, run_date desc);

alter table public.ai_inbox_digest_runs enable row level security;
create policy "ai_inbox_digest_runs_select_own_tenant" on public.ai_inbox_digest_runs
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
