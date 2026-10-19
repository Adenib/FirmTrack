-- In-app satisfaction rating: a periodic popup (any active tenant user,
-- any role) asking for a 1-5 star rating plus an optional comment. Cadence
-- is time-based and grows per user: 14 days until the first prompt, 30
-- days until the second, then a steady 45 days forever after (or until
-- the user opts out) -- see src/lib/feedback/cadence.ts for the schedule
-- and src/app/api/app-feedback/status/route.ts for where it's applied.
--
-- Two tables: app_feedback (the actual submitted ratings/comments, one row
-- per submission, kept forever) and app_feedback_prompts (one row per
-- user, tracking only when they were last prompted and when they're next
-- due -- not a feedback record itself).
--
-- Platform-wide read surface (Creator Console's /creator/feedback), same
-- RLS posture as blog_posts/platform_module_pricing: RLS enabled with no
-- policies at all -- every access goes through a service-role client in
-- an API route, never a direct client-side Supabase call.
create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists app_feedback_tenant_idx on public.app_feedback (tenant_id);
create index if not exists app_feedback_created_idx on public.app_feedback (created_at desc);

create table if not exists public.app_feedback_prompts (
  user_id uuid primary key references public.users(id) on delete cascade,
  prompt_count int not null default 0,
  last_prompted_at timestamptz,
  next_prompt_at timestamptz not null default (now() + interval '14 days'),
  opted_out boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.app_feedback enable row level security;
alter table public.app_feedback_prompts enable row level security;
