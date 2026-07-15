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
};

export default nextConfig;
