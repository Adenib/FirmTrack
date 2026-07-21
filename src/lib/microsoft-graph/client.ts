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
