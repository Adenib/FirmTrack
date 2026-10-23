import type { MetadataRoute } from 'next'
import { MARKETING_MODULES } from '@/lib/marketing/modules'
import { getPublishedPosts } from '@/lib/blog/get-posts'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Otherwise this route is frozen at build/deploy time, same issue as the
// blog pages -- a post published through Creator Console wouldn't reach
// the sitemap (and therefore search engines) until the next deploy.
export const revalidate = 60

// Kept in sync by hand with the LEGAL_SLUGS list in next.config.ts --
// both enumerate the same public/legal/<slug>/ documents.
const LEGAL_SLUGS = [
  'terms-of-service',
  'acceptable-use-policy',
  'subscription-billing-refund-policy',
  'privacy-policy',
  'data-processing-addendum',
  'cookie-policy',
  'security-and-subprocessors',
  'microsoft-365-integration',
  'timetrack-desktop-agent-notice',
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPublishedPosts()

  return [
    { url: BASE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE_URL}/practice-management-software-nigeria`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/blog`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/legal`, changeFrequency: 'monthly', priority: 0.3 },
    ...LEGAL_SLUGS.map((slug) => ({
      url: `${BASE_URL}/legal/${slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    })),
    ...MARKETING_MODULES.map((mod) => ({
      url: `${BASE_URL}/modules/${mod.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...posts.map((post) => ({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: post.updated_at,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ]
}
