'use client'

import { useState } from 'react'
import Link from 'next/link'

type RestoreResult = {
  newOrgId: string
  newOrgSlug: string
  counts: Record<string, number>
  skippedUsers: { email: string; full_name: string }[]
}

export default function BackupRestorePage() {
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')

  const [file, setFile] = useState<File | null>(null)
  const [newOrgName, setNewOrgName] = useState('')
  const [newOwnerEmail, setNewOwnerEmail] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState('')
  const [result, setResult] = useState<RestoreResult | null>(null)

  const handleDownload = async () => {
    setDownloading(true)
    setDownloadError('')
    const res = await fetch('/api/admin/backup')
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setDownloadError(body.error || 'Could not create backup')
      setDownloading(false)
      return
    }
    const blob = await res.blob()
    const disposition = res.headers.get('content-disposition') || ''
    const match = disposition.match(/filename="(.+)"/)
    const filename = match ? match[1] : 'firmtrack-backup.zip'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    setDownloading(false)
  }

  const handleRestore = async () => {
    if (!file || !newOwnerEmail.trim()) return
    setRestoring(true)
    setRestoreError('')
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('new_org_name', newOrgName)
    formData.append('new_owner_email', newOwnerEmail.trim())

    const res = await fetch('/api/admin/restore', { method: 'POST', body: formData })
    const body = await res.json()
    setRestoring(false)

    if (!res.ok) {
      setRestoreError(body.error || 'Restore failed')
      return
    }
    setResult(body)
    setFile(null)
    setNewOrgName('')
    setNewOwnerEmail('')
  }

  return (
    <div className="p-8 max-w-3xl">
      <Link href="/admin" className="text-sm text-blue-600 hover:underline mb-4 block">
        ← Back to Admin
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Backup &amp; Restore</h1>
      <p className="text-gray-600 mb-6">
        Download a full export of your organization&apos;s data, or restore a backup into a
        brand-new organization.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <p className="text-sm font-medium text-gray-700 mb-2">Download a backup</p>
        <p className="text-xs text-gray-500 mb-3">
          A single .zip containing all of your organization&apos;s data (clients, matters, time
          entries, invoices, documents, and more) plus any stored files.
        </p>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {downloading ? 'Preparing backup...' : 'Download backup'}
        </button>
        {downloadError && <p className="text-red-600 text-sm mt-2">{downloadError}</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="text-sm font-medium text-gray-700 mb-2">Restore from a backup</p>
        <p className="text-xs text-gray-500 mb-3">
          Restoring always creates a <strong>brand-new organization</strong> — it never
          overwrites an existing one. You&apos;ll need a new email for the new organization&apos;s
          owner (they&apos;ll use Forgot Password to set a login). Every other person referenced
          in the backup is recreated using their original email where possible; anyone whose
          email is already registered elsewhere gets reassigned to the new owner instead, and
          listed below so you can re-invite them manually. Restoring brings back subscription
          records as data only — it does not resume Paystack billing.
        </p>

        <div className="space-y-3">
          <input
            type="file"
            accept=".zip"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <input
            type="text"
            placeholder="New organization name (optional)"
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm"
          />
          <input
            type="email"
            required
            placeholder="New owner email"
            value={newOwnerEmail}
            onChange={(e) => setNewOwnerEmail(e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm"
          />
        </div>

        {restoreError && <p className="text-red-600 text-sm mt-3">{restoreError}</p>}

        {result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-3 space-y-2">
            <p className="text-sm text-green-700">
              ✓ Restored into a new organization ({result.newOrgSlug}).
            </p>
            <p className="text-xs text-gray-600">
              {Object.entries(result.counts)
                .filter(([, count]) => count > 0)
                .map(([table, count]) => `${table}: ${count}`)
                .join(' · ')}
            </p>
            {result.skippedUsers.length > 0 && (
              <div className="text-xs text-amber-700">
                <p className="font-medium">
                  {result.skippedUsers.length} user(s) could not be recreated (email already
                  registered) — their data was reassigned to the new owner. Re-invite them
                  manually and reassign:
                </p>
                <ul className="list-disc list-inside mt-1">
                  {result.skippedUsers.map((u) => (
                    <li key={u.email}>
                      {u.full_name} ({u.email})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleRestore}
          disabled={!file || !newOwnerEmail.trim() || restoring}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {restoring ? 'Restoring...' : 'Restore into a new organization'}
        </button>
      </div>
    </div>
  )
}
