-- BillTrack Stage 1: schema for detailed billing, client email
-- notifications, reminder pausing, and per-tenant reminder cadence.
--
-- Builds on the `invoices` table AccountTrack Phase 2 already created
-- (supabase/migrations/20260710120000_accounttrack_ledger_calendar_billable_accounts.sql).
-- Payment status itself (open/partially_paid/paid/void) is already
-- tracked there and needs no changes — BillTrack only adds what's new:
-- per-matter billing cycle, reminder pause state, and a send-history log.

-- ============================================================
-- matters: per-matter auto-invoice billing cycle (Stage 2 will read
-- this; added now so the column exists before that cron is built).
-- 28-day cap on the anchor day avoids "day 30 doesn't exist in Feb"
-- edge cases when computing due dates.
-- ============================================================
alter table public.matters add column if not exists billing_frequency text not null default 'monthly'
  check (billing_frequency in ('monthly', 'quarterly', 'custom'));
alter table public.matters add column if not exists billing_anchor_day integer not null default 1
  check (billing_anchor_day between 1 and 28);

-- ============================================================
-- invoices: reminder pause state (mutable, so it lives on the row
-- itself, same as `status`) and a flag distinguishing cron-generated
-- invoices from manually-created ones for reporting/audit clarity.
-- ============================================================
alter table public.invoices add column if not exists reminders_paused boolean not null default false;
alter table public.invoices add column if not exists reminders_paused_by uuid references public.users(id);
alter table public.invoices add column if not exists reminders_paused_at timestamptz;
alter table public.invoices add column if not exists auto_generated boolean not null default false;

-- ============================================================
-- invoice_reminders: append-only send-history log (mirrors the
-- trust_ledger_entries audit-trail convention — corrections are new
-- rows, not edits). "Was this invoice ever sent" / "when's the next
-- reminder due" are derived from this table (max(sent_at) per
-- invoice_id) rather than duplicated as mutable columns on invoices.
-- ============================================================
create table if not exists public.invoice_reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  kind text not null check (kind in ('initial', 'reminder')),
  recipient_email text not null,
  status text not null check (status in ('sent', 'failed')),
  error_message text,
  sent_at timestamptz not null default now()
);

create index if not exists invoice_reminders_tenant_idx on public.invoice_reminders (tenant_id);
create index if not exists invoice_reminders_invoice_idx on public.invoice_reminders (invoice_id, sent_at desc);

alter table public.invoice_reminders enable row level security;
drop policy if exists "invoice_reminders_select_own_tenant" on public.invoice_reminders;
create policy "invoice_reminders_select_own_tenant" on public.invoice_reminders
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- billtrack_settings: one row per tenant. reminder_cadence_days is
-- configurable per firm (Stage 2 reads it; a row with defaults is
-- upserted lazily by the settings GET route the first time a tenant
-- visits BillTrack, rather than backfilled here for every existing org).
-- custom_resend_api_key is a real secret: the settings API route must
-- mask it on read and only ever accept a full replacement on write —
-- enforced in application code, not by this migration.
-- ============================================================
create table if not exists public.billtrack_settings (
  tenant_id uuid primary key references public.organizations(id) on delete cascade,
  reminder_cadence_days integer not null default 7 check (reminder_cadence_days > 0),
  custom_resend_api_key text,
  custom_from_email text,
  custom_from_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billtrack_settings enable row level security;
drop policy if exists "billtrack_settings_select_own_tenant" on public.billtrack_settings;
create policy "billtrack_settings_select_own_tenant" on public.billtrack_settings
  for select
  using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
