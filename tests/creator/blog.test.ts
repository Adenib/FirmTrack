import { afterAll, describe, it, expect } from 'vitest'
import { supabaseAdmin, createTestPlatformAdmin, destroyTestPlatformAdmin, type TestPlatformAdmin } from '../helpers/test-client'

const APP_URL = 'http://localhost:3000'

describe('Blog (Creator Console + public pages)', () => {
  let admin: TestPlatformAdmin
  const createdPostIds: string[] = []
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  afterAll(async () => {
    for (const id of createdPostIds) {
      await supabaseAdmin.from('blog_posts').delete().eq('id', id)
    }
    if (admin) await destroyTestPlatformAdmin(admin)
  })

  it('rejects unauthenticated requests to every method', async () => {
    const getRes = await fetch(`${APP_URL}/api/creator/blog`)
    expect(getRes.status).toBe(401)

    const postRes = await fetch(`${APP_URL}/api/creator/blog`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x', excerpt: 'x', content: 'x' }),
    })
    expect(postRes.status).toBe(401)
  })

  it('creates a draft post, excludes it from public reads, then publishes it', async () => {
    admin = await createTestPlatformAdmin('admin')
    const title = `Test Post ${uniqueId}`

    const createRes = await admin.fetch('/api/creator/blog', {
      method: 'POST',
      body: JSON.stringify({
        title,
        excerpt: 'A test excerpt.',
        content: '# Heading\n\nSome **content**.',
      }),
    })
    expect(createRes.status).toBe(200)
    const createBody = await createRes.json()
    createdPostIds.push(createBody.post.id)
    expect(createBody.post.status).toBe('draft')
    expect(createBody.post.published_at).toBeNull()
    expect(createBody.post.slug).toBe(`test-post-${uniqueId}`)
    expect(createBody.post.author_name).toBe('FirmTrack Team')

    // Draft is invisible to the public list and post pages.
    const listRes = await fetch(`${APP_URL}/blog`)
    const listHtml = await listRes.text()
    expect(listHtml).not.toContain(title)

    const draftPostRes = await fetch(`${APP_URL}/blog/${createBody.post.slug}`)
    expect(draftPostRes.status).toBe(404)

    // Publish it.
    const patchRes = await admin.fetch('/api/creator/blog', {
      method: 'PATCH',
      body: JSON.stringify({ id: createBody.post.id, status: 'published' }),
    })
    expect(patchRes.status).toBe(200)
    const patchBody = await patchRes.json()
    expect(patchBody.post.status).toBe('published')
    expect(patchBody.post.published_at).toBeTruthy()
    const firstPublishedAt = patchBody.post.published_at

    // Now visible publicly.
    const publishedListRes = await fetch(`${APP_URL}/blog`)
    const publishedListHtml = await publishedListRes.text()
    expect(publishedListHtml).toContain(title)

    const publishedPostRes = await fetch(`${APP_URL}/blog/${createBody.post.slug}`)
    expect(publishedPostRes.status).toBe(200)
    const publishedPostHtml = await publishedPostRes.text()
    expect(publishedPostHtml).toContain(title)
    expect(publishedPostHtml).toContain('FirmTrack Team')
    expect(publishedPostHtml).not.toContain(admin.email)

    // Re-saving an already-published post must not reset published_at.
    const secondPatchRes = await admin.fetch('/api/creator/blog', {
      method: 'PATCH',
      body: JSON.stringify({ id: createBody.post.id, status: 'published', excerpt: 'Updated excerpt.' }),
    })
    const secondPatchBody = await secondPatchRes.json()
    expect(secondPatchBody.post.published_at).toBe(firstPublishedAt)
  })

  it('rejects a slug collision with a clear 400', async () => {
    if (!admin) admin = await createTestPlatformAdmin('admin')
    const title = `Collision Post ${uniqueId}`

    const firstRes = await admin.fetch('/api/creator/blog', {
      method: 'POST',
      body: JSON.stringify({ title, excerpt: 'x', content: 'x' }),
    })
    const firstBody = await firstRes.json()
    createdPostIds.push(firstBody.post.id)

    const secondRes = await admin.fetch('/api/creator/blog', {
      method: 'POST',
      body: JSON.stringify({ title, excerpt: 'x', content: 'x' }),
    })
    expect(secondRes.status).toBe(400)
    const secondBody = await secondRes.json()
    expect(secondBody.error).toMatch(/already exists/i)
  })

  it('deletes a post', async () => {
    if (!admin) admin = await createTestPlatformAdmin('admin')
    const createRes = await admin.fetch('/api/creator/blog', {
      method: 'POST',
      body: JSON.stringify({ title: `Delete Me ${uniqueId}`, excerpt: 'x', content: 'x' }),
    })
    const createBody = await createRes.json()

    const deleteRes = await admin.fetch(`/api/creator/blog?id=${createBody.post.id}`, { method: 'DELETE' })
    expect(deleteRes.status).toBe(200)

    const { data: row } = await supabaseAdmin.from('blog_posts').select('id').eq('id', createBody.post.id).maybeSingle()
    expect(row).toBeNull()
  })
})
