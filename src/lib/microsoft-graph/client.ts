const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

export type OneDriveItem = {
  id: string
  name: string
  isFolder: boolean
  size: number
}

export class GraphApiError extends Error {}

async function graphFetch(accessToken: string, path: string) {
  const response = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw new GraphApiError(`Microsoft Graph request failed: ${response.status} ${await response.text()}`)
  }
  return response.json()
}

async function graphFetchBinary(accessToken: string, path: string): Promise<Buffer> {
  const response = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw new GraphApiError(`Microsoft Graph request failed: ${response.status} ${await response.text()}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

// Metadata-only -- this app never fetches file content, only lists
// files/folders and reads an item's own metadata (see DocTrack Phase 2a:
// linking stores a reference, not a copy).
export async function listOneDriveChildren(accessToken: string, folderId?: string): Promise<OneDriveItem[]> {
  const path = folderId ? `/me/drive/items/${folderId}/children` : '/me/drive/root/children'
  const data = await graphFetch(accessToken, path)
  return (data.value || []).map((item: Record<string, unknown>) => ({
    id: item.id,
    name: item.name,
    isFolder: !!item.folder,
    size: item.size || 0,
  }))
}

export type OneDriveItemMetadata = {
  name: string
  size: number
  webUrl: string
  lastModifiedDateTime: string
  mimeType: string | null
}

export async function getOneDriveItemMetadata(accessToken: string, itemId: string): Promise<OneDriveItemMetadata> {
  const data = await graphFetch(accessToken, `/me/drive/items/${itemId}`)
  return {
    name: data.name,
    size: data.size || 0,
    webUrl: data.webUrl,
    lastModifiedDateTime: data.lastModifiedDateTime,
    mimeType: data.file?.mimeType || null,
  }
}

export type OutlookMessage = {
  id: string
  subject: string
  from: string | null
  receivedDateTime: string
  hasAttachments: boolean
  webLink: string
}

function toOutlookMessage(data: Record<string, unknown>): OutlookMessage {
  const from = data.from as { emailAddress?: { address?: string; name?: string } } | undefined
  return {
    id: data.id as string,
    subject: (data.subject as string) || '(no subject)',
    from: from?.emailAddress?.address || from?.emailAddress?.name || null,
    receivedDateTime: data.receivedDateTime as string,
    hasAttachments: !!data.hasAttachments,
    webLink: data.webLink as string,
  }
}

// Mail is naturally "recent + search," not a folder tree like OneDrive --
// no browsing-by-folder needed here.
export async function listOutlookMessages(accessToken: string, search?: string): Promise<OutlookMessage[]> {
  const params = new URLSearchParams()
  if (search) {
    params.set('$search', `"${search.replace(/"/g, '')}"`)
  } else {
    params.set('$orderby', 'receivedDateTime desc')
  }
  params.set('$top', '25')
  params.set('$select', 'id,subject,from,receivedDateTime,hasAttachments,webLink')
  const data = await graphFetch(accessToken, `/me/messages?${params.toString()}`)
  return (data.value || []).map(toOutlookMessage)
}

// Server-verified snapshot at link time -- never trust client-supplied
// subject/sender/date for what gets stored (same principle as
// getOneDriveItemMetadata).
export async function getMessageMetadata(accessToken: string, messageId: string): Promise<OutlookMessage> {
  const data = await graphFetch(accessToken, `/me/messages/${messageId}`)
  return toOutlookMessage(data)
}

export type OutlookAttachment = {
  id: string
  name: string
  contentType: string
  size: number
}

export async function listMessageAttachments(accessToken: string, messageId: string): Promise<OutlookAttachment[]> {
  const data = await graphFetch(accessToken, `/me/messages/${messageId}/attachments`)
  return (data.value || [])
    .filter((item: Record<string, unknown>) => !item.isInline)
    .map((item: Record<string, unknown>) => ({
      id: item.id,
      name: item.name,
      contentType: item.contentType || 'application/octet-stream',
      size: item.size || 0,
    }))
}

export async function downloadMessageAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  return graphFetchBinary(accessToken, `/me/messages/${messageId}/attachments/${attachmentId}/$value`)
}

// Only used for the "save a permanent copy" path -- the full raw
// MIME/.eml content, not just metadata.
export async function downloadMessageRaw(accessToken: string, messageId: string): Promise<Buffer> {
  return graphFetchBinary(accessToken, `/me/messages/${messageId}/$value`)
}
