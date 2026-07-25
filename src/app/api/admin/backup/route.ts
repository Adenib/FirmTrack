import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ZipArchive } from 'archiver'
import { exportTenantData } from '@/lib/backup/export'

export const maxDuration = 60

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { manifest, data, files } = await exportTenantData(profile.tenant_id)

  const archive = new ZipArchive({ zlib: { level: 9 } })
  const chunks: Buffer[] = []
  archive.on('data', (chunk: Buffer) => chunks.push(chunk))
  const done = new Promise<void>((resolve, reject) => {
    archive.on('end', () => resolve())
    archive.on('error', reject)
  })

  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })
  archive.append(JSON.stringify(data), { name: 'data.json' })
  for (const file of files) archive.append(file.buffer, { name: file.zipPath })
  await archive.finalize()
  await done

  const buffer = Buffer.concat(chunks)
  const slug = manifest.organization_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const filename = `firmtrack-backup-${slug}-${new Date().toISOString().split('T')[0]}.zip`

  return new NextResponse(buffer, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  })
}
