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
  external_source: string | null
  external_web_url: string | null
  external_filename: string | null
  external_size_bytes: number | null
}

type OneDriveItem = { id: string; name: string; isFolder: boolean; size: number }
type OutlookMessage = {
  id: string
  subject: string
  from: string | null
  receivedDateTime: string
  hasAttachments: boolean
  webLink: string
}
type OutlookAttachment = { id: string; name: string; contentType: string; size: number }
type SharePointSite = { id: string; name: string; webUrl: string }

const EXTERNAL_SOURCE_LABELS: Record<string, string> = { onedrive: 'OneDrive', outlook: 'Outlook', sharepoint: 'SharePoint' }

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

  // Microsoft 365 (OneDrive) link panel
  const [showMsPanel, setShowMsPanel] = useState(false)
  const [msFolderStack, setMsFolderStack] = useState<{ id: string | undefined; name: string }[]>([
    { id: undefined, name: 'OneDrive' },
  ])
  const [msItems, setMsItems] = useState<OneDriveItem[]>([])
  const [msLoading, setMsLoading] = useState(false)
  const [msError, setMsError] = useState('')
  const [msSelectedFile, setMsSelectedFile] = useState<OneDriveItem | null>(null)
  const [msTitle, setMsTitle] = useState('')
  const [msMatterQuery, setMsMatterQuery] = useState('')
  const [msMatter, setMsMatter] = useState<MatterResult | null>(null)
  const [msLinking, setMsLinking] = useState(false)

  // Outlook link panel
  const [showOutlookPanel, setShowOutlookPanel] = useState(false)
  const [outlookSearch, setOutlookSearch] = useState('')
  const [outlookMessages, setOutlookMessages] = useState<OutlookMessage[]>([])
  const [outlookLoading, setOutlookLoading] = useState(false)
  const [outlookError, setOutlookError] = useState('')
  const [selectedMessage, setSelectedMessage] = useState<OutlookMessage | null>(null)
  const [messageAttachments, setMessageAttachments] = useState<OutlookAttachment[]>([])
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<Set<string>>(new Set())
  const [saveEmailCopy, setSaveEmailCopy] = useState(false)
  const [outlookTitle, setOutlookTitle] = useState('')
  const [outlookMatterQuery, setOutlookMatterQuery] = useState('')
  const [outlookMatter, setOutlookMatter] = useState<MatterResult | null>(null)
  const [outlookLinking, setOutlookLinking] = useState(false)

  // SharePoint link panel
  const [showSpPanel, setShowSpPanel] = useState(false)
  const [spSiteSearch, setSpSiteSearch] = useState('')
  const [spSites, setSpSites] = useState<SharePointSite[]>([])
  const [spSiteLoading, setSpSiteLoading] = useState(false)
  const [spSelectedSite, setSpSelectedSite] = useState<SharePointSite | null>(null)
  const [spFolderStack, setSpFolderStack] = useState<{ id: string | undefined; name: string }[]>([])
  const [spItems, setSpItems] = useState<OneDriveItem[]>([])
  const [spLoading, setSpLoading] = useState(false)
  const [spError, setSpError] = useState('')
  const [spSelectedFile, setSpSelectedFile] = useState<OneDriveItem | null>(null)
  const [spTitle, setSpTitle] = useState('')
  const [spMatterQuery, setSpMatterQuery] = useState('')
  const [spMatter, setSpMatter] = useState<MatterResult | null>(null)
  const [spLinking, setSpLinking] = useState(false)

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

  const browseMs = async (folderId: string | undefined) => {
    setMsLoading(true)
    setMsError('')
    const params = folderId ? `?folder_id=${folderId}` : ''
    const res = await fetch(`/api/doctrack/microsoft/browse${params}`)
    const result = await res.json()
    if (!res.ok) setMsError(result.error || 'Could not browse OneDrive')
    else setMsItems(result.items || [])
    setMsLoading(false)
  }

  const openMsPanel = () => {
    setShowMsPanel(true)
    setMsFolderStack([{ id: undefined, name: 'OneDrive' }])
    setMsSelectedFile(null)
    browseMs(undefined)
  }

  const openMsFolder = (item: OneDriveItem) => {
    setMsFolderStack((prev) => [...prev, { id: item.id, name: item.name }])
    browseMs(item.id)
  }

  const backMsFolder = () => {
    const next = msFolderStack.slice(0, -1)
    setMsFolderStack(next)
    browseMs(next[next.length - 1]?.id)
  }

  const selectMsFile = (item: OneDriveItem) => {
    setMsSelectedFile(item)
    setMsTitle(item.name)
  }

  const handleLinkMsFile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!msSelectedFile) return
    setMsLinking(true)
    setMsError('')

    const res = await fetch('/api/doctrack/microsoft/link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        file_id: msSelectedFile.id,
        title: msTitle,
        matter_id: msMatter?.id,
      }),
    })
    const result = await res.json()
    if (!res.ok) {
      setMsError(result.error || 'Could not link file')
      setMsLinking(false)
      return
    }

    setShowMsPanel(false)
    setMsSelectedFile(null)
    setMsTitle('')
    setMsMatter(null)
    setMsMatterQuery('')
    setMsLinking(false)
    await load()
  }

  const searchOutlook = useCallback(async (search: string) => {
    setOutlookLoading(true)
    setOutlookError('')
    const params = search ? `?q=${encodeURIComponent(search)}` : ''
    const res = await fetch(`/api/doctrack/microsoft/messages${params}`)
    const result = await res.json()
    if (!res.ok) setOutlookError(result.error || 'Could not browse Outlook')
    else setOutlookMessages(result.messages || [])
    setOutlookLoading(false)
  }, [])

  const openOutlookPanel = () => {
    setShowOutlookPanel(true)
    setSelectedMessage(null)
    setOutlookSearch('')
    searchOutlook('')
  }

  const selectMessage = async (message: OutlookMessage) => {
    setSelectedMessage(message)
    setOutlookTitle(message.subject)
    setSelectedAttachmentIds(new Set())
    setSaveEmailCopy(false)
    setMessageAttachments([])
    if (!message.hasAttachments) return
    const res = await fetch(`/api/doctrack/microsoft/messages/attachments?message_id=${message.id}`)
    const result = await res.json()
    if (res.ok) setMessageAttachments(result.attachments || [])
  }

  const toggleAttachment = (id: string) => {
    setSelectedAttachmentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleLinkEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedMessage) return
    setOutlookLinking(true)
    setOutlookError('')

    const res = await fetch('/api/doctrack/microsoft/link-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message_id: selectedMessage.id,
        title: outlookTitle,
        matter_id: outlookMatter?.id,
        attachment_ids: Array.from(selectedAttachmentIds),
        save_copy: saveEmailCopy,
      }),
    })
    const result = await res.json()
    if (!res.ok) {
      setOutlookError(result.error || 'Could not link email')
      setOutlookLinking(false)
      return
    }

    setShowOutlookPanel(false)
    setSelectedMessage(null)
    setOutlookTitle('')
    setOutlookMatter(null)
    setOutlookMatterQuery('')
    setSelectedAttachmentIds(new Set())
    setSaveEmailCopy(false)
    setOutlookLinking(false)
    await load()
  }

  const searchSpSites = useCallback(async (search: string) => {
    setSpSiteLoading(true)
    setSpError('')
    const params = search ? `?q=${encodeURIComponent(search)}` : ''
    const res = await fetch(`/api/doctrack/microsoft/sharepoint/sites${params}`)
    const result = await res.json()
    if (!res.ok) setSpError(result.error || 'Could not browse SharePoint sites')
    else setSpSites(result.sites || [])
    setSpSiteLoading(false)
  }, [])

  const openSpPanel = () => {
    setShowSpPanel(true)
    setSpSelectedSite(null)
    setSpSelectedFile(null)
    setSpSiteSearch('')
    searchSpSites('')
  }

  const browseSp = async (siteId: string, folderId: string | undefined) => {
    setSpLoading(true)
    setSpError('')
    const params = new URLSearchParams({ site_id: siteId })
    if (folderId) params.set('folder_id', folderId)
    const res = await fetch(`/api/doctrack/microsoft/sharepoint/browse?${params.toString()}`)
    const result = await res.json()
    if (!res.ok) setSpError(result.error || 'Could not browse SharePoint')
    else setSpItems(result.items || [])
    setSpLoading(false)
  }

  const selectSpSite = (site: SharePointSite) => {
    setSpSelectedSite(site)
    setSpFolderStack([{ id: undefined, name: site.name }])
    browseSp(site.id, undefined)
  }

  const openSpFolder = (item: OneDriveItem) => {
    if (!spSelectedSite) return
    setSpFolderStack((prev) => [...prev, { id: item.id, name: item.name }])
    browseSp(spSelectedSite.id, item.id)
  }

  const backSpFolder = () => {
    if (!spSelectedSite) return
    if (spFolderStack.length <= 1) {
      setSpSelectedSite(null)
      return
    }
    const next = spFolderStack.slice(0, -1)
    setSpFolderStack(next)
    browseSp(spSelectedSite.id, next[next.length - 1]?.id)
  }

  const selectSpFile = (item: OneDriveItem) => {
    setSpSelectedFile(item)
    setSpTitle(item.name)
  }

  const handleLinkSpFile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!spSelectedSite || !spSelectedFile) return
    setSpLinking(true)
    setSpError('')

    const res = await fetch('/api/doctrack/microsoft/sharepoint/link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        site_id: spSelectedSite.id,
        item_id: spSelectedFile.id,
        title: spTitle,
        matter_id: spMatter?.id,
      }),
    })
    const result = await res.json()
    if (!res.ok) {
      setSpError(result.error || 'Could not link file')
      setSpLinking(false)
      return
    }

    setShowSpPanel(false)
    setSpSelectedSite(null)
    setSpSelectedFile(null)
    setSpTitle('')
    setSpMatter(null)
    setSpMatterQuery('')
    setSpLinking(false)
    await load()
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
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={uploading}
            className="bg-brand-blue text-white px-4 py-2 rounded-md text-sm hover:bg-brand-blue-hover disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
          <button
            type="button"
            onClick={openMsPanel}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50"
          >
            Link from OneDrive
          </button>
          <button
            type="button"
            onClick={openOutlookPanel}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50"
          >
            Link from Outlook
          </button>
          <button
            type="button"
            onClick={openSpPanel}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50"
          >
            Link from SharePoint
          </button>
        </div>
      </form>

      {showMsPanel && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">Link a file from OneDrive</p>
            <button type="button" onClick={() => setShowMsPanel(false)} className="text-sm text-gray-500 hover:underline">
              Close
            </button>
          </div>

          {msError ? (
            <p className="text-red-600 text-sm">{msError}</p>
          ) : !msSelectedFile ? (
            <>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                {msFolderStack.length > 1 && (
                  <button type="button" onClick={backMsFolder} className="text-brand-blue hover:underline">
                    ← Back
                  </button>
                )}
                <span>{msFolderStack[msFolderStack.length - 1].name}</span>
              </div>

              {msLoading ? (
                <p className="text-gray-500 text-sm">Loading...</p>
              ) : (
                <div className="border border-gray-100 rounded divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {msItems.length === 0 && <p className="text-sm text-gray-400 p-3">Empty folder.</p>}
                  {msItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => (item.isFolder ? openMsFolder(item) : selectMsFile(item))}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                    >
                      <span>{item.isFolder ? '📁 ' : '📄 '}{item.name}</span>
                      {!item.isFolder && <span className="text-xs text-gray-400">{formatSize(item.size)}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <form onSubmit={handleLinkMsFile} className="space-y-3">
              <p className="text-sm text-gray-600">Linking: {msSelectedFile.name}</p>
              <input
                type="text"
                required
                placeholder="Title"
                value={msTitle}
                onChange={(e) => setMsTitle(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
              <MatterSearchInput
                value={msMatter ? `${msMatter.matter_id} · ${msMatter.case_name}` : msMatterQuery}
                onChange={(v) => {
                  setMsMatterQuery(v)
                  setMsMatter(null)
                }}
                onSelect={setMsMatter}
                placeholder="Link to a matter (optional -- leave blank for a firm-wide document)"
              />
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={msLinking}
                  className="bg-brand-blue text-white px-4 py-2 rounded-md text-sm hover:bg-brand-blue-hover disabled:opacity-50"
                >
                  {msLinking ? 'Linking...' : 'Link file'}
                </button>
                <button type="button" onClick={() => setMsSelectedFile(null)} className="text-sm text-gray-500 hover:underline">
                  Choose a different file
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {showOutlookPanel && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">Link an email from Outlook</p>
            <button type="button" onClick={() => setShowOutlookPanel(false)} className="text-sm text-gray-500 hover:underline">
              Close
            </button>
          </div>

          {outlookError ? (
            <p className="text-red-600 text-sm">{outlookError}</p>
          ) : !selectedMessage ? (
            <>
              <input
                type="text"
                placeholder="Search subject/sender..."
                value={outlookSearch}
                onChange={(e) => setOutlookSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    searchOutlook(outlookSearch)
                  }
                }}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
              {outlookLoading ? (
                <p className="text-gray-500 text-sm">Loading...</p>
              ) : (
                <div className="border border-gray-100 rounded divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {outlookMessages.length === 0 && <p className="text-sm text-gray-400 p-3">No messages found.</p>}
                  {outlookMessages.map((message) => (
                    <button
                      key={message.id}
                      type="button"
                      onClick={() => selectMessage(message)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between gap-3"
                    >
                      <span className="truncate">
                        {message.hasAttachments ? '📎 ' : ''}
                        {message.subject}
                        <span className="text-xs text-gray-400"> · {message.from}</span>
                      </span>
                      <span className="text-xs text-gray-400 shrink-0">
                        {new Date(message.receivedDateTime).toLocaleDateString()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <form onSubmit={handleLinkEmail} className="space-y-3">
              <p className="text-sm text-gray-600">Linking: {selectedMessage.subject}</p>
              <input
                type="text"
                required
                placeholder="Title"
                value={outlookTitle}
                onChange={(e) => setOutlookTitle(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
              <MatterSearchInput
                value={outlookMatter ? `${outlookMatter.matter_id} · ${outlookMatter.case_name}` : outlookMatterQuery}
                onChange={(v) => {
                  setOutlookMatterQuery(v)
                  setOutlookMatter(null)
                }}
                onSelect={setOutlookMatter}
                placeholder="Link to a matter (optional -- leave blank for a firm-wide document)"
              />
              {messageAttachments.length > 0 && (
                <div className="border border-gray-100 rounded p-2 space-y-1">
                  <p className="text-xs font-medium text-gray-700">Also import as stored documents:</p>
                  {messageAttachments.map((att) => (
                    <label key={att.id} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedAttachmentIds.has(att.id)}
                        onChange={() => toggleAttachment(att.id)}
                      />
                      {att.name} <span className="text-xs text-gray-400">({formatSize(att.size)})</span>
                    </label>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={saveEmailCopy} onChange={(e) => setSaveEmailCopy(e.target.checked)} />
                Also save a permanent copy of this email
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={outlookLinking}
                  className="bg-brand-blue text-white px-4 py-2 rounded-md text-sm hover:bg-brand-blue-hover disabled:opacity-50"
                >
                  {outlookLinking ? 'Linking...' : 'Link email'}
                </button>
                <button type="button" onClick={() => setSelectedMessage(null)} className="text-sm text-gray-500 hover:underline">
                  Choose a different email
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {showSpPanel && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">Link a file from SharePoint</p>
            <button type="button" onClick={() => setShowSpPanel(false)} className="text-sm text-gray-500 hover:underline">
              Close
            </button>
          </div>

          {spError ? (
            <p className="text-red-600 text-sm">{spError}</p>
          ) : !spSelectedSite ? (
            <>
              <input
                type="text"
                placeholder="Search sites..."
                value={spSiteSearch}
                onChange={(e) => setSpSiteSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    searchSpSites(spSiteSearch)
                  }
                }}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
              {spSiteLoading ? (
                <p className="text-gray-500 text-sm">Loading...</p>
              ) : (
                <div className="border border-gray-100 rounded divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {spSites.length === 0 && <p className="text-sm text-gray-400 p-3">No sites found.</p>}
                  {spSites.map((site) => (
                    <button
                      key={site.id}
                      type="button"
                      onClick={() => selectSpSite(site)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      {site.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : !spSelectedFile ? (
            <>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <button type="button" onClick={backSpFolder} className="text-brand-blue hover:underline">
                  ← Back
                </button>
                <span>{spFolderStack[spFolderStack.length - 1]?.name}</span>
              </div>

              {spLoading ? (
                <p className="text-gray-500 text-sm">Loading...</p>
              ) : (
                <div className="border border-gray-100 rounded divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {spItems.length === 0 && <p className="text-sm text-gray-400 p-3">Empty folder.</p>}
                  {spItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => (item.isFolder ? openSpFolder(item) : selectSpFile(item))}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                    >
                      <span>{item.isFolder ? '📁 ' : '📄 '}{item.name}</span>
                      {!item.isFolder && <span className="text-xs text-gray-400">{formatSize(item.size)}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <form onSubmit={handleLinkSpFile} className="space-y-3">
              <p className="text-sm text-gray-600">Linking: {spSelectedFile.name}</p>
              <input
                type="text"
                required
                placeholder="Title"
                value={spTitle}
                onChange={(e) => setSpTitle(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
              <MatterSearchInput
                value={spMatter ? `${spMatter.matter_id} · ${spMatter.case_name}` : spMatterQuery}
                onChange={(v) => {
                  setSpMatterQuery(v)
                  setSpMatter(null)
                }}
                onSelect={setSpMatter}
                placeholder="Link to a matter (optional -- leave blank for a firm-wide document)"
              />
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={spLinking}
                  className="bg-brand-blue text-white px-4 py-2 rounded-md text-sm hover:bg-brand-blue-hover disabled:opacity-50"
                >
                  {spLinking ? 'Linking...' : 'Link file'}
                </button>
                <button type="button" onClick={() => setSpSelectedFile(null)} className="text-sm text-gray-500 hover:underline">
                  Choose a different file
                </button>
              </div>
            </form>
          )}
        </div>
      )}

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
                  {doc.external_source ? (
                    <p className="text-xs text-gray-400 mt-1">
                      <span className="inline-block bg-blue-50 text-brand-blue px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide mr-1">
                        {EXTERNAL_SOURCE_LABELS[doc.external_source] || doc.external_source}
                      </span>
                      {doc.external_filename}
                      {doc.external_size_bytes ? ` · ${formatSize(doc.external_size_bytes)}` : ''}
                    </p>
                  ) : (
                    doc.latest_version && (
                      <p className="text-xs text-gray-400 mt-1">
                        v{doc.latest_version.version_number} · {doc.latest_version.filename} ·{' '}
                        {formatSize(doc.latest_version.size_bytes)}
                      </p>
                    )
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {doc.external_source ? (
                    <button type="button" onClick={() => handleDownload(doc.id)} className="text-sm text-brand-blue hover:underline">
                      View in {EXTERNAL_SOURCE_LABELS[doc.external_source] || doc.external_source}
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={() => handleDownload(doc.id)} className="text-sm text-brand-blue hover:underline">
                        Download
                      </button>
                      <button type="button" onClick={() => toggleExpand(doc.id)} className="text-sm text-gray-600 hover:underline">
                        {expandedId === doc.id ? 'Hide versions' : 'Versions'}
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => handleDelete(doc.id)} className="text-sm text-red-600 hover:underline">
                    Delete
                  </button>
                </div>
              </div>

              {!doc.external_source && expandedId === doc.id && doc.versions && (
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
