'use client'

import { useState } from 'react'
import Link from 'next/link'

type ImportType = 'clients' | 'employees'
type ImportResult = { imported: number; type: string } | null

const TEMPLATES = {
  clients: 'name,email,phone,company,notes\nJohn Doe,john@example.com,08012345678,Acme Ltd,VIP client\nJane Smith,jane@example.com,08087654321,Beta Corp,',
  employees: 'full_name,email,phone,department,job_title,employment_type,start_date,gross_salary\nJohn Doe,john@company.com,08012345678,Engineering,Developer,full_time,2024-01-01,250000\nJane Smith,jane@company.com,08087654321,HR,HR Manager,full_time,2023-06-01,300000',
}

const COLUMNS = {
  clients: ['name (required)', 'email', 'phone', 'company', 'notes'],
  employees: ['full_name (required)', 'email', 'phone', 'department', 'job_title', 'employment_type', 'start_date', 'gross_salary'],
}

export default function ImportPage() {
  const [importType, setImportType] = useState<ImportType>('clients')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Record<string, string>[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult>(null)
  const [error, setError] = useState('')

  const parseCSV = (text: string): Record<string, string>[] => {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''))
    return lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim().replace(/"/g, ''))
      return Object.fromEntries(headers.map((h, i) => [h, values[i] || '']))
    })
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setResult(null)
    setError('')

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const rows = parseCSV(text)
      setPreview(rows.slice(0, 5))
    }
    reader.readAsText(f)
  }

  const handleImport = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)

    const reader = new FileReader()
    reader.onload = async (ev) => {
      const text = ev.target?.result as string
      const records = parseCSV(text)

      const response = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: importType, records }),
      })

      const data = await response.json()
      setLoading(false)

      if (!response.ok) {
        setError(data.error || 'Import failed')
      } else {
        setResult(data)
        setFile(null)
        setPreview([])
      }
    }
    reader.readAsText(file)
  }

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATES[importType]], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `firmtrack_${importType}_template.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-8 max-w-3xl">
      <Link href="/admin" className="text-sm text-blue-600 hover:underline mb-4 block">
        ← Back to Admin
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Import Data</h1>
      <p className="text-gray-600 mb-6">
        Bulk import clients or employees from a CSV file exported from any app.
      </p>

      {/* Type selector */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
        <p className="text-sm font-medium text-gray-700 mb-3">What are you importing?</p>
        <div className="flex gap-3">
          {(['clients', 'employees'] as ImportType[]).map((t) => (
            <button
              key={t}
              onClick={() => { setImportType(t); setFile(null); setPreview([]); setResult(null); setError('') }}
              className={`px-4 py-2 rounded-md text-sm capitalize border ${
                importType === t
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Expected columns */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700">Expected CSV columns</p>
          <button
            onClick={downloadTemplate}
            className="text-xs text-blue-600 hover:underline"
          >
            Download template
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {COLUMNS[importType].map((col) => (
            <span key={col} className={`text-xs px-2 py-0.5 rounded ${col.includes('required') ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
              {col}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Column names are case-insensitive. Extra columns are ignored.
        </p>
      </div>

      {/* File upload */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
        <p className="text-sm font-medium text-gray-700 mb-3">Upload CSV file</p>
        <input
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        {file && (
          <p className="text-xs text-gray-500 mt-2">
            {file.name} · {(file.size / 1024).toFixed(1)} KB
          </p>
        )}
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 overflow-x-auto">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Preview (first {preview.length} rows)
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                {Object.keys(preview[0]).map((col) => (
                  <th key={col} className="text-left px-2 py-1 text-gray-500 font-medium">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Object.values(row).map((val, j) => (
                    <td key={j} className="px-2 py-1 text-gray-700 truncate max-w-32">{val}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-green-700">
            ✓ Successfully imported {result.imported} {result.type}.
          </p>
        </div>
      )}

      <button
        onClick={handleImport}
        disabled={!file || loading}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Importing...' : `Import ${importType}`}
      </button>

      <p className="text-xs text-gray-400 text-center mt-3">
        Existing records are not overwritten. Duplicate entries may be created if the same data is imported twice.
      </p>
    </div>
  )
}