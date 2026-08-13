import { requireCreatorPageAccess } from '@/lib/get-creator-context'
import BlogClient from './blog-client'

export default async function CreatorBlogPage() {
  await requireCreatorPageAccess('blog')
  return <BlogClient />
}
