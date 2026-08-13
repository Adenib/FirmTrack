// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import MarkdownContent from '@/components/blog/markdown-content'

const slugify = (text) =>
  text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')

const emptyForm = { title: '', slug: '', excerpt: '', content: '', cover_image_url: '', status: 'draft' }

export default function BlogClient() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [slugTouched, setSlugTouched] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/creator/blog')
    const result = await res.json()
    if (res.ok) setPosts(result.posts || [])
    else setError(result.error || 'Could not load posts')
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm)
    setSlugTouched(false)
    setFormError('')
  }

  const handleEdit = (post) => {
    setEditingId(post.id)
    setForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      cover_image_url: post.cover_image_url || '',
      status: post.status,
    })
    setSlugTouched(true)
    setMessage('')
    setFormError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (post) => {
    if (!confirm(`Delete "${post.title}"? This can't be undone.`)) return
    const res = await fetch(`/api/creator/blog?id=${post.id}`, { method: 'DELETE' })
    const result = await res.json()
    if (!res.ok) setError(result.error || 'Could not delete post')
    else {
      if (editingId === post.id) resetForm()
      await load()
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setFormError('')
    setMessage('')

    const body = editingId
      ? { id: editingId, ...form }
      : { ...form }

    const res = await fetch('/api/creator/blog', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await res.json()
    setSubmitting(false)
    if (!res.ok) {
      setFormError(result.error || 'Could not save post')
      return
    }
    setMessage(editingId ? 'Post updated.' : 'Post created.')
    resetForm()
    await load()
  }

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Blog</h1>
      <p className="text-gray-600 mb-6">
        Public posts at firmtracks.com/blog. Posts are attributed to &quot;FirmTrack Team&quot; &mdash;
        nothing here identifies which staff member wrote a post on the public page.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <p className="font-medium text-gray-900 mb-3">{editingId ? 'Edit post' : 'New post'}</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Title</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => {
                  const title = e.target.value
                  setForm((prev) => ({ ...prev, title, slug: slugTouched ? prev.slug : slugify(title) }))
                }}
                className="w-full px-2 py-1.5 border rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Slug</label>
              <input
                type="text"
                required
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true)
                  setForm((prev) => ({ ...prev, slug: e.target.value }))
                }}
                className="w-full px-2 py-1.5 border rounded text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">firmtracks.com/blog/{form.slug || '...'}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Excerpt (used for the post list preview and search/social previews)</label>
            <textarea
              required
              rows={2}
              value={form.excerpt}
              onChange={(e) => setForm((prev) => ({ ...prev, excerpt: e.target.value }))}
              className="w-full px-2 py-1.5 border rounded text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Cover image URL (optional)</label>
            <input
              type="url"
              value={form.cover_image_url}
              onChange={(e) => setForm((prev) => ({ ...prev, cover_image_url: e.target.value }))}
              placeholder="https://..."
              className="w-full px-2 py-1.5 border rounded text-sm"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Content (Markdown)</label>
              <textarea
                required
                rows={16}
                value={form.content}
                onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                className="w-full px-2 py-1.5 border rounded text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Preview</label>
              <div className="border rounded p-3 h-[calc(100%-22px)] overflow-y-auto bg-gray-50">
                {form.content ? <MarkdownContent content={form.content} /> : <p className="text-sm text-gray-400">Nothing to preview yet.</p>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.status === 'published'}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.checked ? 'published' : 'draft' }))}
              />
              Published
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Saving...' : editingId ? 'Save changes' : 'Create post'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="text-sm text-gray-500 hover:underline">
                Cancel edit
              </button>
            )}
            {message && <p className="text-sm text-green-600">{message}</p>}
          </div>
          {formError && <p className="text-red-600 text-xs">{formError}</p>}
        </form>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : posts.length === 0 ? (
        <p className="text-gray-500 text-sm">No posts yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Title</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Published</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {posts.map((post) => (
                <tr key={post.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">
                    {post.title}
                    <span className="block text-xs text-gray-400">/blog/{post.slug}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded capitalize font-medium ${post.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {post.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {post.published_at ? new Date(post.published_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => handleEdit(post)} className="text-xs text-blue-600 hover:underline">
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDelete(post)} className="text-xs text-red-600 hover:underline">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
