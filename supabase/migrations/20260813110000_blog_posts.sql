-- Public blog on firmtracks.com, authored through a new Creator Console
-- editor (/creator/blog). Content is Markdown, rendered client/server-side
-- via react-markdown -- never dangerouslySetInnerHTML, matching this
-- codebase's stated CSP position that raw HTML injection isn't used
-- anywhere. author_name is a free-text byline (default 'FirmTrack Team')
-- deliberately kept separate from updated_by -- the point of this design
-- is that no public page ever exposes which platform_admins row wrote a
-- post; updated_by is a purely internal audit field.
--
-- Platform-wide, not tenant-scoped -- same class of table as
-- platform_module_pricing: RLS enabled with no policies (deny-all for
-- anon/authenticated; every read/write goes through a service-role
-- client in a server component or API route, never a direct client-side
-- Supabase call).
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null,
  content text not null,
  cover_image_url text,
  author_name text not null default 'FirmTrack Team',
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.platform_admins(id)
);

create index if not exists blog_posts_status_published_idx on public.blog_posts (status, published_at desc);

alter table public.blog_posts enable row level security;
