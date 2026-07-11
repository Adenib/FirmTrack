import { useEffect, useRef, useState } from 'react'

export type MatterResult = {
  id: string
  matter_id: string
  case_name: string
  client_id: string
  rate_type: string
  status: string
  clients: { name: string } | null
}

export default function MatterSearchInput({
  value,
  onChange,
  onSelect,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onSelect: (matter: MatterResult) => void
  placeholder?: string
}) {
  const [results, setResults] = useState<MatterResult[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!value || value.length < 1) {
      setResults([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      const response = await fetch(`/api/timetrack/matters-search?q=${encodeURIComponent(value)}`)
      if (!response.ok) return
      const result = await response.json()
      setResults(result.matters || [])
    }, 250)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value])

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        placeholder={placeholder || 'Search matter...'}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full px-2 py-1 border rounded text-sm"
      />
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-72 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg">
          {results.map((m) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(m)
                setOpen(false)
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
            >
              <p className="font-medium text-gray-900">{m.matter_id} · {m.case_name}</p>
              <p className="text-xs text-gray-500">{m.clients?.name || 'No client'} · Rate {m.rate_type}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
