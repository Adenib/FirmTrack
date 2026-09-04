-- AITrack Legal Research Assistant: answer a legal research question,
-- grounded in Claude's server-side web search (real, current, publicly
-- indexed sources) rather than pure model recall -- no LawPavilion/Primsol
-- integration (no public API, and Primsol is itself a competing AI
-- research product, not a raw case-law database; see the feature's plan).
create table if not exists public.ai_research_memos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  matter_id uuid references public.matters(id),
  question text not null,
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  notes text,
  model text not null,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists ai_research_memos_tenant_idx on public.ai_research_memos (tenant_id, created_at desc);

alter table public.ai_research_memos enable row level security;
create policy "ai_research_memos_select_own_tenant" on public.ai_research_memos
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
