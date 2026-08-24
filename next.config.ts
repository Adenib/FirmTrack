import type { NextConfig } from "next";

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
  },
  // pdf-parse (AITrack's PDF text extraction) resolves its pdf.js worker
  // file via a runtime-relative path -- Next.js's Server Components
  // bundler rewrites/moves the module into .next's chunk layout, breaking
  // that resolution ("Setting up fake worker failed: Cannot find module
  // .../pdf.worker.mjs"). Opting both packages out of bundling lets
  // Node's native require resolve them straight from node_modules, same
  // fix as every other native/runtime-path-dependent dependency here.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
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
