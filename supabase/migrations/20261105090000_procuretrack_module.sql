-- ProcureTrack: full Purchase-to-Pay (Requisition -> Approval -> RFQ/
-- Sourcing -> Purchase Order -> Goods Receipt -> Invoice -> 3-Way Match ->
-- Payment), plus supporting vendor management, department budgets, a
-- catalog, contracts, an append-only audit trail, and a vendor portal.
-- Built from the user's generic procurement brief, adapted to this
-- codebase's conventions the same way AssetTrack was: app-code role/module
-- checks (RLS below is defense-in-depth only), the document_events-style
-- tamper-proof audit table, and postJournalEntry() for the one ledger
-- write. No new 'procurement' role -- owner/admin/manager approve,
-- `accounts` (or owner/admin) handles AP/payment, any staff raises a
-- requisition.
--
-- 'vendors' is deliberately NOT procuretrack_-prefixed: it's a shared
-- registry used by both AssetTrack and ProcureTrack. assettrack_tickets
-- gets an additive vendor_id column below -- its existing free-text
-- vendor_name column is untouched.

-- ============================================================
-- departments -- first real department/cost-center entity in this
-- codebase (users.department is, and stays, free text).
-- ============================================================
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  cost_center_code text,
  manager_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists departments_tenant_name_uq on public.departments (tenant_id, name);

alter table public.departments enable row level security;
create policy "departments_select_own_tenant" on public.departments
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- vendors (shared with AssetTrack) + vendor_documents
-- ============================================================
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text,
  email text,
  phone text,
  address text,
  tax_id text,
  bank_name text,
  bank_account_number text,
  bank_account_name text,
  status text not null default 'pending_approval' check (status in ('active', 'pending_approval', 'blacklisted')),
  notes text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vendors_tenant_idx on public.vendors (tenant_id);

alter table public.vendors enable row level security;
create policy "vendors_select_own_tenant" on public.vendors
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

create table if not exists public.vendor_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  document_type text not null check (document_type in ('cac', 'tin', 'bank_details', 'other')),
  storage_path text not null,
  filename text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists vendor_documents_vendor_idx on public.vendor_documents (vendor_id);

alter table public.vendor_documents enable row level security;
create policy "vendor_documents_select_own_tenant" on public.vendor_documents
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- Additive only -- existing vendor_name free-text column and every
-- existing AssetTrack code path are untouched.
alter table public.assettrack_tickets add column if not exists vendor_id uuid references public.vendors(id) on delete set null;

-- ============================================================
-- procuretrack_catalog_items -- pre-approved items; routine purchases can
-- skip RFQ and go straight to PO. track_inventory items get on_hand_quantity
-- maintained by the goods-receipt route.
-- ============================================================
create table if not exists public.procuretrack_catalog_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  sku text,
  name text not null,
  description text,
  category text,
  preferred_vendor_id uuid references public.vendors(id) on delete set null,
  unit_price numeric(12, 2),
  unit_of_measure text,
  track_inventory boolean not null default false,
  on_hand_quantity numeric(12, 2) not null default 0,
  reorder_point numeric(12, 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists procuretrack_catalog_items_tenant_idx on public.procuretrack_catalog_items (tenant_id);

alter table public.procuretrack_catalog_items enable row level security;
create policy "procuretrack_catalog_items_select_own_tenant" on public.procuretrack_catalog_items
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- procuretrack_budgets -- department/cost-center budgets, separate from
-- AccountTrack's lawyer/matter budgets table (that one's XOR constraint
-- is hard-coded to exactly those two owner types and doesn't generalize).
-- Committed/actual are computed live by querying open POs / paid invoices,
-- same convention as AccountTrack's own budgets table -- no stored columns.
-- ============================================================
create table if not exists public.procuretrack_budgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  amount numeric(14, 2) not null,
  currency text not null default 'NGN',
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists procuretrack_budgets_dept_period_uq on public.procuretrack_budgets (tenant_id, department_id, period_start, period_end);

alter table public.procuretrack_budgets enable row level security;
create policy "procuretrack_budgets_select_own_tenant" on public.procuretrack_budgets
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- procuretrack_requisitions (PR) -- any staff member raises one.
-- ============================================================
create table if not exists public.procuretrack_requisitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references public.users(id),
  department_id uuid references public.departments(id) on delete set null,
  catalog_item_id uuid references public.procuretrack_catalog_items(id) on delete set null,
  item_description text not null,
  quantity numeric(12, 2) not null default 1,
  unit_of_measure text,
  estimated_unit_cost numeric(12, 2),
  estimated_total_cost numeric(12, 2),
  reason text,
  status text not null default 'draft' check (status in (
    'draft', 'submitted', 'pending_approval', 'approved', 'rejected',
    'converted_to_rfq', 'converted_to_po', 'cancelled'
  )),
  -- Set true only by the low-stock auto-PR path in the goods-receipt
  -- route -- still lands as 'draft', never auto-submitted, so segregation
  -- of duties/approval still applies to it like any other requisition.
  auto_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists procuretrack_requisitions_tenant_idx on public.procuretrack_requisitions (tenant_id, status);
create index if not exists procuretrack_requisitions_requester_idx on public.procuretrack_requisitions (tenant_id, requested_by);

alter table public.procuretrack_requisitions enable row level security;
create policy "procuretrack_requisitions_select_own_tenant" on public.procuretrack_requisitions
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- procuretrack_approval_rules -- data-driven thresholds/approvers, never
-- hard-coded in route code. approver_sequence is an ordered array of
-- { "role": "manager" } steps, e.g. [{"role":"manager"},{"role":"accounts"}]
-- matching the brief's "under X -> line manager; over -> line manager then
-- Finance". department_id null = applies to every department; max_amount
-- null = unbounded.
-- ============================================================
create table if not exists public.procuretrack_approval_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  min_amount numeric(14, 2) not null default 0,
  max_amount numeric(14, 2),
  department_id uuid references public.departments(id) on delete cascade,
  approver_sequence jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists procuretrack_approval_rules_tenant_idx on public.procuretrack_approval_rules (tenant_id);

alter table public.procuretrack_approval_rules enable row level security;
create policy "procuretrack_approval_rules_select_own_tenant" on public.procuretrack_approval_rules
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- procuretrack_approvals -- one row per approval_sequence step, generated
-- when a requisition is submitted. Segregation of duty (the requester
-- never decides their own request) is enforced in application code when
-- these rows are generated and when a decision is recorded.
-- ============================================================
create table if not exists public.procuretrack_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  requisition_id uuid not null references public.procuretrack_requisitions(id) on delete cascade,
  sequence_no integer not null,
  approver_role text not null,
  decided_by uuid references public.users(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  comments text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists procuretrack_approvals_requisition_idx on public.procuretrack_approvals (requisition_id, sequence_no);

alter table public.procuretrack_approvals enable row level security;
create policy "procuretrack_approvals_select_own_tenant" on public.procuretrack_approvals
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- procuretrack_rfqs / rfq_vendors / rfq_quotes -- sourcing. Selecting a
-- quote always requires a written selection_reason, per the brief.
-- ============================================================
create table if not exists public.procuretrack_rfqs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  requisition_id uuid not null references public.procuretrack_requisitions(id) on delete cascade,
  title text not null,
  status text not null default 'open' check (status in ('open', 'closed', 'awarded', 'cancelled')),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists procuretrack_rfqs_tenant_idx on public.procuretrack_rfqs (tenant_id, status);

alter table public.procuretrack_rfqs enable row level security;
create policy "procuretrack_rfqs_select_own_tenant" on public.procuretrack_rfqs
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

create table if not exists public.procuretrack_rfq_vendors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  rfq_id uuid not null references public.procuretrack_rfqs(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  invited_at timestamptz not null default now()
);
create unique index if not exists procuretrack_rfq_vendors_uq on public.procuretrack_rfq_vendors (rfq_id, vendor_id);

alter table public.procuretrack_rfq_vendors enable row level security;
create policy "procuretrack_rfq_vendors_select_own_tenant" on public.procuretrack_rfq_vendors
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

create table if not exists public.procuretrack_rfq_quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  rfq_id uuid not null references public.procuretrack_rfqs(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  unit_price numeric(12, 2) not null,
  quantity numeric(12, 2) not null default 1,
  total_price numeric(14, 2) not null,
  lead_time_days integer,
  notes text,
  attachment_path text,
  submitted_at timestamptz not null default now(),
  is_selected boolean not null default false,
  selection_reason text
);
create index if not exists procuretrack_rfq_quotes_rfq_idx on public.procuretrack_rfq_quotes (rfq_id);

alter table public.procuretrack_rfq_quotes enable row level security;
create policy "procuretrack_rfq_quotes_select_own_tenant" on public.procuretrack_rfq_quotes
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- procuretrack_purchase_orders / po_lines / po_amendments -- an issued PO
-- is never edited in place; every change past 'issued' is a new
-- po_amendments row alongside the updated PO fields.
-- ============================================================
create table if not exists public.procuretrack_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  po_number text not null,
  -- Nullable: a catalog item can go straight to PO, skipping RFQ.
  requisition_id uuid references public.procuretrack_requisitions(id) on delete set null,
  vendor_id uuid not null references public.vendors(id),
  department_id uuid references public.departments(id) on delete set null,
  status text not null default 'draft' check (status in (
    'draft', 'issued', 'partially_received', 'received', 'closed', 'cancelled'
  )),
  currency text not null default 'NGN',
  total_amount numeric(14, 2) not null default 0,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index if not exists procuretrack_purchase_orders_tenant_number_uq on public.procuretrack_purchase_orders (tenant_id, po_number);
create index if not exists procuretrack_purchase_orders_tenant_idx on public.procuretrack_purchase_orders (tenant_id, status);

alter table public.procuretrack_purchase_orders enable row level security;
create policy "procuretrack_purchase_orders_select_own_tenant" on public.procuretrack_purchase_orders
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

create table if not exists public.procuretrack_po_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  po_id uuid not null references public.procuretrack_purchase_orders(id) on delete cascade,
  catalog_item_id uuid references public.procuretrack_catalog_items(id) on delete set null,
  description text not null,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  line_total numeric(14, 2) not null default 0
);
create index if not exists procuretrack_po_lines_po_idx on public.procuretrack_po_lines (po_id);

alter table public.procuretrack_po_lines enable row level security;
create policy "procuretrack_po_lines_select_own_tenant" on public.procuretrack_po_lines
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

create table if not exists public.procuretrack_po_amendments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  po_id uuid not null references public.procuretrack_purchase_orders(id) on delete cascade,
  amendment_number integer not null,
  changes jsonb not null,
  reason text not null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists procuretrack_po_amendments_po_idx on public.procuretrack_po_amendments (po_id, amendment_number);

alter table public.procuretrack_po_amendments enable row level security;
create policy "procuretrack_po_amendments_select_own_tenant" on public.procuretrack_po_amendments
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- procuretrack_goods_receipts / goods_receipt_lines (GRN) -- records what
-- actually arrived, including partial deliveries and rejected items.
-- ============================================================
create table if not exists public.procuretrack_goods_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  po_id uuid not null references public.procuretrack_purchase_orders(id) on delete cascade,
  received_by uuid references public.users(id),
  received_at timestamptz not null default now(),
  status text not null check (status in ('full', 'partial')),
  notes text
);
create index if not exists procuretrack_goods_receipts_po_idx on public.procuretrack_goods_receipts (po_id);

alter table public.procuretrack_goods_receipts enable row level security;
create policy "procuretrack_goods_receipts_select_own_tenant" on public.procuretrack_goods_receipts
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

create table if not exists public.procuretrack_goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  grn_id uuid not null references public.procuretrack_goods_receipts(id) on delete cascade,
  po_line_id uuid not null references public.procuretrack_po_lines(id),
  quantity_received numeric(12, 2) not null default 0,
  quantity_rejected numeric(12, 2) not null default 0,
  rejection_reason text
);
create index if not exists procuretrack_goods_receipt_lines_grn_idx on public.procuretrack_goods_receipt_lines (grn_id);

alter table public.procuretrack_goods_receipt_lines enable row level security;
create policy "procuretrack_goods_receipt_lines_select_own_tenant" on public.procuretrack_goods_receipt_lines
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- procuretrack_contracts -- framework agreements with expiry alerts.
-- ============================================================
create table if not exists public.procuretrack_contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id),
  title text not null,
  contract_number text,
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active', 'expired', 'terminated')),
  document_path text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists procuretrack_contracts_tenant_idx on public.procuretrack_contracts (tenant_id, end_date);

alter table public.procuretrack_contracts enable row level security;
create policy "procuretrack_contracts_select_own_tenant" on public.procuretrack_contracts
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- procuretrack_invoices / invoice_lines -- AP captures the vendor's
-- invoice against a PO; match_result holds the 3-way-match output
-- (per-line matched/mismatched + overall), never auto-advanced past
-- 'mismatched' by the API.
-- ============================================================
create table if not exists public.procuretrack_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  po_id uuid not null references public.procuretrack_purchase_orders(id),
  vendor_id uuid not null references public.vendors(id),
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  subtotal numeric(14, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  status text not null default 'pending_match' check (status in (
    'pending_match', 'matched', 'mismatched', 'approved', 'paid', 'rejected'
  )),
  match_result jsonb,
  attachment_path text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists procuretrack_invoices_tenant_idx on public.procuretrack_invoices (tenant_id, status);
create index if not exists procuretrack_invoices_po_idx on public.procuretrack_invoices (po_id);

alter table public.procuretrack_invoices enable row level security;
create policy "procuretrack_invoices_select_own_tenant" on public.procuretrack_invoices
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

create table if not exists public.procuretrack_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.procuretrack_invoices(id) on delete cascade,
  po_line_id uuid references public.procuretrack_po_lines(id),
  description text not null,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  line_total numeric(14, 2) not null default 0
);
create index if not exists procuretrack_invoice_lines_invoice_idx on public.procuretrack_invoice_lines (invoice_id);

alter table public.procuretrack_invoice_lines enable row level security;
create policy "procuretrack_invoice_lines_select_own_tenant" on public.procuretrack_invoice_lines
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- procuretrack_payments -- posts a real journal entry via
-- postJournalEntry() (sourceType 'procuretrack_payment', widened into the
-- journal_entries check constraint below), same as every other
-- money-movement route in this codebase.
-- ============================================================
create table if not exists public.procuretrack_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.procuretrack_invoices(id),
  amount numeric(14, 2) not null,
  paid_at timestamptz not null default now(),
  paid_by uuid references public.users(id),
  journal_entry_id uuid references public.journal_entries(id),
  payment_method text,
  reference text,
  created_at timestamptz not null default now()
);
create index if not exists procuretrack_payments_invoice_idx on public.procuretrack_payments (invoice_id);

alter table public.procuretrack_payments enable row level security;
create policy "procuretrack_payments_select_own_tenant" on public.procuretrack_payments
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- procuretrack_audit_log -- append-only, same shape/intent as
-- document_events and assettrack_ticket_events: one plain insert() right
-- after each mutation, UPDATE/DELETE revoked below so it's genuinely
-- tamper-proof, not just app convention.
-- ============================================================
create table if not exists public.procuretrack_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  document_type text not null check (document_type in (
    'requisition', 'po', 'grn', 'invoice', 'payment', 'vendor', 'contract'
  )),
  document_id uuid not null,
  user_id uuid references public.users(id),
  event_type text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists procuretrack_audit_log_document_idx on public.procuretrack_audit_log (document_type, document_id, created_at);

alter table public.procuretrack_audit_log enable row level security;
create policy "procuretrack_audit_log_select_own_tenant" on public.procuretrack_audit_log
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

revoke update, delete on public.procuretrack_audit_log from anon, authenticated, service_role;

-- ============================================================
-- vendor_portal_users -- vendors get a real Supabase Auth account
-- (auth_user_id), kept in their own identity space, never mixed into
-- public.users/the tenant role system. auth_user_id is null until the
-- emailed invite is accepted. Portal API routes check this table
-- (service-role client) instead of public.users; the select policy below
-- is defense-in-depth only, same as everywhere else, not the primary gate
-- for a vendor's own portal session.
-- ============================================================
create table if not exists public.vendor_portal_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  email text not null,
  auth_user_id uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index if not exists vendor_portal_users_tenant_email_uq on public.vendor_portal_users (tenant_id, email);

alter table public.vendor_portal_users enable row level security;
create policy "vendor_portal_users_select_own_tenant" on public.vendor_portal_users
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

-- ============================================================
-- New chart-of-accounts entry for ProcureTrack payments -- 'expense' is
-- already a valid account_type. New tenants get it via /api/register's
-- existing DEFAULT_ACCOUNTS seed loop (see src/lib/accounttrack/
-- default-accounts.ts); this backfills every existing tenant the same
-- way payroll's two new accounts were backfilled.
-- ============================================================
insert into public.chart_of_accounts (tenant_id, key, code, name, account_type)
select o.id, 'operating_expenses', '5030', 'Operating Expenses', 'expense'
from public.organizations o
on conflict (tenant_id, key) where key is not null do nothing;

-- Widen journal_entries' source_type check constraint for the new
-- 'procuretrack_payment' value -- same drop/recreate pattern as every
-- prior widening, current full list copied from
-- 20260805090000_accounttrack_fx_revaluation_schema.sql.
alter table public.journal_entries drop constraint if exists journal_entries_source_type_check;
alter table public.journal_entries add constraint journal_entries_source_type_check check (source_type in (
  'invoice_created', 'invoice_payment', 'invoice_void', 'disbursement_recorded',
  'trust_deposit', 'trust_withdrawal', 'retainer_deposit', 'retainer_withdrawal',
  'manual', 'year_close', 'year_reopen', 'gl_import', 'payroll_run',
  'fx_revaluation_manual', 'fx_revaluation_period_close', 'fx_revaluation_reopen',
  'procuretrack_payment'
));

-- Seed standard pricing for the new module, same Basic/Standard/Elite NGN
-- rates every recent module used -- editable afterward via the Creator
-- Console pricing page.
insert into public.platform_module_pricing (module, tier, price, currency)
values
  ('procuretrack', 'basic', 2000, 'NGN'),
  ('procuretrack', 'standard', 2500, 'NGN'),
  ('procuretrack', 'elite', 4000, 'NGN')
on conflict (module, tier, currency) do nothing;

-- subscriptions.module check constraint -- WIDEN, do not forget (every
-- prior module migration had to; invisible to code/migration search).
alter table public.subscriptions drop constraint if exists subscriptions_module_check;
alter table public.subscriptions add constraint subscriptions_module_check
  check (module in (
    'timetrack', 'movementtrack', 'tasktrack', 'billtrack', 'accounttrack',
    'doctrack', 'hrtrack', 'calentrack', 'admin', 'ai_support', 'aitrack',
    'assettrack', 'procuretrack'
  ));
