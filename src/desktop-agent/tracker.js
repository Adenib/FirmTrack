const { powerMonitor } = require('electron')
const Store = require('electron-store')

const queueStore = new Store({ name: 'queue', defaults: { entries: [] } })

const MAX_QUEUE_ENTRIES = 500
const IDLE_THRESHOLD_SECONDS = 300 // 5 minutes

let timer = null
let pending = null // { key, windowTitle, processName, durationSeconds }
let getSettings = null
let onStateChange = null // (state: 'active' | 'paused') => void
let flushingQueue = false

function windowKey(win) {
  return `${win?.owner?.name || ''}::${win?.title || ''}`
}

async function getActiveWindowSafe() {
  try {
    const { default: activeWindow } = await import('active-win')
    return await activeWindow()
  } catch (err) {
    console.error('[tracker] active-win failed:', err.message)
    return null
  }
}

// A single call covers both "screen locked" and "idle > threshold" —
// Electron's powerMonitor reports 'locked' | 'idle' | 'active' | 'unknown'.
function getIdleState() {
  try {
    return powerMonitor.getSystemIdleState(IDLE_THRESHOLD_SECONDS)
  } catch {
    return 'active'
  }
}

function enqueue(entry) {
  const entries = queueStore.get('entries', [])
  entries.push(entry)
  while (entries.length > MAX_QUEUE_ENTRIES) entries.shift()
  queueStore.set('entries', entries)
}

function endpointFor(settings) {
  return `${String(settings.serverUrl || '').replace(/\/+$/, '')}/api/timetrack/activity`
}

async function postEntry(settings, entry) {
  const response = await fetch(endpointFor(settings), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': settings.apiKey },
    body: JSON.stringify(entry),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
}

async function sendOrQueue(entry) {
  const settings = getSettings()
  if (!settings.serverUrl || !settings.apiKey) {
    enqueue(entry)
    return
  }
  try {
    await postEntry(settings, entry)
  } catch (err) {
    // Network failure, server down, or bad key — buffer it and retry later
    // rather than losing the tracked time. Never log the API key itself.
    console.error('[tracker] send failed, queueing entry:', err.message)
    enqueue(entry)
  }
}

// Drains previously-queued entries opportunistically. Stops at the first
// failure so we don't hammer a still-unreachable server every tick.
async function flushQueue() {
  if (flushingQueue) return
  flushingQueue = true
  try {
    const settings = getSettings()
    if (!settings.serverUrl || !settings.apiKey) return

    let entries = queueStore.get('entries', [])
    while (entries.length > 0) {
      const [next, ...rest] = entries
      try {
        await postEntry(settings, next)
      } catch {
        break
      }
      entries = rest
      queueStore.set('entries', entries)
    }
  } finally {
    flushingQueue = false
  }
}

async function flushPending() {
  if (!pending) return
  const entry = {
    window_title: pending.windowTitle,
    process_name: pending.processName,
    duration_seconds: pending.durationSeconds,
    logged_at: new Date().toISOString(),
  }
  pending = null
  await sendOrQueue(entry)
}

async function tick() {
  const settings = getSettings()

  if (!settings.tracking) {
    await flushPending()
    onStateChange?.('paused')
    return
  }

  if (getIdleState() !== 'active') {
    await flushPending()
    onStateChange?.('paused')
    return
  }

  const win = await getActiveWindowSafe()
  if (!win) {
    await flushPending()
    onStateChange?.('active')
    return
  }

  const key = windowKey(win)
  const intervalSeconds = Math.max(5, Number(settings.interval) || 30)

  if (pending && pending.key === key) {
    pending.durationSeconds += intervalSeconds
  } else {
    await flushPending()
    pending = {
      key,
      windowTitle: win.title || null,
      processName: win.owner?.name || null,
      durationSeconds: intervalSeconds,
    }
  }

  onStateChange?.('active')
  flushQueue().catch((err) => console.error('[tracker] queue flush error:', err.message))
}

function runTick() {
  tick().catch((err) => console.error('[tracker] tick error:', err.message))
}

function restart() {
  if (timer) clearInterval(timer)
  const settings = getSettings()
  const intervalMs = Math.max(5, Number(settings.interval) || 30) * 1000
  timer = setInterval(runTick, intervalMs)
  runTick()
}

function start({ settingsGetter, onState }) {
  getSettings = settingsGetter
  onStateChange = onState
  restart()
}

async function stop() {
  if (timer) clearInterval(timer)
  timer = null
  await flushPending()
}

function queueLength() {
  return queueStore.get('entries', []).length
}

module.exports = { start, restart, stop, queueLength }
