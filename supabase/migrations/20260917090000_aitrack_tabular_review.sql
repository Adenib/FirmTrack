-- AITrack Tabular Document Review: review many documents at once
-- against a shared set of fields, producing a spreadsheet-style table.
-- Fields are ad-hoc per run (not a saved template, like Legal
-- Research's question rather than a saved Playbook).
create table if not exists public.ai_tabular_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  name text,
  fields jsonb not null, -- [{ label: text, instructions: text }, ...]
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists ai_tabular_reviews_tenant_idx on public.ai_tabular_reviews (tenant_id, created_at desc);

alter table public.ai_tabular_reviews enable row level security;
create policy "ai_tabular_reviews_select_own_tenant" on public.ai_tabular_reviews
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- document_id is ON DELETE SET NULL, not cascade -- a later-deleted
-- source document shouldn't erase the review history. document_title
-- is denormalized so a row still renders sensibly once document_id
-- goes null.
create table if not exists public.ai_tabular_review_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  tabular_review_id uuid not null references public.ai_tabular_reviews(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  document_title text not null,
  values jsonb, -- [{ label, value, notes }, ...], null on error
  error text, -- null on success
  created_at timestamptz not null default now()
);

create index if not exists ai_tabular_review_rows_review_idx on public.ai_tabular_review_rows (tabular_review_id);

alter table public.ai_tabular_review_rows enable row level security;
create policy "ai_tabular_review_rows_select_own_tenant" on public.ai_tabular_review_rows
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
