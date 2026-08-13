import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type BlogPost = {
  id: string
  slug: string
  title: string
  excerpt: string
  content: string
  cover_image_url: string | null
  author_name: string
  status: 'draft' | 'published'
  published_at: string | null
  created_at: string
  updated_at: string
}

// Public-facing reads only ever see published posts -- server-side only
// (service-role client, blog_posts has no RLS policies). Shared by the
// public /blog pages and sitemap.ts so both stay in sync.
export async function getPublishedPosts(): Promise<BlogPost[]> {
  const { data } = await supabaseAdmin
    .from('blog_posts')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  return data || []
}

export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  const { data } = await supabaseAdmin
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  return data
}
