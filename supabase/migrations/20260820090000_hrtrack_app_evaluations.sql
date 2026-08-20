-- HRTrack "Evaluate Applications" -- a second, distinct evaluation system
-- alongside the existing staff performance_evaluations, for rating how
-- well an AI application (currently "August") performs versus traditional
-- work. Two parts:
--
-- app_evaluation_entries: a Daily User Evaluation Form, one record per
-- (user, task, date), self-logged. Unlike performance_evaluations
-- (append-only), the submitter can edit/delete their own rows -- task-log
-- data is typo-prone and not a compliance-sensitive financial record.
--
-- app_evaluation_scorecards: a periodic, evaluator-scored weighted rollup
-- (10 categories, hardcoded weights enforced in the API route) producing a
-- single 0-100 total_score for the application. Append-only, like
-- performance_evaluations -- a formal review record; corrections are a
-- new scorecard.
create table if not exists public.app_evaluation_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id),
  application_name text not null default 'August',
  practice_area text,
  task text not null,
  entry_date date not null,
  traditional_time_minutes numeric(8,2) not null check (traditional_time_minutes > 0),
  app_time_minutes numeric(8,2) not null check (app_time_minutes >= 0),
  time_saved_pct numeric(6,2) not null,
  accuracy integer not null check (accuracy between 1 and 5),
  quality integer not null check (quality between 1 and 5),
  citation_accuracy integer not null check (citation_accuracy between 1 and 5),
  ease_of_use integer not null check (ease_of_use between 1 and 5),
  material_error boolean not null default false,
  overall_rating integer not null check (overall_rating between 1 and 5),
  comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_evaluation_entries_tenant_idx on public.app_evaluation_entries (tenant_id);
create index if not exists app_evaluation_entries_user_idx on public.app_evaluation_entries (tenant_id, user_id, entry_date desc);

alter table public.app_evaluation_entries enable row level security;
create policy "app_evaluation_entries_select_own_tenant" on public.app_evaluation_entries
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));

create table if not exists public.app_evaluation_scorecards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  application_name text not null default 'August',
  period text not null,
  period_start date not null,
  period_end date not null,
  evaluator_user_id uuid not null references public.users(id),
  legal_accuracy numeric(5,2) not null check (legal_accuracy between 0 and 100),
  legal_research_citations numeric(5,2) not null check (legal_research_citations between 0 and 100),
  drafting_quality numeric(5,2) not null check (drafting_quality between 0 and 100),
  document_review_analysis numeric(5,2) not null check (document_review_analysis between 0 and 100),
  productivity_time_savings numeric(5,2) not null check (productivity_time_savings between 0 and 100),
  usability_ux numeric(5,2) not null check (usability_ux between 0 and 100),
  security_confidentiality numeric(5,2) not null check (security_confidentiality between 0 and 100),
  workflow_integration numeric(5,2) not null check (workflow_integration between 0 and 100),
  reliability_performance numeric(5,2) not null check (reliability_performance between 0 and 100),
  cost_roi_scalability numeric(5,2) not null check (cost_roi_scalability between 0 and 100),
  total_score numeric(5,2) not null,
  comments text,
  created_at timestamptz not null default now()
);

create index if not exists app_evaluation_scorecards_tenant_idx on public.app_evaluation_scorecards (tenant_id, period_start desc);

alter table public.app_evaluation_scorecards enable row level security;
create policy "app_evaluation_scorecards_select_own_tenant" on public.app_evaluation_scorecards
  for select using (tenant_id = (select tenant_id from public.users where id = auth.uid()));
