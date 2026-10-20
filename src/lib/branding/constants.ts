export const LOGO_BUCKET = 'logos'
export const MAX_LOGO_SIZE = 2 * 1024 * 1024 // 2MB -- a logo, not a document

// Raster only -- no SVG. A signed URL to this bucket can be opened
// directly in a new tab (outside the <img> context this app otherwise
// renders it in), and an SVG can carry embedded script that would then
// run in that tab. Consistent with this app's existing no-raw-HTML
// posture (see blog_posts' migration comment).
export const ALLOWED_LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
