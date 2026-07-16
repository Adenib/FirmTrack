import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Reverse-geocodes a lat/lng into a street address via Google's Geocoding
// API, server-side so the API key never reaches the browser. If no key is
// configured yet, returns a clear placeholder rather than failing —
// attendance capture (the thing that actually matters) must not be
// blocked by a missing third-party credential, same principle as
// BillTrack's email send not silently no-op-ing but also not blocking
// the underlying record from being created.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { lat, lng } = await request.json()
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ address: 'Location unavailable — geocoding not configured' })
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`
    const res = await fetch(url)
    const data = await res.json()
    const address = data.results?.[0]?.formatted_address
    return NextResponse.json({ address: address || `${lat.toFixed(5)}, ${lng.toFixed(5)}` })
  } catch {
    return NextResponse.json({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` })
  }
}
