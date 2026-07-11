import { defineConfig } from 'vitest/config'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/setup/global-setup.ts'],
    setupFiles: ['./tests/setup/load-env.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
