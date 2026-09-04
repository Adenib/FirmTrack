-- AITrack Custom Expert Agent: firm-configured, named AI personas (e.g.
-- "Employment Law Expert") that staff chat with. Mirrors ai_playbooks
-- for the "firm defines a named, reusable AI config" shape, and
-- support_messages for the chat storage shape.
create table if not exists public.ai_expert_agents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  instructions text not null,
  visibility text not null default 'private' check (visibility in ('private', 'shared')),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_expert_agents enable row level security;
create policy "ai_expert_agents_select_own_tenant" on public.ai_expert_agents
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- A conversation is every row for one (agent_id, user_id) pair -- one
-- continuous, ongoing chat per user per agent, not ticket-like sessions.
-- No RLS: 'visibility' is conditional business logic (private vs shared)
-- enforced at the API layer, same reasoning as support_messages.
create table if not exists public.ai_expert_agent_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.ai_expert_agents(id) on delete cascade,
  user_id uuid not null references public.users(id),
  sender_type text not null check (sender_type in ('user', 'ai')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_expert_agent_messages_conv_idx on public.ai_expert_agent_messages (agent_id, user_id, created_at);
