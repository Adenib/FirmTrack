import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { deleteOrganization } from '@/lib/creator/delete-organization'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: admin } = await supabaseAdmin
    .from('platform_admins')
    .select('role, status')
    .eq('user_id', user.id)
    .single()

  // Deleting an organization is irreversible and far more destructive than
  // the other actions gated on the 'organizations' page (which also allows
  // 'developer') -- restrict it to the two full-access cadres.
  if (!admin || admin.status === 'inactive' || !['creator', 'admin'].includes(admin.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { confirmName } = await request.json()

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single()

  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  if (confirmName !== org.name) {
    return NextResponse.json({ error: 'Confirmation name does not match this organization.' }, { status: 400 })
  }

  const result = await deleteOrganization(supabaseAdmin, orgId)

  return NextResponse.json({ success: true, ...result })
}
