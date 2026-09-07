import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Hosted as a GitHub Release asset, not Supabase Storage -- the ~78MB
// installer exceeds Supabase's free-tier global upload size cap (a
// Pro-plan-only setting). This route is still what the app links to, so
// the download always starts from firmtracks.com even though the actual
// bytes come from GitHub.
const INSTALLER_URL = 'https://github.com/Adenib/FirmTrack/releases/download/desktop-agent-v1.0.1/FirmTrack-Tracker-Setup-1.0.1.exe'

// Any authenticated user can download the agent installer -- it's not
// tenant-scoped data, just a firm-wide static asset every FirmTrack
// customer is entitled to.
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  return NextResponse.redirect(INSTALLER_URL)
}
