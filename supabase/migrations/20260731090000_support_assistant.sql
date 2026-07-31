-- Support Assistant: a way for a firm's owner/admin to reach FirmTrack
-- support from inside the app, with two channels chosen per request --
-- Standard (free, human reply via support@firmtracks.com within 24
-- hours) and AI Assistant (instant, a new paid add-on module, billed
-- exactly like AccountTrack/DocTrack/HRTrack -- not metered per-token).

-- subscriptions.module has a pre-existing check constraint (predates
-- this repo's migration history) that doesn't yet know about the new
-- 'ai_support' module key -- confirmed live via a real insert attempt
-- returning 23514 before writing this migration. Widening it, not
-- removing it, so it still guards against typo'd module keys.
alter table public.subscriptions drop constraint if exists subscriptions_module_check;
alter table public.subscriptions add constraint subscriptions_module_check
  check (module in (
    'timetrack', 'movementtrack', 'tasktrack', 'billtrack',
    'accounttrack', 'doctrack', 'hrtrack', 'calentrack', 'admin',
    'ai_support'
  ));

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references public.users(id),
  subject text not null,
  description text not null,
  channel text not null check (channel in ('standard', 'ai_assisted')),
  severity text not null default 'C' check (severity in ('A', 'B', 'C')),
  status text not null default 'open' check (status in ('open', 'agent_assigned', 'resolved')),
  assigned_to uuid references public.platform_admins(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index support_requests_tenant_idx on public.support_requests (tenant_id);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  -- Denormalized (reachable via request_id) to match document_events'
  -- own precedent, and to make tenant-scoped queries/RLS simpler.
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null references public.support_requests(id) on delete cascade,
  sender_type text not null check (sender_type in ('user', 'ai', 'agent')),
  -- Two identity planes exist in this app (tenant users vs.
  -- platform_admins for creator/support staff) -- a single FK column
  -- can't point at both. Exactly one is set, matching sender_type
  -- ('agent' -> sender_agent_id, 'user' -> sender_user_id, 'ai' -> neither).
  sender_user_id uuid references public.users(id),
  sender_agent_id uuid references public.platform_admins(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index support_messages_request_idx on public.support_messages (request_id);

alter table public.support_requests enable row level security;
create policy "support_requests_select_own_tenant" on public.support_requests
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- support_messages intentionally has no RLS policy, matching
-- doctrack's own subsidiary tables (documents/document_versions/
-- document_events) -- fully service-role-gated via API routes instead.
