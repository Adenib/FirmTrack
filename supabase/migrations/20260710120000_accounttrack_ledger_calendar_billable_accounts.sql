-- AccountTrack ledger backend (Phase 1), TimeTrack<->CalenTrack linking,
-- and the "Accounts" staff role, mirroring the existing "lawyer" pattern.
--
-- Schema notes verified against the live project before writing this
-- (via the PostgREST OpenAPI schema) rather than assumed from migration
-- history alone, since `matters`/`users`/`time_entries` all predate the
-- migrations folder in this repo:
--   - public.time_entries.billable already exists (boolean not null
--     default true) on the live table, so it is NOT added here.
--   - public.ft_calendar_events already exists with a generic
--     `linked_module text` / `linked_id uuid` pair (not a bespoke
--     matter_id column). Linking a calendar event to a matter reuses that
--     existing generic pair (linked_module = 'matters', linked_id =
--     matters.id) instead of adding a redundant matter-specific column.
--     The reverse direction (a time entry recording which calendar event
--     it was created from) still needs a dedicated column below, since
--     ft_calendar_events' single linked_module/linked_id pair can only
--     point at one thing and matter-linkage already claims it.

-- ============================================================
-- invoices (minimal header + mutable paid_amount_usd; no invoice
-- generation/PDF in this phase)
-- ============================================================
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  matter_id uuid not null references public.matters(id),
  invoice_number text not null,
  invoice_date date not null default current_date,
  due_date date,
  fees_amount_usd numeric(12, 2) not null default 0,
  disbursements_amount_usd numeric(12, 2) not null default 0,
  total_amount_usd numeric(12, 2) not null default 0,
  paid_amount_usd numeric(12, 2) not null default 0,
  status text not null default 'open' check (status in ('open', 'partially_paid', 'paid', 'void')),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, invoice_number)
);

create index if not exists invoices_tenant_idx on public.invoices (tenant_id);
create index if not exists invoices_tenant_matter_idx on public.invoices (tenant_id, matter_id);

alter table public.invoices enable row level security;
drop policy if exists "invoices_select_own_tenant" on public.invoices;
create policy "invoices_select_own_tenant" on public.invoices
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- disbursements (billable expenses per matter)
-- ============================================================
create table if not exists public.disbursements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  matter_id uuid not null references public.matters(id),
  lawyer_id uuid references public.lawyers(id),
  disb_date date not null default current_date,
  description text,
  amount_usd numeric(12, 2) not null,
  billed boolean not null default false,
  invoice_id uuid references public.invoices(id),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists disbursements_tenant_idx on public.disbursements (tenant_id);
create index if not exists disbursements_tenant_matter_idx on public.disbursements (tenant_id, matter_id);

alter table public.disbursements enable row level security;
drop policy if exists "disbursements_select_own_tenant" on public.disbursements;
create policy "disbursements_select_own_tenant" on public.disbursements
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- trust_ledger_entries (append-only; trust + general retainer share one
-- table via ledger_type. Balance = SUM(amount_usd) at read time. No
-- update/delete is exposed by the API — corrections are offsetting
-- entries, to preserve the audit trail real trust accounting needs.)
-- ============================================================
create table if not exists public.trust_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  matter_id uuid not null references public.matters(id),
  ledger_type text not null check (ledger_type in ('trust', 'retainer')),
  entry_date date not null default current_date,
  amount_usd numeric(12, 2) not null,
  transaction_type text,
  description text,
  reference text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists trust_ledger_entries_tenant_idx on public.trust_ledger_entries (tenant_id);
create index if not exists trust_ledger_entries_tenant_matter_idx on public.trust_ledger_entries (tenant_id, matter_id, ledger_type);

alter table public.trust_ledger_entries enable row level security;
drop policy if exists "trust_ledger_entries_select_own_tenant" on public.trust_ledger_entries;
create policy "trust_ledger_entries_select_own_tenant" on public.trust_ledger_entries
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- accounts_categories / accounts_staff — mirrors lawyer_categories /
-- lawyers exactly, giving the new "Accounts" role its own staff records
-- and tiers ("Accounts 1/2/3"), the same way lawyers are modeled.
-- Tiers are organizational/display labels only, same as lawyer
-- categories today — they do not themselves gate route permissions.
-- ============================================================
create table if not exists public.accounts_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists accounts_categories_tenant_idx on public.accounts_categories (tenant_id);

alter table public.accounts_categories enable row level security;
drop policy if exists "accounts_categories_select_own_tenant" on public.accounts_categories;
create policy "accounts_categories_select_own_tenant" on public.accounts_categories
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

create table if not exists public.accounts_staff (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.users(id),
  full_name text not null,
  nickname text,
  initials text,
  category_id uuid references public.accounts_categories(id),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounts_staff_tenant_idx on public.accounts_staff (tenant_id);

alter table public.accounts_staff enable row level security;
drop policy if exists "accounts_staff_select_own_tenant" on public.accounts_staff;
create policy "accounts_staff_select_own_tenant" on public.accounts_staff
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- time_entries: link to the invoice that billed it, and to the
-- CalenTrack event it was created from (if any). Nullable, no cascade,
-- matching the activity_log.converted_to_entry_id cross-module convention.
-- ============================================================
alter table public.time_entries add column if not exists invoice_id uuid references public.invoices(id);
alter table public.time_entries add column if not exists calendar_event_id uuid references public.ft_calendar_events(id);

create index if not exists time_entries_tenant_invoice_idx on public.time_entries (tenant_id, invoice_id);
