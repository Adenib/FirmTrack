-- Live "Chat with Sales" for anonymous marketing-site visitors (prospects,
-- not yet subscribers) -- distinct from support_requests, which requires
-- an authenticated FirmTrack user. There's no Supabase auth session
-- possible for an anonymous visitor, so access is scoped by a random
-- bearer token on the lead row instead (the widget stores it and presents
-- it on every request), checked in application code. RLS is enabled with
-- no policies at all -- every real read/write already goes through the
-- service-role API routes, and there's no per-row ownership expressible
-- in plain RLS for an anonymous bearer-token scheme.
create table public.sales_leads (
  id uuid primary key default gen_random_uuid(),
  access_token uuid not null default gen_random_uuid() unique,
  name text not null,
  email text not null,
  phone text,
  message text not null,
  status text not null default 'open' check (status in ('open', 'contacted', 'closed')),
  assigned_to uuid references public.platform_admins(id),
  lead_typing_at timestamptz,
  agent_typing_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
alter table public.sales_leads enable row level security;

create table public.sales_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.sales_leads(id) on delete cascade,
  sender_type text not null check (sender_type in ('lead', 'agent')),
  sender_agent_id uuid references public.platform_admins(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index sales_messages_lead_idx on public.sales_messages (lead_id, created_at);
alter table public.sales_messages enable row level security;

-- New cadre for sales/marketing staff handling these leads -- same
-- widen-the-constraint pattern as every prior cadre addition.
alter table public.platform_admins drop constraint if exists platform_admins_role_check;
alter table public.platform_admins add constraint platform_admins_role_check
  check (role in ('creator', 'staff', 'admin', 'accounts', 'developer', 'sales'));
