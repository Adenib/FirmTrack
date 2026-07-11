import { useEffect, useRef, useState } from 'react'

export type CalendarEventResult = {
  id: string
  title: string
  start_at: string
  end_at: string
  matter: { id: string; matter_id: string; case_name: string } | null
}

export default function CalendarEventPicker({
  onSelect,
}: {
  onSelect: (event: CalendarEventResult) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CalendarEventResult[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!query || query.length < 1) {
      setResults([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      const response = await fetch(`/api/calentrack?q=${encodeURIComponent(query)}`)
      if (!response.ok) return
      const result = await response.json()
      setResults(result.events || [])
    }, 250)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        placeholder="Link event..."
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full px-2 py-1 border rounded text-sm"
      />
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-72 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg">
          {results.map((event) => (
            <button
              key={event.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(event)
                setQuery('')
                setOpen(false)
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
            >
              <p className="font-medium text-gray-900">{event.title}</p>
              <p className="text-xs text-gray-500">
                {new Date(event.start_at).toLocaleString()}
                {event.matter ? ` · ${event.matter.matter_id} · ${event.matter.case_name}` : ''}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
