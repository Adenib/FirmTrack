import type { NextConfig } from "next";

// The 9 standalone legal documents under public/legal/<slug>/index.html --
// kept as an explicit list (not a wildcard) so the rewrite below can never
// accidentally swallow public/legal/style.css or a typo'd path into a
// confusing 404-after-rewrite.
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
];

const nextConfig: NextConfig = {
  // @sparticuz/chromium's compressed browser binaries are loaded via a
  // runtime-constructed path, so Next.js's static file-tracing analysis
  // misses them and they don't make it into the serverless function
  // bundle by default — causing "input directory .../bin does not exist"
  // at runtime on Vercel. Only the two routes that render invoice PDFs
  // need this.
  outputFileTracingIncludes: {
    '/api/billtrack/invoices/send': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/cron/billtrack-daily': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    // pdfjs-dist requires @napi-rs/canvas inside a try/catch (an
    // optional-dependency pattern) to polyfill DOMMatrix/ImageData/
    // Path2D for Node -- the exact same blind spot as the chromium
    // binaries above: Next.js's static file-tracer never sees that
    // conditional require, so the package (native binary included) gets
    // silently pruned from the deployed function. Confirmed by
    // inspecting the actual .next/**/route.js.nft.json trace manifest --
    // adding @napi-rs/canvas to serverExternalPackages alone did NOT put
    // it in that file; only an explicit include does.
    //
    // npm nests a SEPARATE copy of @napi-rs/canvas under both
    // pdf-parse/node_modules and pdfjs-dist/node_modules (not just the
    // top-level one), and Node's resolution finds whichever is closest
    // to the requiring file -- ** here catches every copy at any depth,
    // not just the top-level one. linux-x64-gnu is the platform variant
    // npm resolves on Vercel's (Linux) build machine, not the win32 one
    // a local Windows install produces, so this can't be fully confirmed
    // from a local build -- only from the actual deployed trace/runtime.
    //
    // The canvas fix alone still wasn't enough: pdfjs-dist also loads
    // pdf.worker.mjs (right next to pdf.mjs) via a runtime-constructed
    // path the tracer can't follow either -- confirmed live ("Cannot
    // find module '.../pdfjs-dist/legacy/build/pdf.worker.mjs'") even
    // with pdfjs-dist already in serverExternalPackages below. Rather
    // than chase individual missing files one deploy at a time, tracing
    // both packages' entire directory trees (cmaps/standard_fonts/wasm
    // included) covers whatever else pdf.js reaches for at runtime.
    '/api/aitrack/document-reviews': [
      './node_modules/**/@napi-rs/canvas/**/*',
      './node_modules/**/@napi-rs/canvas-linux-x64-gnu/**/*',
      './node_modules/pdfjs-dist/**/*',
      './node_modules/pdf-parse/**/*',
    ],
    // Same extractDocumentText() call, same blind spot -- this key is
    // per-route-path, not global, so a new route that also extracts
    // PDF text needs its own copy of the same globs above.
    '/api/aitrack/tabular-reviews': [
      './node_modules/**/@napi-rs/canvas/**/*',
      './node_modules/**/@napi-rs/canvas-linux-x64-gnu/**/*',
      './node_modules/pdfjs-dist/**/*',
      './node_modules/pdf-parse/**/*',
    ],
  },
  // pdf-parse (AITrack's PDF text extraction) resolves its pdf.js worker
  // file via a runtime-relative path -- Next.js's Server Components
  // bundler rewrites/moves the module into .next's chunk layout, breaking
  // that resolution ("Setting up fake worker failed: Cannot find module
  // .../pdf.worker.mjs"). Opting both packages out of bundling lets
  // Node's native require resolve them straight from node_modules, same
  // fix as every other native/runtime-path-dependent dependency here.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  // The old placeholder User Agreement page is superseded by the real,
  // counsel-ready Terms of Service at /legal/terms-of-service.
  async redirects() {
    return [{ source: '/terms', destination: '/legal/terms-of-service', permanent: true }]
  },
  // public/legal/<slug>/index.html is served verbatim at
  // /legal/<slug>/index.html -- these map the clean URLs the documents
  // link to each other with (with and without a trailing slash) onto the
  // actual files. Array-form rewrites are only consulted after the
  // filesystem check, so a literal file match (style.css, or a direct
  // .../index.html request) is always served first and never touches
  // this list.
  async rewrites() {
    return [
      { source: '/legal', destination: '/legal/index.html' },
      { source: '/legal/', destination: '/legal/index.html' },
      ...LEGAL_SLUGS.flatMap((slug) => [
        { source: `/legal/${slug}`, destination: `/legal/${slug}/index.html` },
        { source: `/legal/${slug}/`, destination: `/legal/${slug}/index.html` },
      ]),
    ]
  },
  // Applies to every response Next.js serves, static/prerendered pages
  // included. A per-request CSP nonce (the stricter, more common approach)
  // was tried first in middleware.ts and reverted -- several of this app's
  // pages (login, register, most of HRTrack) are statically prerendered,
  // and a nonce baked into cached HTML at prerender time will never match
  // a fresh nonce middleware generates on a later request, silently
  // breaking hydration on any cache hit. script-src keeps 'unsafe-inline'
  // for Next's own hydration scripts as the pragmatic tradeoff; there's no
  // dangerouslySetInnerHTML anywhere in this codebase, so the classic
  // "attacker-injected inline script" scenario CSP normally guards against
  // isn't the exposed surface here -- connect-src/frame-ancestors/
  // object-src still meaningfully restrict where a compromised script
  // could send data or how the app could be framed.
  async headers() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: ${supabaseUrl}`,
      "font-src 'self'",
      `connect-src 'self' ${supabaseUrl}`,
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      'upgrade-insecure-requests',
    ].join('; ')

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()' },
        ],
      },
    ]
  },
};

export default nextConfig;
