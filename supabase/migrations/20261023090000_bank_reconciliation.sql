-- Bank Reconciliation: import a bank statement for any account flagged
-- is_cash_account in the Chart of Accounts (trust_bank, operating_cash, or
-- any custom cash account), then match each statement line against the
-- journal_lines already posted to that account. Matching only ever pairs
-- an existing, already-posted journal_lines row with a statement line --
-- it never creates new postings itself, so it never touches post_journal_entry
-- or the closed-accounting-period check inside it.
--
-- journal_lines is left completely untouched by this feature (no new
-- columns there) -- the match pointer lives on bank_statement_lines
-- instead, consistent with post_journal_entry being this codebase's one
-- deliberate sole-write-path exception for ledger data.
create table if not exists public.bank_statement_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.chart_of_accounts(id),
  statement_start date not null,
  statement_end date not null,
  opening_balance numeric(18, 2) not null,
  closing_balance numeric(18, 2) not null,
  imported_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists bank_statement_imports_tenant_account_idx
  on public.bank_statement_imports (tenant_id, account_id);

-- amount sign convention: positive = money came into the account (deposit),
-- negative = money went out (withdrawal/check/fee) -- matched against
-- journal_lines.debit - journal_lines.credit on the same account, which
-- uses the same sign for an asset account (debit increases balance).
create table if not exists public.bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  import_id uuid not null references public.bank_statement_imports(id) on delete cascade,
  line_date date not null,
  description text,
  amount numeric(18, 2) not null,
  reference text,
  status text not null default 'unmatched' check (status in ('unmatched', 'matched', 'ignored')),
  matched_journal_line_id uuid references public.journal_lines(id),
  matched_at timestamptz,
  matched_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists bank_statement_lines_import_idx on public.bank_statement_lines (import_id);
create index if not exists bank_statement_lines_tenant_status_idx on public.bank_statement_lines (tenant_id, status);
-- Enforces one statement line can't match the same journal line as another.
create unique index if not exists bank_statement_lines_matched_journal_line_uidx
  on public.bank_statement_lines (matched_journal_line_id) where matched_journal_line_id is not null;

alter table public.bank_statement_imports enable row level security;
alter table public.bank_statement_lines enable row level security;

create policy "bank_statement_imports_select_own_tenant" on public.bank_statement_imports
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

create policy "bank_statement_lines_select_own_tenant" on public.bank_statement_lines
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- Required from 2026-10-30 onward for every new table's Data API access to
-- keep working (see memory: supabase-data-api-grants). RLS above already
-- blocks anon/authenticated from reading/writing anything in practice --
-- every real access in this app goes through the service-role client.
grant select on public.bank_statement_imports to anon;
grant select, insert, update, delete on public.bank_statement_imports to authenticated;
grant select, insert, update, delete on public.bank_statement_imports to service_role;

grant select on public.bank_statement_lines to anon;
grant select, insert, update, delete on public.bank_statement_lines to authenticated;
grant select, insert, update, delete on public.bank_statement_lines to service_role;
