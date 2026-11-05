import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getVendorPortalProfile } from '@/lib/procuretrack/portal-auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// A vendor sees only the RFQs they were actually invited to, never the
// tenant's full sourcing activity.
export async function GET() {
  const supabase = await createServerClient()
  const portalProfile = await getVendorPortalProfile(supabase)
  if (!portalProfile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: invitations } = await supabaseAdmin
    .from('procuretrack_rfq_vendors')
    .select('rfq:rfq_id(id, title, status, created_at), invited_at')
    .eq('vendor_id', portalProfile.vendorId)
    .eq('tenant_id', portalProfile.tenantId)

  const rfqIds = (invitations || []).map((i) => (i.rfq as unknown as { id: string }).id)
  const { data: myQuotes } = rfqIds.length > 0
    ? await supabaseAdmin
        .from('procuretrack_rfq_quotes')
        .select('*')
        .eq('vendor_id', portalProfile.vendorId)
        .in('rfq_id', rfqIds)
    : { data: [] }

  return NextResponse.json({ invitations, myQuotes })
}
