// Vitest (built on Vite) only auto-loads .env files into import.meta.env,
// not process.env — but every route/helper in this codebase reads
// process.env directly (Node-style), so tests need to load .env.local
// themselves the way `next dev` does automatically for the app itself.
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
