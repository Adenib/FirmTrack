import { defineConfig } from 'vitest/config'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/setup/global-setup.ts'],
    setupFiles: ['./tests/setup/load-env.ts'],
    // Raised from the default 20s: BillTrack's sendInvoiceEmail() now
    // launches a real local Chromium (via Puppeteer) to render the invoice
    // PDF on every send, and with multiple test files launching it in
    // parallel, CPU contention can push a single launch well past 20s.
    testTimeout: 60000,
    hookTimeout: 30000,
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
