-- Free-text reference field for manual journal entries and the new
-- General Check flow (e.g. "JV-2026-0041", a check number) -- nullable,
-- no enforced sequence.
alter table public.journal_entries add column if not exists reference text;

create index if not exists journal_entries_tenant_reference_idx
  on public.journal_entries (tenant_id, reference) where reference is not null;
