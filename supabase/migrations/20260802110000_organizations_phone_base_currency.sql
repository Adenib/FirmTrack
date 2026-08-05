-- Multi-currency accounting, Phase 1, Workstream B. organizations
-- predates supabase/migrations/ (no CREATE TABLE here) -- alter-only,
-- matching the existing pattern used elsewhere in this repo for
-- pre-existing tables (e.g. the earlier users job_title/department/
-- office/phone migration).
alter table public.organizations add column if not exists phone text;
alter table public.organizations add column if not exists base_currency text not null default 'NGN';

alter table public.organizations drop constraint if exists organizations_base_currency_format_check;
alter table public.organizations add constraint organizations_base_currency_format_check
  check (base_currency ~ '^[A-Z]{3}$');
