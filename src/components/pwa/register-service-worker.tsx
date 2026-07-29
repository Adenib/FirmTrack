'use client'

import { useEffect } from 'react'

export default function RegisterServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Best-effort -- installability/offline fallback is a nice-to-have,
        // never something worth surfacing an error over.
      })
    }
  }, [])

  return null
}
