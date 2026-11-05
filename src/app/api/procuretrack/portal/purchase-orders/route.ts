import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getVendorPortalProfile } from '@/lib/procuretrack/portal-auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Read-only: a vendor sees only their own POs with this tenant, never
// anyone else's.
export async function GET() {
  const supabase = await createServerClient()
  const portalProfile = await getVendorPortalProfile(supabase)
  if (!portalProfile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: purchaseOrders, error } = await supabaseAdmin
    .from('procuretrack_purchase_orders')
    .select('*, lines:procuretrack_po_lines(*)')
    .eq('vendor_id', portalProfile.vendorId)
    .eq('tenant_id', portalProfile.tenantId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ purchaseOrders })
}
