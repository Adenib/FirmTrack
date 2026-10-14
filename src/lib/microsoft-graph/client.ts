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

export type UnreadOutlookMessage = OutlookMessage & { bodyPreview: string }

function toUnreadOutlookMessage(data: Record<string, unknown>): UnreadOutlookMessage {
  return {
    ...toOutlookMessage(data),
    bodyPreview: (data.bodyPreview as string) || '',
  }
}

// Powers the AITrack inbox digest cron -- bodyPreview is cheap to include
// in the list call itself, so summarizing a user's unread mail needs no
// per-message follow-up fetch.
export async function listUnreadOutlookMessages(accessToken: string, limit = 50): Promise<UnreadOutlookMessage[]> {
  const params = new URLSearchParams()
  params.set('$filter', 'isRead eq false')
  params.set('$orderby', 'receivedDateTime desc')
  params.set('$top', String(limit))
  params.set('$select', 'id,subject,from,receivedDateTime,hasAttachments,webLink,bodyPreview')
  const data = await graphFetch(accessToken, `/me/messages?${params.toString()}`)
  return (data.value || []).map(toUnreadOutlookMessage)
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

export type SharePointSite = {
  id: string
  name: string
  webUrl: string
}

function toSharePointSite(data: Record<string, unknown>): SharePointSite {
  return {
    id: data.id as string,
    name: (data.displayName as string) || (data.name as string) || 'Untitled site',
    webUrl: data.webUrl as string,
  }
}

// Default "recent" list, same role $orderby plays for Outlook when
// there's no search term -- a firm may belong to many sites, so this
// avoids requiring a search term just to see anything.
export async function listFollowedSharePointSites(accessToken: string): Promise<SharePointSite[]> {
  const data = await graphFetch(accessToken, '/me/followedSites')
  return (data.value || []).map(toSharePointSite)
}

export async function searchSharePointSites(accessToken: string, query: string): Promise<SharePointSite[]> {
  const params = new URLSearchParams()
  params.set('search', query)
  const data = await graphFetch(accessToken, `/sites?${params.toString()}`)
  return (data.value || []).map(toSharePointSite)
}

// Resolves a site directly by its hostname + server-relative path (Graph's
// "/sites/{hostname}:{path}" addressing). Needed for personal OneDrive
// sites ("*-my.sharepoint.com/personal/<user>") hosting a Microsoft List --
// those never show up in /me/followedSites or the /sites search above
// (both only surface team/communication sites), so a pasted list URL is
// the only reliable way to reach one.
export async function getSiteByServerRelativePath(
  accessToken: string,
  hostname: string,
  path: string
): Promise<SharePointSite> {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const data = await graphFetch(accessToken, `/sites/${hostname}:${cleanPath}`)
  return toSharePointSite(data)
}

// v1 scope: a site's default document library only, not every library
// a site might have -- enumerating multiple libraries per site is a
// separate follow-up if needed.
export async function getSiteDefaultDrive(accessToken: string, siteId: string): Promise<{ id: string }> {
  const data = await graphFetch(accessToken, `/sites/${siteId}/drive`)
  return { id: data.id }
}

// A SharePoint document library item has the identical Graph shape as
// a OneDrive item -- reuses OneDriveItem/OneDriveItemMetadata rather
// than duplicating them, just addressed via /drives/{driveId}/... (a
// site's document library) instead of /me/drive/... (the signed-in
// user's own drive).
export async function listDriveChildren(accessToken: string, driveId: string, folderId?: string): Promise<OneDriveItem[]> {
  const path = folderId ? `/drives/${driveId}/items/${folderId}/children` : `/drives/${driveId}/root/children`
  const data = await graphFetch(accessToken, path)
  return (data.value || []).map((item: Record<string, unknown>) => ({
    id: item.id,
    name: item.name,
    isFolder: !!item.folder,
    size: item.size || 0,
  }))
}

export async function getDriveItemMetadata(accessToken: string, driveId: string, itemId: string): Promise<OneDriveItemMetadata> {
  const data = await graphFetch(accessToken, `/drives/${driveId}/items/${itemId}`)
  return {
    name: data.name,
    size: data.size || 0,
    webUrl: data.webUrl,
    lastModifiedDateTime: data.lastModifiedDateTime,
    mimeType: data.file?.mimeType || null,
  }
}

// -- SharePoint Lists (AssetTrack's asset-register sync) --------------
// Nothing above this point reads a List (only sites/drives/files), so
// this is net-new. Unlike the drive functions above, a list's "fields"
// are caller-defined (whatever columns the list's owner created), so
// these return raw/typed-enough shapes for AssetTrack's own mapping UI
// to interpret, rather than a fixed app-specific shape.

export type SharePointList = { id: string; name: string; webUrl: string }

// System lists (document libraries' own backing lists, "Site Pages," etc.)
// come back with list.hidden -- filtered out so the picker only shows
// lists a site owner actually created, like AELEX's asset register.
export async function listSharePointLists(accessToken: string, siteId: string): Promise<SharePointList[]> {
  const data = await graphFetch(accessToken, `/sites/${siteId}/lists`)
  return (data.value || [])
    .filter((item: Record<string, unknown>) => !(item.list as Record<string, unknown> | undefined)?.hidden)
    .map((item: Record<string, unknown>) => ({
      id: item.id as string,
      name: (item.displayName as string) || (item.name as string) || 'Untitled list',
      webUrl: item.webUrl as string,
    }))
}

export type SharePointListColumn = { name: string; displayName: string; type: string }

const COLUMN_TYPE_FACETS = ['text', 'number', 'boolean', 'dateTime', 'choice', 'currency', 'personOrGroup', 'lookup']

export async function listSharePointListColumns(
  accessToken: string,
  siteId: string,
  listId: string
): Promise<SharePointListColumn[]> {
  const data = await graphFetch(accessToken, `/sites/${siteId}/lists/${listId}/columns`)
  return (data.value || [])
    // Microsoft Lists (the templated "Lists" app) marks its own custom
    // columns readOnly=true at the schema level -- that means "can't edit
    // this column's definition via classic list settings," not "this
    // column has no usable data." Filtering those out hid every custom
    // column a Lists-created list had, leaving only built-ins like Title.
    // `hidden` is the real signal for internal/system fields to exclude.
    .filter((item: Record<string, unknown>) => !item.hidden)
    .map((item: Record<string, unknown>) => ({
      name: item.name as string,
      displayName: (item.displayName as string) || (item.name as string),
      type: COLUMN_TYPE_FACETS.find((facet) => facet in item) || 'text',
    }))
}

export type SharePointListItem = { id: string; fields: Record<string, unknown> }

// Paginated via @odata.nextLink, which is a full absolute URL -- fetched
// directly rather than through graphFetch (which always prepends
// GRAPH_BASE to a relative path).
// Resolves a plain display name (no email) to a real address via the
// tenant's Microsoft 365 directory -- used by AssetTrack's sync when a
// source list only records an assignee's name (e.g. "Munachimso Odibo"),
// not an email. $search is fuzzier than $filter startswith and tolerates
// minor spacing/casing differences; requires the ConsistencyLevel header
// per Graph's documented $search-on-/users requirement.
export async function findDirectoryUserByDisplayName(
  accessToken: string,
  displayName: string
): Promise<{ displayName: string; email: string } | null> {
  const params = new URLSearchParams()
  params.set('$search', `"displayName:${displayName.replace(/"/g, '')}"`)
  params.set('$select', 'displayName,mail,userPrincipalName')
  params.set('$top', '1')

  const response = await fetch(`${GRAPH_BASE}/users?${params.toString()}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      ConsistencyLevel: 'eventual',
    },
  })
  if (!response.ok) {
    throw new GraphApiError(`Microsoft Graph request failed: ${response.status} ${await response.text()}`)
  }
  const data: { value?: Array<{ displayName?: string; mail?: string; userPrincipalName?: string }> } = await response.json()
  const match = data.value?.[0]
  if (!match) return null

  const email = match.mail || match.userPrincipalName
  if (!email) return null

  return { displayName: match.displayName || displayName, email }
}

export async function listSharePointListItems(
  accessToken: string,
  siteId: string,
  listId: string
): Promise<SharePointListItem[]> {
  const items: SharePointListItem[] = []
  let url: string | undefined =
    `${GRAPH_BASE}/sites/${siteId}/lists/${listId}/items?expand=fields&$top=200`

  while (url) {
    const response: Response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } })
    if (!response.ok) {
      throw new GraphApiError(`Microsoft Graph request failed: ${response.status} ${await response.text()}`)
    }
    const data: { value?: Array<{ id: string; fields?: Record<string, unknown> }>; '@odata.nextLink'?: string } = await response.json()
    for (const item of data.value || []) {
      items.push({ id: item.id, fields: item.fields || {} })
    }
    url = data['@odata.nextLink']
  }

  return items
}
