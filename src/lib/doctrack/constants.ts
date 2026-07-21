export const DOCUMENTS_BUCKET = 'documents'
export const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024 // 25MB

// An allow-list, not "any file" -- consistent with this app's existing
// upload-safety posture (see src/app/api/hrtrack/requests/attachment/route.ts).
export const ALLOWED_DOCUMENT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}
