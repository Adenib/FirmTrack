import 'dotenv/config'
import activeWindow from 'active-win'

const INTERVAL_SECONDS = 30
const API_URL = process.env.FIRMTRACK_API_URL
const API_KEY = process.env.FIRMTRACK_API_KEY

if (!API_URL || !API_KEY) {
  console.error(
    'Missing FIRMTRACK_API_URL or FIRMTRACK_API_KEY.\n' +
      'Copy .env.example to .env and fill both in — generate a key from FirmTrack > TimeTrack > Activity Log.'
  )
  process.exit(1)
}

let lastTickAt = Date.now()

async function sendActivity(windowTitle, processName, durationSeconds) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({
        window_title: windowTitle,
        process_name: processName,
        duration_seconds: durationSeconds,
        logged_at: new Date().toISOString(),
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`[firmtrack-agent] API error ${response.status}: ${body}`)
    }
  } catch (err) {
    console.error('[firmtrack-agent] Failed to reach FirmTrack:', err.message)
  }
}

async function tick() {
  const now = Date.now()
  const elapsedSeconds = Math.round((now - lastTickAt) / 1000) || INTERVAL_SECONDS
  lastTickAt = now

  let win
  try {
    win = await activeWindow()
  } catch (err) {
    console.error('[firmtrack-agent] Could not read active window:', err.message)
    return
  }

  if (!win) return

  const windowTitle = win.title || null
  const processName = win.owner?.name || null

  console.log(`[firmtrack-agent] ${processName || 'unknown'} — ${windowTitle || 'untitled'} (${elapsedSeconds}s)`)
  await sendActivity(windowTitle, processName, elapsedSeconds)
}

console.log(`[firmtrack-agent] Started — reporting every ${INTERVAL_SECONDS}s to ${API_URL}`)
setInterval(tick, INTERVAL_SECONDS * 1000)
tick()
