const { powerMonitor, dialog } = require('electron')

// Independent of tracker.js's own (user-configurable, default 30s) tick
// interval on purpose -- WFH-presence checking and time-capture are
// different concerns with different natural cadences, and keeping this in
// its own module/timer avoids touching tracker.js's already-tested tick().
const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const WFH_IDLE_THRESHOLD_SECONDS = 30 * 60 // 30 minutes

let timer = null
let getSettings = null
let armedRecordId = null // attendance_records.id while an open 'remote' record exists, else null
let pendingCheckId = null // wfh_activity_checks.id currently awaiting a response, else null

function endpointFor(settings, path) {
  return `${String(settings.serverUrl || '').replace(/\/+$/, '')}${path}`
}

async function apiGet(settings, path) {
  const response = await fetch(endpointFor(settings, path), { headers: { 'x-api-key': settings.apiKey } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function apiPost(settings, path, body) {
  const response = await fetch(endpointFor(settings, path), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': settings.apiKey },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function apiPatch(settings, path) {
  const response = await fetch(endpointFor(settings, path), {
    method: 'PATCH',
    headers: { 'x-api-key': settings.apiKey },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

// Learns whether this user currently has an open 'remote' attendance
// record -- WFH monitoring only ever arms while one exists.
async function refreshArmedState(settings) {
  try {
    const { record } = await apiGet(settings, '/api/hrtrack/attendance/current')
    armedRecordId = record ? record.id : null
    // Clocked out (or no longer remote) since the last poll -- drop any
    // stale unanswered prompt rather than leaving it dangling forever.
    if (!armedRecordId) pendingCheckId = null
  } catch (err) {
    console.error('[wfh-monitor] failed to refresh attendance status:', err.message)
  }
}

// Native, parent-less dialog (this is a tray-only app, no main window) --
// a single button, since "ignored/closed" and "clicked something else"
// both mean the same thing here: no confirmation was given.
async function showPrompt(settings) {
  try {
    const { check } = await apiPost(settings, '/api/hrtrack/wfh-checks', { attendance_record_id: armedRecordId })
    pendingCheckId = check.id
  } catch (err) {
    console.error('[wfh-monitor] failed to create WFH check:', err.message)
    return
  }

  const result = await dialog.showMessageBox({
    type: 'question',
    message: 'Are you still working from home?',
    detail: "We haven't seen any device activity for a while. Click below to confirm you're still working.",
    buttons: ['Yes, still working'],
    defaultId: 0,
    noLink: true,
  })

  if (result.response === 0 && pendingCheckId) {
    try {
      await apiPatch(settings, `/api/hrtrack/wfh-checks/${pendingCheckId}`)
    } catch (err) {
      console.error('[wfh-monitor] failed to confirm WFH check:', err.message)
    }
  }
  pendingCheckId = null
}

async function tick() {
  const settings = getSettings()
  if (!settings.serverUrl || !settings.apiKey) return

  await refreshArmedState(settings)
  if (!armedRecordId) return
  if (pendingCheckId) return // already waiting on a response -- don't stack prompts

  let idleState = 'active'
  try {
    idleState = powerMonitor.getSystemIdleState(WFH_IDLE_THRESHOLD_SECONDS)
  } catch {
    idleState = 'active'
  }

  if (idleState !== 'active') {
    await showPrompt(settings)
  }
}

function runTick() {
  tick().catch((err) => console.error('[wfh-monitor] tick error:', err.message))
}

function start({ settingsGetter }) {
  getSettings = settingsGetter
  if (timer) clearInterval(timer)
  timer = setInterval(runTick, POLL_INTERVAL_MS)
  runTick()
}

function stop() {
  if (timer) clearInterval(timer)
  timer = null
}

module.exports = { start, stop }
