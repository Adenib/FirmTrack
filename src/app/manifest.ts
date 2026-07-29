import type { MetadataRoute } from 'next'

// Next.js's built-in Metadata Route convention -- automatically served
// at /manifest.webmanifest and linked from the page <head>, no manual
// <link rel="manifest"> tag needed.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FirmTrack',
    short_name: 'FirmTrack',
    description: 'Practice management for legal firms: time and billing, accounting, HR, and calendaring in one place.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0855fd',
    icons: [
      {
        src: '/brand/icon-mark.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    shortcuts: [
      {
        name: 'Clock In',
        url: '/hrtrack/attendance',
      },
    ],
  }
}
