-- Save/reuse templates for the manual AccountTrack entry forms (G/L
-- Adjustment, General Check, Receive Payment). payload stores the
-- non-amount fields of whichever form saved it -- amounts and dates are
-- always re-entered fresh at replay, never auto-posted.
create table if not exists public.recurring_transaction_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  transaction_type text not null check (transaction_type in ('journal_entry', 'general_check', 'receive_payment')),
  payload jsonb not null,
  created_by uuid references public.users(id),
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists recurring_templates_tenant_type_idx
  on public.recurring_transaction_templates (tenant_id, transaction_type);

-- Select-only RLS, matching chart_of_accounts/journal_entries -- all
-- writes go through the service-role client inside role-gated API routes.
alter table public.recurring_transaction_templates enable row level security;

create policy "recurring_templates_select_own_tenant" on public.recurring_transaction_templates
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
