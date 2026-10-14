// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const FIELD_LABELS = {
  asset_tag: 'Asset tag (required)',
  serial_number: 'Serial number',
  make: 'Make',
  model: 'Model',
  assignee: 'Assignee (name or email)',
  purchase_date: 'Purchase date',
  warranty_end_date: 'Warranty end date',
  replacement_cost: 'Replacement cost',
  status: 'Status note',
  condition: 'Condition note',
}

export default function AssetTrackSettingsPage() {
  const [role, setRole] = useState('')
  const [settings, setSettings] = useState(null)
  const [sites, setSites] = useState([])
  const [lists, setLists] = useState([])
  const [columns, setColumns] = useState([])
  const [siteId, setSiteId] = useState('')
  const [siteName, setSiteName] = useState('')
  const [listId, setListId] = useState('')
  const [listName, setListName] = useState('')
  const [mapping, setMapping] = useState({})
  const [slaDays, setSlaDays] = useState(14)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pasteUrl, setPasteUrl] = useState('')
  const [resolving, setResolving] = useState(false)

  const isAllowed = ['owner', 'admin'].includes(role)

  useEffect(() => {
    const init = async () => {
      const layoutRes = await fetch('/api/layout-data').then((r) => r.json())
      setRole(layoutRes.profile?.role || '')

      const settingsRes = await fetch('/api/assettrack/sync/settings')
      const settingsBody = await settingsRes.json()
      if (settingsRes.ok && settingsBody.settings) {
        setSettings(settingsBody.settings)
        setSiteId(settingsBody.settings.sharepoint_site_id || '')
        setSiteName(settingsBody.settings.sharepoint_site_name || '')
        setListId(settingsBody.settings.sharepoint_list_id || '')
        setListName(settingsBody.settings.sharepoint_list_name || '')
        setMapping(settingsBody.settings.field_mapping || {})
        setSlaDays(settingsBody.settings.sla_days || 14)
      }

      const sitesRes = await fetch('/api/assettrack/sync/sites')
      const sitesBody = await sitesRes.json()
      if (sitesRes.ok) setSites(sitesBody.sites || [])
      else setError(sitesBody.error || '')

      setLoading(false)
    }
    init()
  }, [])

  const pickSite = async (id, name) => {
    setSiteId(id)
    setSiteName(name)
    setListId('')
    setListName('')
    setColumns([])
    const res = await fetch(`/api/assettrack/sync/lists?site_id=${encodeURIComponent(id)}`)
    const body = await res.json()
    if (res.ok) setLists(body.lists || [])
    else setError(body.error || 'Could not load lists')
  }

  const loadColumns = async (forSiteId, listIdToLoad) => {
    const res = await fetch(`/api/assettrack/sync/columns?site_id=${encodeURIComponent(forSiteId)}&list_id=${encodeURIComponent(listIdToLoad)}`)
    const body = await res.json()
    if (res.ok) setColumns(body.columns || [])
    else setError(body.error || 'Could not load columns')
  }

  const pickList = async (id, name) => {
    setListId(id)
    setListName(name)
    await loadColumns(siteId, id)
  }

  const resolveFromUrl = async () => {
    if (!pasteUrl.trim()) return
    setResolving(true)
    setError('')
    const res = await fetch(`/api/assettrack/sync/resolve-site?url=${encodeURIComponent(pasteUrl.trim())}`)
    const body = await res.json()
    if (!res.ok) {
      setError(body.error || 'Could not resolve this URL')
      setResolving(false)
      return
    }

    setSiteId(body.site.id)
    setSiteName(body.site.name)
    setLists(body.lists || [])
    setColumns([])

    if (body.matchedListId) {
      const matched = (body.lists || []).find((l) => l.id === body.matchedListId)
      setListId(body.matchedListId)
      setListName(matched?.name || '')
      await loadColumns(body.site.id, body.matchedListId)
    } else {
      setListId('')
      setListName('')
      setMessage('Site found -- pick the right list below (its name couldn\'t be matched automatically from the URL).')
    }
    setResolving(false)
  }

  const saveSettings = async () => {
    setSaving(true)
    setError('')
    const res = await fetch('/api/assettrack/sync/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sharepoint_site_id: siteId,
        sharepoint_site_name: siteName,
        sharepoint_list_id: listId,
        sharepoint_list_name: listName,
        field_mapping: mapping,
        sla_days: slaDays,
      }),
    })
    const body = await res.json()
    if (!res.ok) setError(body.error || 'Could not save settings')
    else {
      setSettings(body.settings)
      setMessage('Settings saved.')
    }
    setSaving(false)
  }

  const runSync = async () => {
    setSyncing(true)
    setError('')
    setMessage('')
    const res = await fetch('/api/assettrack/sync/run', { method: 'POST' })
    const body = await res.json()
    if (!res.ok) setError(body.error || 'Sync failed')
    else {
      const s = body.summary
      setMessage(`Sync complete: ${s.created} created, ${s.updated} updated, ${s.skipped} skipped.`)
      setSettings((prev) => (prev ? { ...prev, last_sync_summary: s, last_synced_at: new Date().toISOString() } : prev))
    }
    setSyncing(false)
  }

  if (!loading && !isAllowed) {
    return (
      <div className="p-8 max-w-3xl">
        <p className="text-gray-600">Only owner/admin can configure the SharePoint asset sync.</p>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">AssetTrack Settings</h1>
        <Link href="/assettrack" className="text-sm text-blue-600 hover:underline">← AssetTrack</Link>
      </div>
      <p className="text-gray-600 mb-6">Connect a SharePoint list to keep the asset register in sync.</p>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {message && <p className="text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-3 py-2 mb-4">{message}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <div className="space-y-6">
          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-semibold text-gray-900 mb-2">Paste a list URL (recommended for OneDrive/personal-site lists)</h2>
            <p className="text-xs text-gray-500 mb-2">
              A Microsoft List hosted on a personal OneDrive site (a URL containing <code>-my.sharepoint.com/personal/</code>)
              won&apos;t show up in the browser below -- paste its full URL here instead.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={pasteUrl}
                onChange={(e) => setPasteUrl(e.target.value)}
                placeholder="https://yourtenant-my.sharepoint.com/personal/.../Lists/..."
                className="flex-1 px-3 py-2 border rounded-md text-sm"
              />
              <button
                type="button"
                onClick={resolveFromUrl}
                disabled={resolving || !pasteUrl.trim()}
                className="bg-gray-800 text-white px-4 py-2 rounded-md text-sm hover:bg-gray-900 disabled:opacity-50 whitespace-nowrap"
              >
                {resolving ? 'Looking...' : 'Find it'}
              </button>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-semibold text-gray-900 mb-2">1. Site (or use the paste box above)</h2>
            {siteName && <p className="text-sm text-gray-700 mb-2">Selected: {siteName}</p>}
            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-md divide-y">
              {sites.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickSite(s.id, s.name)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${siteId === s.id ? 'bg-blue-50 text-blue-700' : ''}`}
                >
                  {s.name}
                </button>
              ))}
              {sites.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">No followed SharePoint sites found.</p>}
            </div>
          </section>

          {siteId && (
            <section className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="font-semibold text-gray-900 mb-2">2. List</h2>
              {listName && <p className="text-sm text-gray-700 mb-2">Selected: {listName}</p>}
              <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-md divide-y">
                {lists.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => pickList(l.id, l.name)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${listId === l.id ? 'bg-blue-50 text-blue-700' : ''}`}
                  >
                    {l.name}
                  </button>
                ))}
                {lists.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">No lists found on this site.</p>}
              </div>
            </section>
          )}

          {listId && columns.length > 0 && (
            <section className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="font-semibold text-gray-900 mb-3">3. Map columns</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(FIELD_LABELS).map(([field, fieldLabel]) => (
                  <div key={field}>
                    <label className="block text-xs text-gray-500 mb-1">{fieldLabel}</label>
                    <select
                      value={mapping[field] || ''}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [field]: e.target.value || undefined }))}
                      className="w-full px-2 py-1.5 border rounded-md text-sm"
                    >
                      <option value="">Not mapped</option>
                      {columns.map((c) => (
                        <option key={c.name} value={c.name}>{c.displayName}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <label className="block text-xs text-gray-500 mb-1">Ticket turnaround SLA (days)</label>
                <input
                  type="number"
                  min="1"
                  value={slaDays}
                  onChange={(e) => setSlaDays(e.target.value)}
                  className="w-32 px-2 py-1.5 border rounded-md text-sm"
                />
              </div>

              <button
                type="button"
                onClick={saveSettings}
                disabled={saving || !mapping.asset_tag}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save mapping'}
              </button>
            </section>
          )}

          {settings?.sharepoint_list_id && (
            <section className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="font-semibold text-gray-900 mb-2">Sync</h2>
              {settings.last_synced_at && (
                <p className="text-xs text-gray-500 mb-2">
                  Last synced: {new Date(settings.last_synced_at).toLocaleString()}
                  {settings.last_sync_summary && (
                    <> — {settings.last_sync_summary.created} created, {settings.last_sync_summary.updated} updated, {settings.last_sync_summary.skipped} skipped</>
                  )}
                </p>
              )}
              {settings.last_sync_summary?.unresolvedAssignees?.length > 0 && (
                <p className="text-xs text-amber-600 mb-2">
                  Unresolved assignees (no matching FirmTrack user): {settings.last_sync_summary.unresolvedAssignees.join(', ')}
                </p>
              )}
              <button
                type="button"
                onClick={runSync}
                disabled={syncing}
                className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700 disabled:opacity-50"
              >
                {syncing ? 'Syncing...' : 'Sync now'}
              </button>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
