import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { restoreTenantData, RestoreError } from '@/lib/backup/restore'

export const maxDuration = 60

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  // Gated the same way as /admin/import -- the resulting org is unrelated
  // to the actor's own tenant, but this still isn't a wide-open endpoint.
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const newOrgName = formData.get('new_org_name')
  const newOwnerEmail = formData.get('new_owner_email')

  if (!(file instanceof File) || typeof newOwnerEmail !== 'string' || !newOwnerEmail.trim()) {
    return NextResponse.json({ error: 'A backup file and new owner email are required' }, { status: 400 })
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await restoreTenantData(buffer, {
      newOrgName: typeof newOrgName === 'string' ? newOrgName : '',
      newOwnerEmail: newOwnerEmail.trim(),
    })
    return NextResponse.json(result)
  } catch (err) {
    const status = err instanceof RestoreError ? 400 : 500
    const message = err instanceof Error ? err.message : 'Restore failed'
    return NextResponse.json({ error: message }, { status })
  }
}
