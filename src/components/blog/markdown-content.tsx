import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Renders authored blog content as Markdown, parsed directly into a React
// element tree by react-markdown -- never dangerouslySetInnerHTML, matching
// this codebase's stated position that raw HTML injection isn't used
// anywhere. Shared between the public post page and the Creator Console
// editor's live preview so both always render identically. remarkGfm adds
// GitHub-flavored tables, strikethrough, and autolinks -- plain
// react-markdown silently renders a pipe-table as a raw text paragraph
// without it.
export default function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-3" {...props} />,
          h2: (props) => <h3 className="text-xl font-bold text-gray-900 mt-7 mb-3" {...props} />,
          h3: (props) => <h4 className="text-lg font-semibold text-gray-900 mt-6 mb-2" {...props} />,
          p: (props) => <p className="text-gray-700 leading-relaxed mb-4" {...props} />,
          ul: (props) => <ul className="list-disc pl-6 mb-4 space-y-1 text-gray-700" {...props} />,
          ol: (props) => <ol className="list-decimal pl-6 mb-4 space-y-1 text-gray-700" {...props} />,
          a: (props) => <a className="text-brand-blue hover:underline" {...props} />,
          strong: (props) => <strong className="font-semibold text-gray-900" {...props} />,
          blockquote: (props) => (
            <blockquote className="border-l-4 border-gray-200 pl-4 italic text-gray-600 my-4" {...props} />
          ),
          code: (props) => <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm" {...props} />,
          table: (props) => (
            <div className="overflow-x-auto mb-4">
              <table className="min-w-full border border-gray-200 text-sm" {...props} />
            </div>
          ),
          thead: (props) => <thead className="bg-gray-50" {...props} />,
          th: (props) => (
            <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-900" {...props} />
          ),
          td: (props) => <td className="border border-gray-200 px-3 py-2 text-gray-700" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
