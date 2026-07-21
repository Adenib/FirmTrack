'use client'

import { useEffect, useState, useCallback } from 'react'
import MatterSearchInput, { type MatterResult } from '@/components/timetrack/matter-search-input'

type DocumentRow = {
  id: string
  title: string
  category: string | null
  matter_id: string | null
  created_by: string
  created_at: string
  matters: { id: string; matter_id: string; case_name: string } | null
  latest_version: { version_number: number; filename: string; size_bytes: number; uploaded_by: string; created_at: string } | null
  versions?: { id: string; version_number: number; filename: string; size_bytes: number; created_at: string }[]
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocTrackPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [matterQuery, setMatterQuery] = useState('')
  const [selectedMatter, setSelectedMatter] = useState<MatterResult | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Upload form
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadCategory, setUploadCategory] = useState('')
  const [uploadMatterQuery, setUploadMatterQuery] = useState('')
  const [uploadMatter, setUploadMatter] = useState<MatterResult | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (selectedMatter) params.set('matter_id', selectedMatter.id)
    const res = await fetch(`/api/doctrack/documents?${params.toString()}`)
    const result = await res.json()
    if (!res.ok) setError(result.error || 'Could not load documents')
    else setDocuments(result.documents || [])
    setLoading(false)
  }, [q, selectedMatter])

  useEffect(() => {
    load()
  }, [load])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile) return
    setUploading(true)
    setError('')

    const formData = new FormData()
    formData.append('title', uploadTitle)
    formData.append('file', uploadFile)
    if (uploadCategory) formData.append('category', uploadCategory)
    if (uploadMatter) formData.append('matter_id', uploadMatter.id)

    const res = await fetch('/api/doctrack/documents', { method: 'POST', body: formData })
    const result = await res.json()
    if (!res.ok) {
      setError(result.error || 'Could not upload document')
      setUploading(false)
      return
    }

    setUploadTitle('')
    setUploadCategory('')
    setUploadMatterQuery('')
    setUploadMatter(null)
    setUploadFile(null)
    setUploading(false)
    await load()
  }

  const handleDownload = async (documentId: string) => {
    const res = await fetch(`/api/doctrack/documents/download?document_id=${documentId}`)
    const result = await res.json()
    if (res.ok) window.open(result.url, '_blank')
    else setError(result.error || 'Could not download document')
  }

  const handleDelete = async (documentId: string) => {
    const res = await fetch('/api/doctrack/documents/detail', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: documentId }),
    })
    const result = await res.json()
    if (!res.ok) setError(result.error || 'Could not delete document')
    else await load()
  }

  const refreshVersions = async (documentId: string) => {
    const res = await fetch(`/api/doctrack/documents/detail?id=${documentId}`)
    const result = await res.json()
    if (res.ok) {
      setDocuments((prev) => prev.map((d) => (d.id === documentId ? { ...d, versions: result.document.versions } : d)))
    }
  }

  const handleNewVersion = async (documentId: string, file: File) => {
    setError('')
    const formData = new FormData()
    formData.append('document_id', documentId)
    formData.append('file', file)
    const res = await fetch('/api/doctrack/documents/versions', { method: 'POST', body: formData })
    const result = await res.json()
    if (!res.ok) {
      setError(result.error || 'Could not upload new version')
      return
    }
    await load()
    if (expandedId === documentId) await refreshVersions(documentId)
  }

  const toggleExpand = async (documentId: string) => {
    if (expandedId === documentId) {
      setExpandedId(null)
      return
    }
    await refreshVersions(documentId)
    setExpandedId(documentId)
  }

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">DocTrack</h1>
      <p className="text-gray-600 mb-6">Matter-linked document storage, with version history and an audit trail.</p>

      <form onSubmit={handleUpload} className="bg-white border border-gray-200 rounded-lg p-4 mb-6 space-y-3">
        <p className="text-sm font-medium text-gray-900">Upload a document</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            required
            placeholder="Title"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          />
          <input
            type="text"
            placeholder="Category (optional)"
            value={uploadCategory}
            onChange={(e) => setUploadCategory(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          />
        </div>
        <div>
          <MatterSearchInput
            value={uploadMatter ? `${uploadMatter.matter_id} · ${uploadMatter.case_name}` : uploadMatterQuery}
            onChange={(v) => {
              setUploadMatterQuery(v)
              setUploadMatter(null)
            }}
            onSelect={setUploadMatter}
            placeholder="Link to a matter (optional -- leave blank for a firm-wide document)"
          />
        </div>
        <input
          type="file"
          required
          onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
          className="text-sm"
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={uploading}
          className="bg-brand-blue text-white px-4 py-2 rounded-md text-sm hover:bg-brand-blue-hover disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </form>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by title..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="px-3 py-2 border rounded-md text-sm w-64"
        />
        <div className="w-72">
          <MatterSearchInput
            value={selectedMatter ? `${selectedMatter.matter_id} · ${selectedMatter.case_name}` : matterQuery}
            onChange={(v) => {
              setMatterQuery(v)
              setSelectedMatter(null)
            }}
            onSelect={setSelectedMatter}
            placeholder="Filter by matter..."
          />
        </div>
        {selectedMatter && (
          <button
            type="button"
            onClick={() => {
              setSelectedMatter(null)
              setMatterQuery('')
            }}
            className="text-sm text-gray-500 hover:underline"
          >
            Clear matter filter
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : documents.length === 0 ? (
        <p className="text-gray-500 text-sm">No documents found.</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">{doc.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {doc.matters ? `${doc.matters.matter_id} · ${doc.matters.case_name}` : 'Firm-wide'}
                    {doc.category ? ` · ${doc.category}` : ''}
                  </p>
                  {doc.latest_version && (
                    <p className="text-xs text-gray-400 mt-1">
                      v{doc.latest_version.version_number} · {doc.latest_version.filename} ·{' '}
                      {formatSize(doc.latest_version.size_bytes)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button type="button" onClick={() => handleDownload(doc.id)} className="text-sm text-brand-blue hover:underline">
                    Download
                  </button>
                  <button type="button" onClick={() => toggleExpand(doc.id)} className="text-sm text-gray-600 hover:underline">
                    {expandedId === doc.id ? 'Hide versions' : 'Versions'}
                  </button>
                  <button type="button" onClick={() => handleDelete(doc.id)} className="text-sm text-red-600 hover:underline">
                    Delete
                  </button>
                </div>
              </div>

              {expandedId === doc.id && doc.versions && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                  {doc.versions.map((v) => (
                    <div key={v.id} className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        v{v.version_number} · {v.filename} · {formatSize(v.size_bytes)}
                      </span>
                      <span>{new Date(v.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                  <label className="inline-block text-xs text-brand-blue hover:underline cursor-pointer mt-2">
                    Upload new version
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleNewVersion(doc.id, file)
                        e.target.value = ''
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
