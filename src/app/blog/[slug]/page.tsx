import Link from 'next/link'
import { notFound } from 'next/navigation'
import Logo from '@/components/brand/logo'
import MarkdownContent from '@/components/blog/markdown-content'
import { getPublishedPost } from '@/lib/blog/get-posts'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPublishedPost(slug)
  if (!post) return { title: 'FirmTrack Blog' }

  return {
    title: `${post.title} — FirmTrack Blog`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      images: post.cover_image_url ? [post.cover_image_url] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      images: post.cover_image_url ? [post.cover_image_url] : undefined,
    },
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPublishedPost(slug)
  if (!post) notFound()

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

      <article className="max-w-3xl mx-auto px-6 py-16 w-full flex-1">
        <Link href="/blog" className="text-sm text-brand-blue hover:underline">
          &larr; Back to blog
        </Link>

        <p className="text-xs text-gray-400 mt-6 mb-2">
          {post.published_at &&
            new Date(post.published_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          {' · '}
          {post.author_name}
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6 leading-tight">{post.title}</h1>

        {post.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_image_url}
            alt=""
            className="w-full h-auto rounded-lg border border-gray-200 mb-8"
          />
        )}

        <MarkdownContent content={post.content} />
      </article>

      <section className="bg-gray-50 border-y border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-14 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-3">Ready to bring this to your firm?</h2>
          <p className="text-gray-600 mb-8">Set up your firm and start using FirmTrack today.</p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/register"
              className="bg-brand-blue text-white font-semibold px-6 py-3 rounded-md hover:bg-brand-blue-hover"
            >
              Get started free
            </Link>
            <Link
              href="/blog"
              className="border border-gray-300 text-gray-700 font-semibold px-6 py-3 rounded-md hover:bg-gray-100"
            >
              More articles
            </Link>
          </div>
        </div>
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
