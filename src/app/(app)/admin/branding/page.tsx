'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export default function OrganizationBrandingPage() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/organization-logo')
    const result = await res.json()
    if (res.ok) setLogoUrl(result.logoUrl)
    else setError(result.error || 'Could not load logo')
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    setSaved(false)

    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/admin/organization-logo', { method: 'POST', body: formData })
    const result = await res.json()
    setUploading(false)
    if (!res.ok) {
      setError(result.error || 'Could not upload logo')
      return
    }
    setLogoUrl(result.logoUrl)
    setSaved(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemove = async () => {
    setRemoving(true)
    setError('')
    setSaved(false)
    const res = await fetch('/api/admin/organization-logo', { method: 'DELETE' })
    const result = await res.json()
    setRemoving(false)
    if (!res.ok) {
      setError(result.error || 'Could not remove logo')
      return
    }
    setLogoUrl(null)
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Organization Branding</h1>
        <Link href="/admin" className="text-sm text-blue-600 hover:underline">
          ← Admin
        </Link>
      </div>
      <p className="text-gray-600 mb-6">
        Your firm&apos;s own logo, shown in your sidebar and on invoices you send to clients.
      </p>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-20 h-20 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, not a static asset
                <img src={logoUrl} alt="Organization logo" className="w-full h-full object-contain" />
              ) : (
                <span className="text-xs text-gray-400 text-center px-2">No logo yet</span>
              )}
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
                disabled={uploading}
                className="text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">PNG, JPEG, or WEBP · up to 2MB</p>
              {uploading && <p className="text-xs text-blue-600 mt-1">Uploading...</p>}
            </div>
          </div>

          {logoUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              className="text-sm text-red-600 hover:underline disabled:opacity-50"
            >
              {removing ? 'Removing...' : 'Remove logo'}
            </button>
          )}

          {error && <p className="text-red-600 text-xs mt-3">{error}</p>}
          {saved && <p className="text-green-600 text-xs mt-3">Logo updated.</p>}
        </div>
      )}
    </div>
  )
}
