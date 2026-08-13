import type { MetadataRoute } from 'next'
import { MARKETING_MODULES } from '@/lib/marketing/modules'
import { getPublishedPosts } from '@/lib/blog/get-posts'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPublishedPosts()

  return [
    { url: BASE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE_URL}/blog`, changeFrequency: 'weekly', priority: 0.8 },
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
