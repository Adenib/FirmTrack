import { spawn, ChildProcess } from 'child_process'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const APP_URL = 'http://localhost:3000'

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(APP_URL, { signal: AbortSignal.timeout(2000) })
    return res.status < 500
  } catch {
    return false
  }
}

async function waitForServer(timeoutMs: number): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await isServerUp()) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Dev server did not become ready at ${APP_URL} within ${timeoutMs}ms`)
}

// These tests are HTTP integration tests against real running routes, so a
// dev server must be reachable at localhost:3000. Reuse one if it's already
// running (the common case throughout this project's sessions) to avoid
// EADDRINUSE; spawn one otherwise and track it for teardown.
export default async function setup() {
  if (await isServerUp()) {
    console.log(`[tests] Reusing dev server already running at ${APP_URL}`)
    return async () => {}
  }

  console.log('[tests] No dev server detected — spawning `npm run dev`...')
  const child: ChildProcess = spawn('npm', ['run', 'dev'], {
    cwd: process.cwd(),
    shell: true,
    stdio: 'pipe',
    env: process.env,
  })

  child.stdout?.on('data', (d) => process.stdout.write(`[next dev] ${d}`))
  child.stderr?.on('data', (d) => process.stderr.write(`[next dev] ${d}`))

  await waitForServer(60000)
  console.log('[tests] Dev server ready')

  return async () => {
    console.log('[tests] Stopping spawned dev server')
    child.kill()
  }
}
