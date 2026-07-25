import { createClient } from '@supabase/supabase-js'
import { RESTORE_ORDER } from './tenant-tables'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type ExportedFile = { zipPath: string; buffer: Buffer }

export type TenantExport = {
  manifest: {
    exported_at: string
    organization_name: string
    tables: string[]
    excluded_tables: string[]
  }
  data: {
    organization: Record<string, unknown>
    users: Record<string, unknown>[]
  } & Record<string, Record<string, unknown>[]>
  files: ExportedFile[]
}

const EXCLUDED_TABLES = ['microsoft_graph_tokens', 'agent_api_keys', 'mfa_backup_codes']

// Both storage buckets this app uses are laid out {tenantId}/{parentId}/{filename}
// (see src/lib/doctrack/create-document.ts and the HRTrack attachment route) --
// list is one level at a time, so parent folders are listed before their files.
async function exportBucketFiles(bucket: string, tenantId: string): Promise<ExportedFile[]> {
  const files: ExportedFile[] = []
  const { data: parentDirs } = await supabaseAdmin.storage.from(bucket).list(tenantId)
  for (const dir of parentDirs || []) {
    const { data: entries } = await supabaseAdmin.storage.from(bucket).list(`${tenantId}/${dir.name}`)
    for (const entry of entries || []) {
      const path = `${tenantId}/${dir.name}/${entry.name}`
      const { data: blob } = await supabaseAdmin.storage.from(bucket).download(path)
      if (!blob) continue
      files.push({ zipPath: `files/${bucket}/${path}`, buffer: Buffer.from(await blob.arrayBuffer()) })
    }
  }
  return files
}

export async function exportTenantData(tenantId: string): Promise<TenantExport> {
  const { data: organization, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .eq('id', tenantId)
    .single()
  if (orgError || !organization) throw new Error(orgError?.message || 'Organization not found')

  const { data: users } = await supabaseAdmin.from('users').select('*').eq('tenant_id', tenantId)

  const data: TenantExport['data'] = { organization, users: users || [] }

  // documents' ids are needed up front so document_versions (which has no
  // tenant_id column of its own) can be scoped via its parent instead.
  let documentIds: string[] = []

  for (const table of RESTORE_ORDER) {
    let rows: Record<string, unknown>[] = []
    if (table.scope) {
      const parentIds = table.name === 'document_versions' ? documentIds : []
      if (parentIds.length) {
        const { data: scopedRows } = await supabaseAdmin
          .from(table.name)
          .select('*')
          .in(table.scope.parentIdColumn, parentIds)
        rows = scopedRows || []
      }
    } else {
      const { data: tenantRows } = await supabaseAdmin.from(table.name).select('*').eq('tenant_id', tenantId)
      rows = tenantRows || []
    }
    data[table.name] = rows
    if (table.name === 'documents') documentIds = rows.map((r) => r.id as string)
  }

  const files = [
    ...(await exportBucketFiles('documents', tenantId)),
    ...(await exportBucketFiles('request-attachments', tenantId)),
  ]

  return {
    manifest: {
      exported_at: new Date().toISOString(),
      organization_name: organization.name,
      tables: ['organization', 'users', ...RESTORE_ORDER.map((t) => t.name)],
      excluded_tables: EXCLUDED_TABLES,
    },
    data,
    files,
  }
}
