import Link from 'next/link'
import Logo from '@/components/brand/logo'
import { getPublishedPosts } from '@/lib/blog/get-posts'

export const metadata = {
  title: 'Blog — FirmTrack',
  description: 'Practice management, trust accounting, and billing insights for law firms.',
}

export default async function BlogIndexPage() {
  const posts = await getPublishedPosts()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/">
            <Logo size="sm" />
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-gray-700 hover:text-brand-blue">
              Log in
            </Link>
            <Link
              href="/register"
              className="text-sm font-medium bg-brand-blue text-white px-4 py-2 rounded-md hover:bg-brand-blue-hover"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-16 w-full flex-1">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">FirmTrack Blog</h1>
        <p className="text-gray-600 mb-12">Practice management, trust accounting, and billing insights for law firms.</p>

        {posts.length === 0 ? (
          <p className="text-gray-500">No posts yet — check back soon.</p>
        ) : (
          <div className="space-y-10">
            {posts.map((post) => (
              <article key={post.id} className="border-b border-gray-200 pb-10 last:border-0">
                {post.cover_image_url && (
                  <Link href={`/blog/${post.slug}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={post.cover_image_url}
                      alt=""
                      className="w-full h-56 object-cover rounded-lg border border-gray-200 mb-5"
                    />
                  </Link>
                )}
                <p className="text-xs text-gray-400 mb-2">
                  {post.published_at
                    ? new Date(post.published_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : ''}
                </p>
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  <Link href={`/blog/${post.slug}`} className="hover:text-brand-blue">
                    {post.title}
                  </Link>
                </h2>
                <p className="text-gray-600 mb-3">{post.excerpt}</p>
                <Link href={`/blog/${post.slug}`} className="text-sm font-medium text-brand-blue hover:underline">
                  Read more &rarr;
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-gray-200 mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} FirmTrack. All rights reserved.</p>
          <Link href="/terms" className="hover:text-brand-blue">
            User Agreement
          </Link>
        </div>
      </footer>
    </div>
  )
}
