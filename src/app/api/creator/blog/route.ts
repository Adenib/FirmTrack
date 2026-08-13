import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccessCreatorPage } from '@/lib/creator-permissions'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const slugify = (text: string) =>
  text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')

async function requireBlogAccess() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }

  const { data: admin } = await supabaseAdmin
    .from('platform_admins')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!admin || admin.status === 'inactive' || !canAccessCreatorPage(admin.role, 'blog')) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) }
  }
  return { user, admin }
}

// All posts, draft and published -- the Creator Console's own admin view.
// Public pages never call this route; they query blog_posts directly,
// filtered to status = 'published'.
export async function GET() {
  const { error } = await requireBlogAccess()
  if (error) return error

  const { data: posts, error: fetchError } = await supabaseAdmin
    .from('blog_posts')
    .select('*')
    .order('created_at', { ascending: false })

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  return NextResponse.json({ posts })
}

export async function POST(request: Request) {
  const { error, admin } = await requireBlogAccess()
  if (error) return error

  const { title, excerpt, content, cover_image_url, status, slug: requestedSlug } = await request.json()
  if (!title || !excerpt || !content) {
    return NextResponse.json({ error: 'title, excerpt, and content are required' }, { status: 400 })
  }

  const slug = slugify(requestedSlug || title)
  if (!slug) {
    return NextResponse.json({ error: 'Could not derive a valid slug from the title' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin.from('blog_posts').select('id').eq('slug', slug).maybeSingle()
  if (existing) {
    return NextResponse.json({ error: `A post already exists with the slug "${slug}" -- choose a different title or slug` }, { status: 400 })
  }

  const isPublished = status === 'published'
  const { data: post, error: insertError } = await supabaseAdmin
    .from('blog_posts')
    .insert({
      slug,
      title,
      excerpt,
      content,
      cover_image_url: cover_image_url || null,
      status: isPublished ? 'published' : 'draft',
      published_at: isPublished ? new Date().toISOString() : null,
      updated_by: admin!.id,
    })
    .select()
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  return NextResponse.json({ post })
}

export async function PATCH(request: Request) {
  const { error, admin } = await requireBlogAccess()
  if (error) return error

  const { id, title, excerpt, content, cover_image_url, status, slug: requestedSlug } = await request.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: existingPost } = await supabaseAdmin.from('blog_posts').select('*').eq('id', id).single()
  if (!existingPost) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: admin!.id }
  if (title !== undefined) updates.title = title
  if (excerpt !== undefined) updates.excerpt = excerpt
  if (content !== undefined) updates.content = content
  if (cover_image_url !== undefined) updates.cover_image_url = cover_image_url || null

  if (requestedSlug !== undefined) {
    const slug = slugify(requestedSlug)
    if (!slug) return NextResponse.json({ error: 'Could not derive a valid slug' }, { status: 400 })
    if (slug !== existingPost.slug) {
      const { data: collision } = await supabaseAdmin.from('blog_posts').select('id').eq('slug', slug).maybeSingle()
      if (collision) {
        return NextResponse.json({ error: `A post already exists with the slug "${slug}"` }, { status: 400 })
      }
      updates.slug = slug
    }
  }

  if (status !== undefined && ['draft', 'published'].includes(status)) {
    updates.status = status
    // Only stamp published_at the first time a post goes live -- editing
    // an already-published post again must not reset its publish date.
    if (status === 'published' && !existingPost.published_at) {
      updates.published_at = new Date().toISOString()
    }
  }

  const { data: post, error: updateError } = await supabaseAdmin
    .from('blog_posts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ post })
}

export async function DELETE(request: Request) {
  const { error } = await requireBlogAccess()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error: deleteError } = await supabaseAdmin.from('blog_posts').delete().eq('id', id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
